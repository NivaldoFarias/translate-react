/* eslint-disable no-console */
import fs from "fs/promises";

import Bun from "bun";

import { DatabaseService } from "@/services/database.service";
import { TranslatorService } from "@/services/translator.service";

declare interface TranslationOutput {
	input: string;
	chunks: Array<string>;
	output: string;
}

if (import.meta.main) {
	const TS_KEY = "Total execution time";
	const OUTPUT_FILENAME = `output-${new Date().toISOString().replace(/[-:Z]/g, "")}.json`;

	console.time(TS_KEY);

	const services = {
		database: new DatabaseService(),
		translator: new TranslatorService({ source: "en", target: "pt" }),
	};

	try {
		const filesToTranslate = services.database.getFilesToTranslateByFilename(["react-v18.md"]);

		if (!filesToTranslate.length) throw new Error("No files to translate found");

		const output: Map<string, TranslationOutput> = new Map();

		console.info(`Translating ${filesToTranslate.length} files...`);

		await Promise.all(
			filesToTranslate.map(async (file, index) => {
				const prefix = `[${index + 1}/${filesToTranslate.length}]`;

				try {
					console.info(`${prefix}	Parsing ${file.filename} (step 1/2)`);

					const chunks = services.translator.splitIntoSections(file.content);
					const translation = await services.translator.translateChunks(chunks);

					output.set(file.filename, { input: file.content, chunks, output: translation });

					console.info(`${prefix} Translated ${file.filename} (step 2/2)`);
				} catch (error) {
					console.error(`${prefix} Error translating ${file.filename}`);
				}
			}),
		);

		console.info(`Translated ${output.size} files out of ${filesToTranslate.length}`);

		const outputObj = Object.fromEntries(output);

		await Bun.write(`dist/${OUTPUT_FILENAME}`, JSON.stringify(outputObj, null, 4));

		await createPreviewFiles(output);

		console.info("Running prettier on output file...");

		const prettierResult = Bun.spawnSync(
			["bunx", "prettier", "--write", `dist/${OUTPUT_FILENAME}`],
			{ stdout: "inherit", stderr: "inherit" },
		);

		if (prettierResult.success) {
			console.info("Successfully formatted output file");
		} else {
			console.error("Failed to format output file");
		}
	} catch (error) {
		console.error(error);
	} finally {
		console.timeEnd(TS_KEY);
	}

	process.on("SIGINT", cleanup);
	process.on("SIGTERM", cleanup);
	process.on("uncaughtException", (error) => {
		console.error(`Uncaught exception: ${error.message}`);
		cleanup();
	});

	function cleanup() {
		setTimeout(() => void process.exit(0), 1000);
	}

	/**
	 * Creates preview directories and files for each translation
	 *
	 * ## Workflow
	 * 1. Creates a preview directory for each translated file
	 * 2. Writes original content to input.md
	 * 3. Writes translated content to output.md
	 *
	 * @param translations Map of filenames to their translation results
	 */
	async function createPreviewFiles(translations: Map<string, TranslationOutput>) {
		const previewDir = "dist/preview";

		if (!(await fs.exists(previewDir))) {
			await fs.mkdir(previewDir, { recursive: true });
		}

		for (const [filename, content] of translations.entries()) {
			if (content.output.length === 0) continue;

			const dirname = filename.replace(/[^a-z0-9]/gi, "_").toLowerCase();
			const fileDir = `${previewDir}/${dirname}`;

			await fs.mkdir(fileDir, { recursive: true });

			await Bun.write(`${fileDir}/input.md`, content.input);
			await Bun.write(`${fileDir}/output.md`, content.output);
		}

		console.info(`Created preview files in ${previewDir}`);
	}
}
