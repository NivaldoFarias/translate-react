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

if (import.meta.main) {
	try {
		await build();
	} catch (error) {
		console.error("❌ Build failed:", error);
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

	console.log("🔨 Building translate-react...");

	/* Clean previous build artifacts */
	await rm(DIST_DIR, { recursive: true, force: true });
	console.log("✓ Cleaned dist directory");

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
		external: ["sqlite3", "better-sqlite3", "cld", "@mapbox/node-pre-gyp"],
	});

	if (!result.success) {
		console.error("❌ Build failed:");

		for (const log of result.logs) {
			console.error(log);
		}

		throw new Error("Build process failed");
	}

	console.log(`✓ Bundled application to ${DIST_DIR}`);
	console.log(`  - ${result.outputs.length} output file(s)`);

	console.log("✅ Build complete!");

	return result;
}
