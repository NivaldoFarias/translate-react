import { GitHubService } from "./services/github";
import { LanguageDetector } from "./services/language-detector";
import { TranslatorService } from "./services/translator";
import { TranslationError } from "./utils/errors";
import Logger from "./utils/logger";

class Runner {
	private readonly logger = new Logger();
	private readonly github = new GitHubService();
	private readonly translator = new TranslatorService();
	private readonly languageDetector = new LanguageDetector();
	private stats = {
		processed: 0,
		translated: 0,
		failed: 0,
		branches: 0,
		startTime: Date.now(),
	};
	private readonly maxFiles =
		process.env["MAX_FILES"] ? parseInt(process.env["MAX_FILES"]!) : undefined;

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

			for (const [index, file] of filesToTranslate.entries()) {
				this.stats.processed++;
				const remainingFiles = filesToTranslate.length - this.stats.processed;
				const elapsedMinutes = (Date.now() - this.stats.startTime) / (1000 * 60);
				const avgTimePerFile = this.stats.processed > 0 ? elapsedMinutes / this.stats.processed : 0;
				const estimatedRemaining = Math.ceil(remainingFiles * avgTimePerFile);

				this.logger.progress(
					this.stats.processed,
					filesToTranslate.length,
					`[${index + 1}/${filesToTranslate.length}] Processing "${file.filename}" (${estimatedRemaining}m remaining)`,
				);

				try {
					const branch = await this.github.createTranslationBranch(file.filename!);

					this.stats.branches++;
					this.logger.info(`Creating branch ${branch} for ${file.path}`);

					const translation = await this.translator.translateContent(file);

					this.logger.info(`Translated ${file.filename} to pt-br`);

					await this.github.commitTranslation(
						branch,
						file.path!,
						translation,
						`Translate ${file.filename} to pt-br`,
					);

					this.stats.translated++;
				} catch (error) {
					this.stats.failed++;
					if (error instanceof TranslationError) {
						this.logger.error(`Failed: ${file.filename} [${error.code}] ${error.message}`);
					} else {
						this.logger.error(`Failed: ${file.filename}`);
					}
				}
			}

			const totalMinutes = Math.ceil((Date.now() - this.stats.startTime) / (1000 * 60));
			this.logger.success(`Translation completed in ${totalMinutes} minutes`);
			this.logger.info(`
				Summary:
				-	Files processed: ${this.stats.processed}
				-	Translations completed: ${this.stats.translated}
				-	Failed translations: ${this.stats.failed}
				-	Branches created: ${this.stats.branches}
				-	Total time: ${totalMinutes} minutes
			`);
		} catch (error) {
			this.logger.error(error instanceof Error ? error.message : "Unknown error");
			process.exit(1);
		}
	}
}

void new Runner().run();
