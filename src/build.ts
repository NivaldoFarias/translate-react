/**
 * @file Build configuration for translate-react using Bun bundler.
 * @module build
 * @description Bundles the application into a standalone executable with all
 *   dependencies embedded. Targets Node.js runtime with ESM output format.
 * @see https://bun.com/docs/bundler
 */

import { rm } from "node:fs/promises";
import { join } from "node:path";

import Bun from "bun";

import { logger as baseLogger } from "./utils";

const logger = baseLogger.child({ component: "build" });

if (import.meta.main) {
	try {
		await build();
	} catch (error) {
		logger.error(error, "❌ Build failed:");
		process.exit(1);
	}
}

/**
 * Main build function that orchestrates the bundling process.
 *
 * @returns Promise that resolves when build completes successfully
 *
 * @throws {Error} When build process encounters an error
 */
async function build(): Promise<Bun.BuildOutput> {
	const ROOT_DIR = join(import.meta.dir, "..");
	const DIST_DIR = join(ROOT_DIR, "dist");
	const SRC_DIR = join(ROOT_DIR, "src");

	logger.info("Building translate-react");

	/* Clean previous build artifacts */
	await rm(DIST_DIR, { recursive: true, force: true });
	logger.info("Cleaned dist directory");

	/* Bundle application with Bun */
	const result = await Bun.build({
		entrypoints: [join(SRC_DIR, "index.ts")],
		outdir: DIST_DIR,
		target: "node",
		format: "esm",
		splitting: false,
		minify: true,
		tsconfig: join(ROOT_DIR, "tsconfig.json"),
		sourcemap: "external",
		external: ["cld", "@mapbox/node-pre-gyp"],
	});

	if (!result.success) {
		logger.error("❌ Build failed:");

		for (const log of result.logs) {
			logger.error(log);
		}

		throw new Error("Build process failed");
	}

	logger.info(`✓ Bundled application to ${DIST_DIR}`);
	logger.info(`  - ${String(result.outputs.length)} output file(s)`);

	logger.info("✅ Build complete");

	return result;
}
