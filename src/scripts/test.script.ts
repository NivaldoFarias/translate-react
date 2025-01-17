import Bun from "bun";

import { GitHubService } from "../services/github";
import { LanguageDetector } from "../services/language-detector";
import { TranslatorService } from "../services/translator";
import Logger from "../utils/logger";

const args = Bun.argv.slice(2);

if (args.includes("logger") && !args.includes("workflow")) {
	void testLogger(args.includes("spinner"));
} else if (args.includes("workflow")) {
	void testWorkflow(args.includes("concurrency"), args.includes("logger"));
}

function testLogger(spinner = false) {
	const logger = new Logger();

	if (spinner) {
		logger.startProgress("Processing files...");

		setTimeout(() => {
			logger.updateProgress(1, 4, "Processing files...");
		}, 1000);

		setTimeout(() => {
			logger.updateProgress(2, 4, "Processing files...");
		}, 2000);

		setTimeout(() => {
			logger.updateProgress(3, 4, "Processing files...");
		}, 3000);

		setTimeout(() => {
			logger.info("Creating branch for file");
		}, 3500);

		setTimeout(() => {
			logger.updateProgress(4, 4, "Processing files...");
		}, 4000);

		setTimeout(() => {
			logger.success("Processed files");
		}, 4000);
	} else {
		logger.info("Hello, world!");
		logger.success("Hello, world!");
		logger.error("Hello, world!");
		logger.table({
			Hello: "world",
		});
	}
}

async function testWorkflow(useConcurrency = false, useLogger = false) {
	const logger = useLogger ? new Logger() : undefined;

	// Add SIGINT handler
	process.on("SIGINT", () => {
		logger?.error("Process interrupted");
		process.exit(0);
	});

	const github = new GitHubService(logger);
	const languageDetector = new LanguageDetector();
	const translator = new TranslatorService();

	logger?.info("Fetching repository tree...");

	const repositoryTree = await github.getRepositoryTree("main");

	logger?.startProgress("Fetching files from repository...");

	const filesToProcess = await Promise.all(
		repositoryTree.slice(0, Number(process.env["MAX_FILES"] ?? 10)).map(async (file) => {
			return {
				content: await github.getFileContent(file),
				filename: file.path?.split("/").pop()!,
			};
		}),
	);

	logger?.success("Fetched files from repository");

	const filesToTranslate = filesToProcess.filter(
		(file) => !languageDetector.isFileTranslated(file.content),
	);

	logger?.info(`Found ${filesToTranslate.length} files to translate`);

	if (useConcurrency) {
		logger?.startProgress("Processing files in parallel...");
		const now = Date.now();

		await Promise.all(
			filesToTranslate.map(async (file) => {
				const translation = await translator.translateContent(file);
				await Bun.write(`dist/${file.filename}`, translation);
			}),
		);

		logger?.success(`Translated successfully (took ${Date.now() - now}ms)`);
	} else {
		logger?.startProgress("Processing files sequentially...");

		for (const [index, file] of filesToTranslate.entries()) {
			const now = Date.now();

			logger?.updateProgress(index + 1, filesToTranslate.length, `Translating ${file.filename}`);

			const translation = await translator.translateContent(file);

			await Bun.write(`dist/${file.filename}`, translation);

			logger?.success(`Translated and wrote ${file.filename} (took ${Date.now() - now}ms)`);
		}

		logger?.success("Translated all files");
	}
}
