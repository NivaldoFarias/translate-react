import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, mock, test } from "bun:test";

import { bumpPackageVersion, readPackageVersion } from "@/ci/utils/release.util";

describe("release.util", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		mock.restore();
	});

	function createTempRepository(version = "1.2.3") {
		const root = mkdtempSync(join(tmpdir(), "translate-react-release-"));
		tempDirs.push(root);
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ name: "translate-react", version }, null, 2),
		);
		return root;
	}

	describe("readPackageVersion", () => {
		test("returns the version field from package.json", () => {
			const root = createTempRepository("0.2.9");

			expect(readPackageVersion(root)).toBe("0.2.9");
		});

		test("throws when package.json has no version field", () => {
			const root = mkdtempSync(join(tmpdir(), "translate-react-release-"));
			tempDirs.push(root);
			writeFileSync(join(root, "package.json"), JSON.stringify({ name: "translate-react" }));

			expect(() => readPackageVersion(root)).toThrow("package.json has no `version` field");
		});
	});

	describe("bumpPackageVersion", () => {
		test("bumps package.json via bun pm version", () => {
			const root = createTempRepository("1.0.0");

			bumpPackageVersion("patch", root);

			const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
				version: string;
			};
			expect(packageJson.version).toBe("1.0.1");
		});

		test("throws when bun pm version exits with a non-zero code", () => {
			const root = createTempRepository("1.0.0");
			const spawnSync = mock(() => {
				return { exitCode: 1 };
			});
			const originalSpawnSync = Bun.spawnSync;
			Bun.spawnSync = spawnSync as unknown as typeof Bun.spawnSync;

			try {
				expect(() => {
					bumpPackageVersion("not-a-valid-increment", root);
				}).toThrow("`bun pm version not-a-valid-increment` failed");
			} finally {
				Bun.spawnSync = originalSpawnSync;
			}
		});
	});
});
