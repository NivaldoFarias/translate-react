import ora from "ora";

import type { RestEndpointMethodTypes } from "@octokit/rest";
import type { ChatCompletion } from "openai/resources/chat/completions.mjs";
import type { Ora } from "ora";

import type { TranslationFile } from "./types";

import { GitHubService } from "./services/github";
import { LanguageDetector } from "./services/language-detector";
import { SnapshotManager } from "./services/snapshot-manager";
import { TranslatorService } from "./services/translator";
import { validateEnv } from "./utils/env";

export interface ProcessedFileResult {
	branch: RestEndpointMethodTypes["git"]["getRef"]["response"]["data"] | null;
	filename: string;
	translation: ChatCompletion | string | null;
	pullRequest:
		| RestEndpointMethodTypes["pulls"]["create"]["response"]["data"]
		| RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number]
		| null;
	error: Error | null;
}

export default class Runner {
	private readonly github = new GitHubService();
	private readonly translator = new TranslatorService();
	private readonly languageDetector = new LanguageDetector({
		source: import.meta.env.SOURCE_LANGUAGE!,
		target: import.meta.env.TARGET_LANGUAGE!,
	});
	private readonly snapshotManager = new SnapshotManager();
	private get maxFiles(): number | undefined {
		return import.meta.env.NODE_ENV === "production" ? undefined : 10;
	}
	private stats = {
		results: new Map<ProcessedFileResult["filename"], ProcessedFileResult>(),
		startTime: Date.now(),
	};
	private spinner: Ora | null = null;

	private cleanup = () => {
		this.spinner?.stop();
		// Force exit after a timeout to ensure cleanup handlers run
		setTimeout(() => void process.exit(0), 1000);
	};

	constructor() {
		try {
			validateEnv();
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		}

		process.on("SIGINT", this.cleanup);
		process.on("SIGTERM", this.cleanup);
		process.on("uncaughtException", (error) => {
			console.error(`Uncaught exception: ${error.message}`);
			this.cleanup();
		});
	}

	public async run() {
		try {
			if (!this.spinner) {
				this.spinner = ora({
					text: "Starting translation workflow",
					color: "cyan",
					spinner: "dots",
				}).start();
			}

			if (!(await this.github.verifyTokenPermissions())) {
				this.spinner.fail("Token permissions verification failed");
				throw new Error("Token permissions verification failed");
			}

			let snapshot = (await this.snapshotManager.loadLatest()) || {
				repositoryTree: [],
				filesToTranslate: [],
				processedResults: [],
				timestamp: Date.now(),
			};

			if (!snapshot.repositoryTree?.length) {
				this.spinner.text = "Fetching repository tree...";

				snapshot.repositoryTree = await this.github.getRepositoryTree("main");
				await this.snapshotManager.append("repositoryTree", snapshot.repositoryTree);
				this.spinner.succeed("Repository tree fetched");
			} else {
				this.spinner.stopAndPersist({
					symbol: "📦",
					text: "Repository tree already fetched",
				});
				this.spinner.start();
			}

			if (!snapshot.filesToTranslate?.length) {
				const uncheckedFiles: TranslationFile[] = [];

				for (const [index, file] of snapshot.repositoryTree.slice(0, this.maxFiles).entries()) {
					this.spinner.text = `Fetching file ${index + 1}/${snapshot.repositoryTree.length}: ${file.path}`;

					if (uncheckedFiles.find((compareFile) => compareFile.path === file.path)) continue;

					uncheckedFiles.push({
						content: await this.github.getFileContent(file),
						filename: file.path?.split("/").pop(),
						...file,
					});
				}

				this.spinner.stop();

				const filesToTranslate = uncheckedFiles.filter(
					(file) => !this.languageDetector.isFileTranslated(file.content as string),
				);

				await this.snapshotManager.append("filesToTranslate", filesToTranslate);

				snapshot.filesToTranslate = filesToTranslate;

				this.spinner.succeed(`Found ${filesToTranslate.length} files to translate`);
				this.spinner.start();
			} else {
				this.spinner.stopAndPersist({
					symbol: "📦",
					text: `Found ${snapshot.filesToTranslate.length} files to translate`,
				});
				this.spinner.start();
			}

			await this.processInBatches(snapshot.filesToTranslate, 10);

			snapshot.processedResults = Array.from(this.stats.results.values());

			await this.snapshotManager.append("processedResults", snapshot.processedResults);

			this.spinner.succeed("Translation completed");

			if (
				import.meta.env.NODE_ENV === "production" &&
				import.meta.env.TRANSLATION_ISSUE_NUMBER &&
				snapshot.processedResults.length > 0
			) {
				this.spinner.text = "Commenting on issue...";
				const comment = await this.github.commentCompiledResultsOnIssue(
					import.meta.env.TRANSLATION_ISSUE_NUMBER,
					snapshot.processedResults,
				);
				this.spinner.succeed(`Commented on translation issue: ${comment.html_url}`);
			}

			// Use stopAndPersist for final statistics
			this.spinner.stopAndPersist({
				symbol: "📊",
				text: "Final Statistics",
			});

			console.table({
				"Files processed successfully": Array.from(this.stats.results.values()).filter(
					(file) => file.error === null,
				).length,
				"Failed translations": Array.from(this.stats.results.values()).filter(
					(file) => file.error !== null,
				).length,
			});

			if (import.meta.env.NODE_ENV === "production") {
				await this.snapshotManager.clear();
			}
		} catch (error) {
			this.spinner?.fail(error instanceof Error ? error.message : "Unknown error");
			process.exit(1);
		} finally {
			const elapsedTime = Math.ceil(Date.now() - this.stats.startTime);
			this.spinner?.stopAndPersist({
				symbol: "⏱️",
				text: `Elapsed time: ${elapsedTime}ms (${Math.ceil(elapsedTime / 1000)}s)`,
			});
		}
	}

	private async processInBatches(files: TranslationFile[], batchSize = 10) {
		if (!this.spinner) {
			this.spinner = ora({
				text: "Processing files",
				color: "cyan",
				spinner: "dots",
			}).start();
		}

		const batches = [];
		for (let i = 0; i < files.length; i += batchSize) {
			batches.push(files.slice(i, i + batchSize));
		}

		for (const [batchIndex, batch] of batches.entries()) {
			this.spinner!.text = `Processing batch ${batchIndex + 1}/${batches.length}`;

			await Promise.all(
				batch.map((file, fileIndex) => {
					const progress = {
						batchIndex: batchIndex + 1,
						fileIndex,
						totalBatches: batches.length,
						batchSize,
					};

					return this.processFile(file, progress);
				}),
			);

			this.spinner!.succeed(`Completed batch ${batchIndex + 1}/${batches.length}`);

			if (batchIndex < batches.length - 1) this.spinner!.start();
		}
	}

	private async processFile(
		file: TranslationFile,
		progress: { batchIndex: number; fileIndex: number; totalBatches: number; batchSize: number },
	) {
		const metadata = this.stats.results.get(file.filename!) || {
			branch: null,
			filename: file.filename!,
			translation: null,
			pullRequest: null,
			error: null,
		};

		const suffixText = `[${progress.fileIndex + 1}/${progress.batchSize}]`;

		try {
			if (!metadata.branch) {
				this.spinner!.suffixText = `${suffixText} Creating branch for ${file.filename}`;
				metadata.branch = await this.github.createTranslationBranch(file.filename!);
			}

			const commitExists = await this.github.checkIfCommitExistsOnFork();

			if (!metadata.translation) {
				this.spinner!.suffixText = `${suffixText} Translating ${file.filename}`;
				metadata.translation =
					commitExists ?
						await this.github.getFileContent(file)
					:	await this.translator.translateContent(file);
			}

			if (!commitExists) {
				this.spinner!.suffixText = `${suffixText} Committing ${file.filename}`;
				const content =
					typeof metadata.translation === "string" ?
						metadata.translation
					:	metadata.translation?.choices[0]?.message?.content;

				await this.github.commitTranslation(
					metadata.branch,
					file,
					content ?? "",
					`Translate \`${file.filename}\` to pt-br`,
				);
			}

			if (!metadata.pullRequest) {
				this.spinner!.suffixText = `${suffixText} Creating PR for ${file.filename}`;
				metadata.pullRequest = await this.github.createPullRequest(
					metadata.branch.ref,
					`Translate \`${file.filename}\` to pt-br`,
					this.pullRequestDescription,
				);
			}
		} catch (error) {
			metadata.error = error instanceof Error ? error : new Error(String(error));
			this.spinner!.suffixText = `${suffixText} Failed: ${file.filename}`;
		} finally {
			this.stats.results.set(file.filename!, metadata);
		}
	}

	private get pullRequestDescription() {
		return `This pull request contains a translation of the referenced page into Portuguese (pt-BR). The translation was generated using OpenAI _(model \`${import.meta.env.LLM_MODEL}\`)_.

Refer to the [source repository](https://github.com/${import.meta.env.REPO_OWNER}/translate-react) workflow that generated this translation for more details.

Feel free to review and suggest any improvements to the translation.`;
	}
}
