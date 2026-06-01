/**
 * Fails CI when `CHANGELOG.md` has no section for the current `package.json` version.
 *
 * Invoked by [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
 *
 * @example
 * ```bash
 * bun run ci:verify-changelog
 * ```
 */

import { verifyChangelogListsPackageVersion } from "@/ci/utils/verify-changelog.util";
import { createLogger } from "@/shared/utils/create-logger.util";

const log = createLogger({ level: "info", logToConsole: true }).child({
	component: "verify-changelog",
});

try {
	verifyChangelogListsPackageVersion();
	log.info("CHANGELOG.md includes the current package version");
} catch (error) {
	log.error({ error }, "CHANGELOG version check failed");
	process.exit(1);
}
