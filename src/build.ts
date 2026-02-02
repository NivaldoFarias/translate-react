import { rm } from "node:fs/promises";
import { join } from "node:path";

import Bun from "bun";

import { logger as baseLogger } from "./utils";

if (import.meta.main) {
	await build();
}

/**
 * Main build function that orchestrates the bundling process.
 *
 * @returns Promise that resolves when build completes successfully
 *
 * @throws {Error} When build process encounters an error
 */
async function build(): Promise<Bun.BuildOutput> {
	const logger = baseLogger.child({ component: build.name });

	try {
		logger.info("Starting build process");

		const dirs = {
			root: join(import.meta.dir, ".."),
			dist: join(import.meta.dir, "..", "dist"),
			src: join(import.meta.dir, "..", "src"),
		};

		logger.info({ dirs }, "Building translate-react");

		/* Clean previous build artifacts */
		await rm(dirs.dist, { recursive: true, force: true });
		logger.info("Cleaned dist directory");

		/* Bundle application with Bun */
		const result = await Bun.build({
			entrypoints: [join(dirs.src, "main.ts")],
			outdir: dirs.dist,
			target: "node",
			format: "esm",
			splitting: false,
			minify: true,
			tsconfig: join(dirs.root, "tsconfig.json"),
			sourcemap: "external",
			external: ["cld", "@mapbox/node-pre-gyp"],
		});

		if (!result.success) {
			logger.error("Build failed:");

			for (const log of result.logs) {
				logger.error(log);
			}

			throw new Error("Build process failed");
		}

		logger.info(`Bundled application to ${dirs.dist}`);
		logger.info(`Output file(s): ${result.outputs.length}`);

		logger.info("Build complete");

		return result;
	} catch (error) {
		logger.error(error, "Build process encountered an error");

		process.exit(1);
	}
}
