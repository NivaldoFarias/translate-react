import type { TranslationFile } from "./types";

import { GitHubService } from "./services/github";
import { LanguageDetector } from "./services/language-detector";
import { TranslatorService } from "./services/translator";
import Logger from "./utils/logger";

class Runner {
	private readonly logger = new Logger();
	private readonly github = new GitHubService(this.logger);
	private readonly translator = new TranslatorService();
	private readonly languageDetector = new LanguageDetector();
	private readonly maxFiles =
		process.env["MAX_FILES"] ? parseInt(process.env["MAX_FILES"]!) : undefined;
	private stats = {
		processed: 0,
		failed: 0,
		startTime: Date.now(),
	};
	private results: { branch: string | null; translation: string | null; error: string | null }[] =
		[];

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

	private async processBatch(files: TranslationFile[], batchSize = 10) {
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

			this.logger.success(`Found ${filesToTranslate.length} files to translate`);

			this.results = await this.processBatch(filesToTranslate, 10);

			this.logger.success(`Translation completed`);

			this.logger.table({
				"Files processed": this.stats.processed,
				"Failed translations": this.stats.failed,
				"Elapsed time": `${Math.ceil(Date.now() - this.stats.startTime)}ms`,
			});
		} catch (error) {
			this.logger.error(error instanceof Error ? error.message : "Unknown error");
			this.logger.table({
				"Elapsed time": `${Math.ceil(Date.now() - this.stats.startTime)}ms`,
			});

			process.exit(1);
		} finally {
			this.logger.endProgress();
			await this.writeResultsToFile();
		}
	}

	private async processFile(file: TranslationFile) {
		try {
			this.logger.info(`Processing ${file.filename}`);

			const branch = await this.github.createTranslationBranch(file.filename!);
			const translation = await this.translator.translateContent(file);

			await this.github.commitTranslation(
				branch,
				file.path!,
				translation,
				`Translate \`${file.filename}\` to pt-br`,
			);

			await this.github.createPullRequest(
				branch,
				`Translate \`${file.filename}\` to pt-br`,
				this.pullRequestDescription,
			);

			this.logger.success(`Processed ${file.filename} successfully`);

			this.stats.processed++;

			return {
				branch,
				translation,
				error: null,
			};
		} catch (error) {
			this.stats.failed++;
			this.logger.error(`Failed to process ${file.filename}`);

			return {
				error: error instanceof Error ? error.message : "Unknown error",
				branch: null,
				translation: null,
			};
		}
	}

	private async writeResultsToFile() {
		await Bun.write(
			`logs/session-${this.stats.startTime}.json`,
			JSON.stringify({ results: this.results, stats: this.stats }, null, 2),
		);
	}

	private get pullRequestDescription() {
		return `
			This pull request contains a translation of the referenced page into Portuguese (pt-BR). The translation was generated using OpenAI _(model \`${process.env["OPENAI_MODEL"]}\`)_.

			Refer to the source repository workflow that generated this translation for more details: https://github.com/${process.env["REPO_OWNER"]}/translate-react

			Feel free to review and suggest any improvements to the translation.
		`;
	}
}

void new Runner().run();
