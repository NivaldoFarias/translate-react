import type { RestEndpointMethodTypes } from "@octokit/rest";
import type { ChatCompletion } from "openai/resources";

import type { TranslationFile } from "./types";

import { GitHubService } from "./services/github";
import { LanguageDetector } from "./services/language-detector";
import { SnapshotManager } from "./services/snapshot-manager";
import { TranslatorService } from "./services/translator";
import { validateEnv } from "./utils/env";
import Logger from "./utils/logger";

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
	private readonly logger = new Logger();
	private readonly github = new GitHubService(this.logger);
	private readonly translator = new TranslatorService();
	private readonly languageDetector = new LanguageDetector();
	private readonly snapshotManager = new SnapshotManager(this.logger);
	private readonly maxFiles = import.meta.env.MAX_FILES;
	private stats = {
		results: new Map<ProcessedFileResult["filename"], ProcessedFileResult>(),
		startTime: Date.now(),
	};

	private cleanup = () => {
		this.logger?.endProgress();

		// Force exit after a timeout to ensure cleanup handlers run
		setTimeout(() => process.exit(0), 1000);
	};

	constructor() {
		try {
			validateEnv();
		} catch (error) {
			this.logger.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		}

		process.on("SIGINT", this.cleanup);
		process.on("SIGTERM", this.cleanup);
		process.on("uncaughtException", (error) => {
			this.logger.error(`Uncaught exception: ${error.message}`);
			this.cleanup();
		});
	}

	public async run() {
		try {
			this.logger.info("Starting translation workflow");

			if (!(await this.github.verifyTokenPermissions())) {
				throw new Error("Token permissions verification failed");
			}

			let snapshot = (await this.snapshotManager.loadLatest()) || {
				repositoryTree: [],
				filesToTranslate: [],
				processedResults: [],
				timestamp: Date.now(),
			};

			if (!snapshot.repositoryTree?.length) {
				snapshot.repositoryTree = await this.github.getRepositoryTree("main");

				await this.snapshotManager.append("repositoryTree", snapshot.repositoryTree);

				this.logger.info(`Repository tree fetched`);
			} else {
				this.logger.info(`Repository tree already fetched`);
			}

			if (!snapshot.filesToTranslate?.length) {
				const uncheckedFiles: TranslationFile[] = [];

				for (const [index, file] of snapshot.repositoryTree.slice(0, this.maxFiles).entries()) {
					this.logger.updateProgress(
						index + 1,
						snapshot.repositoryTree.length,
						`Fetching file ${index + 1}/${snapshot.repositoryTree.length}: ${file.path}`,
					);

					if (uncheckedFiles.find((compareFile) => compareFile.path === file.path)) continue;

					uncheckedFiles.push({
						content: await this.github.getFileContent(file),
						filename: file.path?.split("/").pop(),
						...file,
					});
				}

				this.logger.endProgress();

				const filesToTranslate = uncheckedFiles.filter(
					(file) => !this.languageDetector.isFileTranslated(file.content),
				);

				await this.snapshotManager.append("filesToTranslate", filesToTranslate);

				snapshot.filesToTranslate = filesToTranslate;

				this.logger.info(`Found ${filesToTranslate.length} files to translate`);
			} else {
				this.logger.info(`Found ${snapshot.filesToTranslate.length} files to translate`);
			}

			await this.processInBatches(snapshot.filesToTranslate, 10);

			snapshot.processedResults = Array.from(this.stats.results.values());

			await this.snapshotManager.append("processedResults", snapshot.processedResults);

			this.logger.success(`Translation completed`);

			if (
				import.meta.env.NODE_ENV === "production" &&
				import.meta.env.TRANSLATION_ISSUE_NUMBER &&
				snapshot.processedResults.length > 0
			) {
				const comment = await this.github.commentCompiledResultsOnIssue(
					import.meta.env.TRANSLATION_ISSUE_NUMBER,
					snapshot.processedResults,
				);

				this.logger.info(`Commented on translation issue: ${comment.html_url}`);
			}

			this.logger.table({
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
			this.logger.error(error instanceof Error ? error.message : "Unknown error");
			process.exit(1);
		} finally {
			const elapsedTime = Math.ceil(Date.now() - this.stats.startTime);

			this.logger.info(`Elapsed time: ${elapsedTime}ms (${Math.ceil(elapsedTime / 1000)}s)`);
			this.logger.endProgress();
		}
	}

	private async processInBatches(files: TranslationFile[], batchSize = 10) {
		const batches = [];
		for (let i = 0; i < files.length; i += batchSize) {
			batches.push(files.slice(i, i + batchSize));
		}

		this.logger.startProgress(`Processing ${batches.length} batches`);

		for (const batch of batches) {
			this.logger.updateProgress(
				batches.indexOf(batch) + 1,
				batches.length,
				`Processing batch ${batches.indexOf(batch) + 1} of ${batches.length}`,
			);

			await Promise.all(batch.map(this.processFile.bind(this)));

			this.logger.success(`Processed batch ${batches.indexOf(batch) + 1} of ${batches.length}`);
		}

		this.logger.endProgress();
	}

	private async processFile(file: TranslationFile) {
		const metadata = this.stats.results.get(file.filename!) || {
			branch: null,
			filename: file.filename!,
			translation: null,
			pullRequest: null,
			error: null,
		};

		try {
			if (!metadata.branch) {
				metadata.branch = await this.github.createTranslationBranch(file.filename!);
			}

			const commitExists = await this.github.checkIfCommitExistsOnFork();

			if (!metadata.translation) {
				metadata.translation =
					commitExists ?
						await this.github.getFileContent(file)
					:	await this.translator.translateContent(file);
			}

			if (commitExists) {
				this.logger.info(`Branch ${metadata.branch.ref} already has a commit for ${file.filename}`);
			} else {
				const content =
					typeof metadata.translation === "string" ?
						metadata.translation
					:	metadata.translation?.choices[0].message.content;

				await this.github.commitTranslation(
					metadata.branch,
					file,
					content ?? "",
					`Translate \`${file.filename}\` to pt-br`,
				);
			}

			if (!metadata.pullRequest) {
				metadata.pullRequest = await this.github.createPullRequest(
					metadata.branch.ref,
					`Translate \`${file.filename}\` to pt-br`,
					this.pullRequestDescription,
				);
			}

			this.logger.success(`Processed ${file.filename} successfully`);
		} catch (error) {
			metadata.error = error instanceof Error ? error : new Error(String(error));

			this.logger.error(`Failed to process ${file.filename}`);
		} finally {
			this.stats.results.set(file.filename!, metadata);
		}
	}

	private get pullRequestDescription() {
		return `This pull request contains a translation of the referenced page into Portuguese (pt-BR). The translation was generated using OpenAI _(model \`${import.meta.env.OPENAI_MODEL}\`)_.

Refer to the [source repository](https://github.com/${import.meta.env.REPO_OWNER}/translate-react) workflow that generated this translation for more details.

Feel free to review and suggest any improvements to the translation.`;
	}
}
