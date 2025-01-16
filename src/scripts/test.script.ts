import Bun from "bun";

import { GitHubService } from "../services/github";
import { LanguageDetector } from "../services/language-detector";
import { TranslatorService } from "../services/translator";
import Logger from "../utils/logger";

const args = Bun.argv.slice(2);

if (args.includes("logger")) {
	void testLogger();
} else if (args.includes("workflow")) {
	void testWorkflow(args.includes("concurrency"));
}

function testLogger() {
	const logger = new Logger();

	logger.info("Hello, world!");
	logger.success("Hello, world!");
	logger.warn("Hello, world!");
	logger.error("Hello, world!");
}

async function testWorkflow(useConcurrency: boolean = false) {
	const github = new GitHubService();
	const languageDetector = new LanguageDetector();
	const translator = new TranslatorService();

	const repositoryTree = await github.getRepositoryTree("main");

	const filesToProcess = await Promise.all(
		repositoryTree.slice(0, 10).map(async (file) => {
			return {
				content: await github.getFileContent(file),
				filename: file.path?.split("/").pop()!,
			};
		}),
	);

	const filesToTranslate = filesToProcess.filter(
		(file) => !languageDetector.isFileTranslated(file.content),
	);

	if (useConcurrency) {
		const now = Date.now();

		await Promise.all(
			filesToTranslate.map(async (file) => {
				const translation = await translator.translateContent(file);
				await Bun.write(`dist/${file.filename}`, translation);
			}),
		);

		console.log(
			`[${filesToTranslate.length}] Translated successfully (took ${Date.now() - now}ms)`,
		);
	} else {
		for (const [index, file] of filesToTranslate.entries()) {
			const now = Date.now();

			console.log(`[${index + 1}/${filesToTranslate.length}] Translating ${file.filename}`);

			const translation = await translator.translateContent(file);

			console.log(
				`[${index + 1}/${filesToTranslate.length}] Translated successfully (took ${Date.now() - now}ms)`,
			);

			await Bun.write(`dist/${file.filename}`, translation);
		}
	}
}
