/**
 * CLI entry for real-LLM workflow smoke (`bun run ci:smoke`).
 *
 * Invoked locally or by [`.github/workflows/smoke.yml`](../../.github/workflows/smoke.yml).
 * Reviewable outputs are written under `.out/`. See {@link runWorkflowSmoke} and
 * [CONTRIBUTING.md](../../../CONTRIBUTING.md#workflow-smoke) for layout and CI artifacts.
 *
 * @example
 * ```bash
 * bun run ci:smoke -- --profile quick
 * bun run ci:smoke -- --profile workflow
 * bun run ci:smoke -- --profile full
 * bun run ci:smoke -- --files hydrateRoot.md,lazy.md
 * ```
 */

import "@/app/utils/bootstrap-cli-overrides.util";

import { defineCommand, runCommand } from "citty";

import {
	isSmokeProfileId,
	runWorkflowSmoke,
	SmokeProfile,
	workflowSmokeSucceeded,
} from "@/ci/services/smoke";
import { handleTopLevelError } from "@/shared/errors/";
import { createLogger } from "@/shared/utils/create-logger.util";

const log = createLogger({ level: "info", logToConsole: true }).child({
	component: "smoke",
});

const smokeCommand = defineCommand({
	meta: {
		name: "smoke",
		description: "Run workflow smoke with real LLM and mocked GitHub fixtures",
	},
	args: {
		profile: {
			type: "string",
			description:
				"Fixture set. quick: default CI (small + large new-PR translation, out-of-sync refresh). workflow: PR scenarios (out-of-sync, valid skip). full: all tests/fixtures/md/*.md",
			default: SmokeProfile.Quick,
		},
		files: {
			type: "string",
			description: "Comma-separated fixture basenames (overrides profile)",
			default: "",
		},
	},
	async run({ args }) {
		if (!isSmokeProfileId(args.profile)) {
			log.error(
				{ profile: args.profile, allowed: Object.values(SmokeProfile) },
				"Invalid smoke profile",
			);
			process.exit(1);
		}

		try {
			const stats = await runWorkflowSmoke({
				profile: args.profile,
				filesArgument: args.files,
			});

			if (!workflowSmokeSucceeded(stats)) {
				log.error({ stats }, "Workflow smoke reported translation failures");
				process.exit(1);
			}

			process.exit(0);
		} catch (error) {
			handleTopLevelError(error, log);
			process.exit(1);
		}
	},
});

await runCommand(smokeCommand, { rawArgs: process.argv.slice(2) });
