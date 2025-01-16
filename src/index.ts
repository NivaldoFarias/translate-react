import type { TranslationData, TranslationStatus } from "./scripts/analyze-translations";

import output from "./scripts/output.json";
import { GitHubService } from "./services/github";
import { TranslatorService } from "./services/translator";
import { TranslationError } from "./utils/errors";
import Logger from "./utils/logger";

async function main() {
	const logger = new Logger();

	// Validate required environment variables
	const requiredEnvVars = ["GITHUB_TOKEN", "REPO_OWNER", "REPO_NAME"];
	const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);

	if (missingEnvVars.length > 0) {
		logger.error(`Missing required environment variables: ${missingEnvVars.join(", ")}`);
		logger.info("Please create a .env file with the following variables:");
		logger.info(`
GITHUB_TOKEN=your_github_token
REPO_OWNER=target_repo_owner
REPO_NAME=target_repo_name
MAX_FILES=10 (optional, defaults to all files)`);
		process.exit(1);
	}

	const github = new GitHubService(
		process.env["REPO_OWNER"]!,
		process.env["REPO_NAME"]!,
		process.env["GITHUB_TOKEN"]!,
	);
	const translator = new TranslatorService();

	const stats = {
		processed: 0,
		translated: 0,
		failed: 0,
		branches: 0,
		startTime: Date.now(),
	};

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
		const filesToProcess = maxFiles ? pendingTranslations.slice(0, maxFiles) : pendingTranslations;

		logger.info(`Found ${filesToProcess.length} files to translate`);

		for (const item of filesToProcess) {
			stats.processed++;
			const remainingFiles = filesToProcess.length - stats.processed;
			const elapsedMinutes = (Date.now() - stats.startTime) / (1000 * 60);
			const avgTimePerFile = stats.processed > 0 ? elapsedMinutes / stats.processed : 0;
			const estimatedRemaining = Math.ceil(remainingFiles * avgTimePerFile);

			const filePath = `content/${item.section.toLowerCase()}/${item.title
				.toLowerCase()
				.replace(/[<>]/g, "")
				.replace(/\s+/g, "-")}.md`;

			logger.progress(
				stats.processed,
				filesToProcess.length,
				`Processing ${filePath} (${estimatedRemaining}m remaining)`,
			);

			try {
				// Get the current file content and sha from GitHub
				const fileContent = await github.getFileContent(filePath);
				const branch = await github.createTranslationBranch();
				stats.branches++;

				const translation = await translator.translateContent(
					{
						path: filePath,
						content: fileContent.content,
						sha: fileContent.sha,
					},
					item.title,
				);

				await github.commitTranslation(
					branch,
					filePath,
					translation,
					`Translate ${item.title} to Brazilian Portuguese`,
				);

				stats.translated++;
			} catch (error) {
				stats.failed++;
				if (error instanceof TranslationError) {
					logger.error(`Failed: ${item.title} [${error.code}] ${error.message}`);
				} else {
					logger.error(`Failed: ${item.title}`);
				}
			}
		}

		const totalMinutes = Math.ceil((Date.now() - stats.startTime) / (1000 * 60));
		logger.success(`Translation completed in ${totalMinutes} minutes`);
		logger.info(`Summary:
    Files processed: ${stats.processed}
    Translations completed: ${stats.translated}
    Failed translations: ${stats.failed}
    Branches created: ${stats.branches}
    Total time: ${totalMinutes} minutes`);
	} catch (error) {
		logger.error("Fatal error during translation process");
		process.exit(1);
	}
}

main();
