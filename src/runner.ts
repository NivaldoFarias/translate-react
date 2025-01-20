import Bun from "bun";

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
	private readonly maxFiles = process.env.MAX_FILES;
	private stats = {
		results: new Set<ProcessedFileResult>(),
		startTime: Date.now(),
	};

	constructor() {
		try {
			validateEnv();
		} catch (error) {
			this.logger.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		}

		process.on("SIGINT", async () => {
			this.logger.info("SIGINT received, writing results to file");
			this.logger.endProgress();
			await this.writeResultsToFile();

			process.exit(0);
		});
	}

	async run() {
		try {
			this.logger.info("Starting translation workflow");

			const verified = await this.github.verifyTokenPermissions();

			if (!verified) {
				throw new Error("Token permissions verification failed");
			}

			// Try to load snapshot
			const snapshot = await this.snapshotManager.loadLatest();
			if (snapshot) {
				this.logger.info(
					`Found snapshot. Resuming from latest: ${new Date(snapshot.timestamp).toLocaleString()}`,
				);
				this.stats.results = new Set(snapshot.processedResults);

				if (snapshot.filesToTranslate?.length) {
					await this.processInBatches(snapshot.filesToTranslate, 10);
				}

				this.logger.success("Resumed processing completed");
				return;
			}

			const repositoryTree = await this.github.getRepositoryTree("main");
			await this.snapshotManager.append({ repositoryTree });

			this.logger.info(`Repository tree fetched. Fetching files to translate`);

			this.logger.startProgress("Fetching file contents");
			const uncheckedFiles = [];

			for (const [index, file] of repositoryTree.slice(0, this.maxFiles).entries()) {
				this.logger.updateProgress(
					index + 1,
					repositoryTree.length,
					`Fetching file ${index + 1}/${repositoryTree.length}: ${file.path}`,
				);

				uncheckedFiles.push({
					path: file.path,
					content: await this.github.getFileContent(file),
					filename: file.path?.split("/").pop(),
				});
			}

			this.logger.endProgress();

			await this.snapshotManager.append({ uncheckedFiles });

			const filesToTranslate = uncheckedFiles.filter(
				(file) => !this.languageDetector.isFileTranslated(file.content),
			);

			await this.snapshotManager.append({ filesToTranslate });

			this.logger.info(`Found ${filesToTranslate.length} files to translate`);

			await this.processInBatches(filesToTranslate, 10);

			// Save final results
			await this.snapshotManager.append({
				processedResults: Array.from(this.stats.results),
			});

			this.logger.success(`Translation completed`);

			if (process.env.TRANSLATION_ISSUE_NUMBER && this.compiledResults.length > 0) {
				const comment = await this.github.commentCompiledResultsOnIssue(
					process.env.TRANSLATION_ISSUE_NUMBER,
					this.compiledResults,
				);

				this.logger.info(`Commented on translation issue: ${comment.data.html_url}`);
			}

			this.logger.table({
				"Files processed successfully": Array.from(this.stats.results).filter(
					(file) => file.error === null,
				).length,
				"Failed translations": Array.from(this.stats.results).filter((file) => file.error !== null)
					.length,
			});

			// Clear checkpoints after successful completion
			await this.snapshotManager.clear();
		} catch (error) {
			this.logger.error(error instanceof Error ? error.message : "Unknown error");
			process.exit(1);
		} finally {
			const elapsedTime = Math.ceil(Date.now() - this.stats.startTime);

			this.logger.info(`Elapsed time: ${elapsedTime}ms (${Math.ceil(elapsedTime / 1000)}s)`);
			this.logger.endProgress();

			await this.writeResultsToFile();
		}
	}

	private async processInBatches(files: TranslationFile[], batchSize = 10) {
		const batches = [];
		for (let i = 0; i < files.length; i += batchSize) {
			batches.push(files.slice(i, i + batchSize));
		}

		const results = [];

		this.logger.startProgress(`Processing ${batches.length} batches`);

		for (const batch of batches) {
			this.logger.updateProgress(
				batches.indexOf(batch) + 1,
				batches.length,
				`Processing batch ${batches.indexOf(batch) + 1} of ${batches.length}`,
			);

			const batchResults = await Promise.all(batch.map(this.processFile.bind(this)));

			results.push(...batchResults);

			this.logger.success(`Processed batch ${batches.indexOf(batch) + 1} of ${batches.length}`);
		}

		this.logger.endProgress();

		return results;
	}

	private async processFile(file: TranslationFile) {
		let metadata: ProcessedFileResult = {
			branch: null,
			filename: file.filename!,
			translation: null,
			pullRequest: null,
			error: null,
		};

		try {
			metadata.branch = await this.github.createTranslationBranch(file.filename!);
			metadata.translation = await this.translator.translateContent(file);

			const content =
				typeof metadata.translation === "string" ?
					metadata.translation
				:	metadata.translation.choices[0].message.content;

			await this.github.commitTranslation(
				metadata.branch,
				file.path!,
				content ?? "",
				`Translate \`${file.filename}\` to pt-br`,
			);

			metadata.pullRequest = await this.github.createPullRequest(
				metadata.branch.ref,
				`Translate \`${file.filename}\` to pt-br`,
				this.pullRequestDescription,
			);

			this.logger.success(`Processed ${file.filename} successfully`);
		} catch (error) {
			metadata.error = error instanceof Error ? error : new Error(String(error));

			this.logger.error(`Failed to process ${file.filename}`);
		} finally {
			this.stats.results.add(metadata);
		}
	}

	private async writeResultsToFile() {
		if (!this.stats.results.size) return;

		await Bun.write(`logs/session-${Date.now()}.json`, JSON.stringify(this.stats.results));
	}

	private get pullRequestDescription() {
		return `This pull request contains a translation of the referenced page into Portuguese (pt-BR). The translation was generated using OpenAI _(model \`${process.env.OPENAI_MODEL}\`)_.

Refer to the [source repository](https://github.com/${process.env.REPO_OWNER}/translate-react) workflow that generated this translation for more details.

Feel free to review and suggest any improvements to the translation.`;
	}

	private get compiledResults() {
		return Array.from(this.stats.results).filter((file) => file.pullRequest);
	}
}
