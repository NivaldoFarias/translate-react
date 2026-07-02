import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads the `version` field from `package.json` at the given root.
 *
 * @param repositoryRoot Repository root directory
 *
 * @returns `version` field from `package.json`
 *
 * @throws {Error} When `package.json` has no `version` field
 */
export function readPackageVersion(repositoryRoot: string) {
	const packageJson = readFileSync(join(repositoryRoot, "package.json"), "utf8");
	const parsed = JSON.parse(packageJson) as { version?: string };

	if (!parsed.version) {
		throw new Error("package.json has no `version` field after bump");
	}

	return parsed.version;
}

/**
 * Runs `bun pm version` to bump `package.json` without touching git.
 *
 * @param increment Semantic version increment (e.g. `patch`, `minor`, `major`)
 * @param repositoryRoot Repository root directory
 *
 * @throws {Error} When `bun pm version` exits with a non-zero code
 */
export function bumpPackageVersion(increment: string, repositoryRoot: string) {
	const result = Bun.spawnSync(["bun", "pm", "version", increment, "--no-git-tag-version"], {
		cwd: repositoryRoot,
		stdout: "inherit",
		stderr: "inherit",
	});

	if (result.exitCode !== 0) {
		throw new Error(`\`bun pm version ${increment}\` failed with exit code ${result.exitCode}`);
	}
}
