import type { TranslationData, TranslationStatus } from "./scripts/analyze-translations";

import output from "./scripts/output.json";
import { GitHubService } from "./services/github";
import { TranslatorService } from "./services/translator";
import { TranslationError } from "./utils/errors";
import Logger from "./utils/logger";

class Runner {
	private readonly logger = new Logger();
	private readonly github = new GitHubService();
	private readonly translator = new TranslatorService();
	private stats = {
		processed: 0,
		translated: 0,
		failed: 0,
		branches: 0,
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
	}

	async run() {
		try {
			// Get max files from environment or use undefined for all files
			const maxFiles = process.env["MAX_FILES"] ? parseInt(process.env["MAX_FILES"]!) : undefined;

			// Extract pending translations from the JSON data
			const pendingTranslations: TranslationStatus[] = [];
			const translationData = output as TranslationData;

			for (const section of Object.values(translationData.sections)) {
				// Add items from main section
				pendingTranslations.push(...section.items.filter((item) => item.status === "PENDING"));

				// Add items from subsections
				for (const subsectionItems of Object.values(section.subsections)) {
					pendingTranslations.push(...subsectionItems.filter((item) => item.status === "PENDING"));
				}
			}

			// Limit the number of files if maxFiles is specified
			const filesToProcess =
				maxFiles ? pendingTranslations.slice(0, maxFiles) : pendingTranslations;

			this.logger.info(`Found ${filesToProcess.length} files to translate`);

			for (const item of filesToProcess) {
				this.stats.processed++;
				const remainingFiles = filesToProcess.length - this.stats.processed;
				const elapsedMinutes = (Date.now() - this.stats.startTime) / (1000 * 60);
				const avgTimePerFile = this.stats.processed > 0 ? elapsedMinutes / this.stats.processed : 0;
				const estimatedRemaining = Math.ceil(remainingFiles * avgTimePerFile);

				const filePath = `content/${item.section.toLowerCase()}/${item.title
					.toLowerCase()
					.replace(/[<>]/g, "")
					.replace(/\s+/g, "-")}.md`;

				this.logger.progress(
					this.stats.processed,
					filesToProcess.length,
					`Processing ${filePath} (${estimatedRemaining}m remaining)`,
				);

				try {
					// Get the current file content and sha from GitHub
					const fileContent = await this.github.getFileContent(filePath);
					const branch = await this.github.createTranslationBranch();
					this.stats.branches++;

					const translation = await this.translator.translateContent(
						{
							path: filePath,
							content: fileContent.content,
							sha: fileContent.sha,
						},
						item.title,
					);

					await this.github.commitTranslation(
						branch,
						filePath,
						translation,
						`Translate ${item.title} to Brazilian Portuguese`,
					);

					this.stats.translated++;
				} catch (error) {
					this.stats.failed++;
					if (error instanceof TranslationError) {
						this.logger.error(`Failed: ${item.title} [${error.code}] ${error.message}`);
					} else {
						this.logger.error(`Failed: ${item.title}`);
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
