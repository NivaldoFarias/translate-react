import type { TranslationFile } from "./types";

import { GitHubService } from "./services/github";
import { LanguageDetector } from "./services/language-detector";
import { TranslatorService } from "./services/translator";
import Logger from "./utils/logger";
import { ParallelProcessor } from "./utils/parallelProcessor";

class Runner {
	private readonly logger = new Logger();
	private readonly github = new GitHubService(this.logger);
	private readonly translator = new TranslatorService();
	private readonly languageDetector = new LanguageDetector();
	private readonly maxFiles =
		process.env["MAX_FILES"] ? parseInt(process.env["MAX_FILES"]!) : undefined;
	private stats = {
		processed: 0,
		translated: 0,
		failed: 0,
		branches: 0,
		startTime: Date.now(),
	};
	private readonly sessionId = Date.now();
	private results: { results: any[]; errors: any[] } = { results: [], errors: [] };

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

			this.logger.info(`Found ${filesToTranslate.length} files to translate`);

			this.logger.startProgress("Processing files...");
			const parallelProcessor = new ParallelProcessor();

			const processFile = async (file: TranslationFile) => {
				try {
					const branch = await this.github.createTranslationBranch(file.filename!);
					const translation = await this.translator.translateContent(file);

					await this.github.commitTranslation(
						branch,
						file.path!,
						translation,
						`Translate ${file.filename} to pt-br`,
					);

					this.logger.success(`Translated ${file.filename} to pt-br`);

					this.stats.translated++;

					return {
						branch,
						translation,
					};
				} catch (error) {
					this.stats.failed++;
					this.logger.error(`Failed: ${file.filename}`);

					return {
						error: error instanceof Error ? error.message : "Unknown error",
					};
				}
			};

			this.results = await parallelProcessor.parallel(filesToTranslate, processFile, {
				batchSize: 5,
				maxConcurrent: 3,
				delayBetweenBatches: 1000,
			});

			this.logger.success(`Translation completed`);

			this.logger.table({
				"Files processed": this.stats.processed,
				"Translations completed": this.stats.translated,
				"Failed translations": this.stats.failed,
				"Branches created": this.stats.branches,
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

	private async writeResultsToFile() {
		await Bun.write(`logs/session-${this.sessionId}.json`, JSON.stringify(this.results, null, 2));
	}
}

void new Runner().run();
