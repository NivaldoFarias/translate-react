import Bun from "bun";

import type { RestEndpointMethodTypes } from "@octokit/rest";
import type { ChatCompletion } from "openai/resources";

import type { TranslationFile } from "./types";

import { GitHubService } from "./services/github";
import { LanguageDetector } from "./services/language-detector";
import { TranslatorService } from "./services/translator";
import Logger from "./utils/logger";

export interface ProcessedFileResult {
	branch: string | null;
	filename: string;
	translation: ChatCompletion | string | null;
	pullRequest: RestEndpointMethodTypes["pulls"]["create"]["response"]["data"] | null;
	error: Error | null;
}

export default class Runner {
	private readonly logger = new Logger();
	private readonly github = new GitHubService(this.logger);
	private readonly translator = new TranslatorService();
	private readonly languageDetector = new LanguageDetector();
	private readonly maxFiles =
		process.env["MAX_FILES"] ? parseInt(process.env["MAX_FILES"]!) : undefined;
	private stats = {
		results: new Set<ProcessedFileResult>(),
		startTime: Date.now(),
	};

	constructor() {
		const requiredEnvVars = ["GITHUB_TOKEN", "REPO_OWNER", "REPO_NAME"];
		const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);

		if (missingEnvVars.length > 0) {
			this.logger.error(`Missing required environment variables: ${missingEnvVars.join(", ")}`);
			this.logger.info("Please create a .env file with the following variables:");
			this.logger.info(`
				GITHUB_TOKEN=your_github_token
				REPO_OWNER=target_repo_owner
				REPO_NAME=target_repo_name
				MAX_FILES=10 (optional, defaults to all files)
			`);

			process.exit(1);
		}

		process.on("SIGINT", async () => {
			this.logger.info("SIGINT received, writing results to file");
			this.logger.endProgress();
			await this.writeResultsToFile();

			process.exit(0);
		});
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

	async run() {
		try {
			this.logger.info("Starting translation workflow");

			const repositoryTree = await this.github.getRepositoryTree("main");

			this.logger.info(`Repository tree fetched. Fetching files to translate`);

			const uncheckedFiles = await Promise.all(
				repositoryTree.slice(0, this.maxFiles).map(async (file) => {
					return {
						path: file.path,
						content: await this.github.getFileContent(file),
						filename: file.path?.split("/").pop(),
					};
				}),
			);

			const filesToTranslate = uncheckedFiles.filter(
				(file) => !this.languageDetector.isFileTranslated(file.content),
			);

			this.logger.info(`Found ${filesToTranslate.length} files to translate`);

			await this.processInBatches(filesToTranslate, 10);

			this.logger.success(`Translation completed`);

			if (process.env["TRANSLATION_ISSUE_NUMBER"] && this.compiledResults.length > 0) {
				const comment = await this.github.commentCompiledResultsOnIssue(
					Number.parseInt(process.env["TRANSLATION_ISSUE_NUMBER"]),
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

	private async processFile(file: TranslationFile) {
		let metadata: ProcessedFileResult = {
			branch: null,
			filename: file.filename!,
			translation: null,
			pullRequest: null,
			error: null,
		};

		try {
			this.logger.info(`Processing ${file.filename}`);

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
				metadata.branch,
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
		return `
			This pull request contains a translation of the referenced page into Portuguese (pt-BR). The translation was generated using OpenAI _(model \`${process.env["OPENAI_MODEL"]}\`)_.

			Refer to the source repository workflow that generated this translation for more details: https://github.com/${process.env["REPO_OWNER"]}/translate-react

			Feel free to review and suggest any improvements to the translation.
		`;
	}

	private get compiledResults() {
		return Array.from(this.stats.results).filter((file) => file.pullRequest);
	}
}
