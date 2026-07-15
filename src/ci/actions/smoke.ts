/**
 * CLI entry for real-LLM workflow smoke (`bun run ci:smoke`).
 *
 * Invoked locally or by [`.github/workflows/smoke.yml`](../../.github/workflows/smoke.yml) and the
 * `pt-br` required gate (plus optional extra locales) in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
 * Reviewable outputs are written under {@link SMOKE_ARTIFACT_DIR} by default (override with
 * `--out-dir`/`-o` or `SMOKE_OUTPUT_DIR`). See {@link run} and
 * [CONTRIBUTING.md](../../../CONTRIBUTING.md#workflow-smoke) for layout and CI artifacts.
 *
 * `TARGET_LANGUAGE` defaults to `pt-br`; pass `--lang`/`-l` (handled by
 * `bootstrap-cli-overrides.util`, shared with the main translation CLI) to smoke a different
 * configured locale. Pass `--model` to override `LLM_MODEL` for that run (or set it in the
 * environment or `.env`).
 *
 * @example
 * ```bash
 * bun run ci:smoke -- --profile quick
 * bun run ci:smoke -- --profile quick --lang ru
 * bun run ci:smoke -- --lang ru --files use-client.md --model openai/gpt-5.4-nano
 * bun run ci:smoke -- --profile workflow
 * bun run ci:smoke -- --profile full
 * bun run ci:smoke -- --files hydrateRoot.md,lazy.md
 * bun run ci:smoke -- --profile quick --out-dir /tmp/smoke-run
 * ```
 */

import "@/app/utils/bootstrap-cli-overrides.util";

import { defineCommand, runCommand } from "citty";

import { env } from "@/app/utils/";
import {
	isSmokeProfileId,
	run,
	runSucceeded,
	SMOKE_ARTIFACT_DIR,
	SmokeProfile,
} from "@/ci/services/smoke";
import { handleTopLevelError } from "@/shared/errors/";
import { createLogger } from "@/shared/utils/create-logger.util";

const logger = createLogger({
	level: env.LOG_LEVEL,
	logToConsole: env.LOG_TO_CONSOLE,
}).child({
	component: "smoke",
});

const smokeCommand = defineCommand({
	meta: {
		name: "smoke",
		description: "Run with real LLM and mocked GitHub fixtures",
	},
	args: {
		"profile": {
			type: "string",
			description:
				"Fixture set. quick: default CI (small + large new-PR translation, out-of-sync refresh). workflow: PR scenarios (out-of-sync, valid skip). full: all tests/fixtures/md/*.md",
			default: SmokeProfile.Quick,
		},
		"files": {
			type: "string",
			description: "Comma-separated fixture basenames (overrides profile)",
			default: "",
		},
		"out-dir": {
			type: "string",
			description: `Output directory for translated markdown and mock PR bodies (default: ${SMOKE_ARTIFACT_DIR})`,
			alias: "o",
			default: "",
		},
	},
	async run({ args }) {
		if (!isSmokeProfileId(args.profile)) {
			logger.error(
				{ profile: args.profile, allowed: Object.values(SmokeProfile) },
				"Invalid smoke profile",
			);
			process.exit(1);
		}

		try {
			const artifactDir = resolveSmokeOutputDir(args["out-dir"]);
			const stats = await run({
				profile: args.profile,
				filesArgument: args.files,
				artifactDir,
			});

			if (!runSucceeded(stats)) {
				logger.error({ stats }, "Run reported translation failures");
				process.exit(1);
			}

			process.exit(0);
		} catch (error) {
			handleTopLevelError(error, logger);
			process.exit(1);
		}
	},
});

/**
 * Resolves the smoke output directory from CLI flags, then `SMOKE_OUTPUT_DIR`, then the default.
 *
 * @param cliOutDir Value from `--out-dir` when set
 *
 * @returns Relative or absolute artifact root for {@link run}
 */
function resolveSmokeOutputDir(cliOutDir: string) {
	const trimmedCli = cliOutDir.trim();
	if (trimmedCli !== "") {
		return trimmedCli;
	}

	const envDir = process.env["SMOKE_OUTPUT_DIR"]?.trim();
	if (envDir !== undefined && envDir !== "") {
		return envDir;
	}

	return SMOKE_ARTIFACT_DIR;
}

await runCommand(smokeCommand, { rawArgs: process.argv.slice(2) });
