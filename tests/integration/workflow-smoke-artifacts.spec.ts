import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
	createIntegrationRunner,
	installOpenRouterModelLimitsStub,
	loadWorkflowFilesFromMdFixtureDir,
	restoreOpenRouterModelLimitsStub,
} from "./create-integration-runner";

const CAPTURE_DIR = ".capture" as const;

describe("workflow smoke artifact capture", () => {
	beforeAll(() => {
		installOpenRouterModelLimitsStub();
	});

	afterAll(() => {
		restoreOpenRouterModelLimitsStub();
	});

	test.each([
		["lazy.md", "reference__react__lazy"],
		["react-19.md", "blog__2024__12__05__react-19"],
	] as const)(
		"writes pull-request.md when reusing open PR (%s)",
		async (basename, expectedSubdir) => {
			const artifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-smoke-artifact-"));

			try {
				const files = await loadWorkflowFilesFromMdFixtureDir([basename]);
				const file = files[0];
				if (file === undefined) {
					throw new Error(`expected fixture ${basename}`);
				}

				const { runner } = createIntegrationRunner(file, {
					captureArtifactsDir: CAPTURE_DIR,
					cwd: artifactRoot,
				});
				const stats = await runner.run();

				expect(stats.successCount).toBe(1);

				const pullRequestPath = path.join(
					artifactRoot,
					CAPTURE_DIR,
					expectedSubdir,
					"pull-request.md",
				);
				const translatedPath = path.join(
					artifactRoot,
					CAPTURE_DIR,
					expectedSubdir,
					"translated.md",
				);

				const pullRequestMarkdown = await fs.readFile(pullRequestPath, "utf8");
				const translatedMarkdown = await fs.readFile(translatedPath, "utf8");

				expect(pullRequestMarkdown.length).toBeGreaterThan(0);
				expect(translatedMarkdown.length).toBeGreaterThan(0);
				expect(pullRequestMarkdown).toStartWith(`# Tradução de \`${basename}\``);
				expect(pullRequestMarkdown).toContain("requer revisão humana");
			} finally {
				await fs.rm(artifactRoot, { recursive: true, force: true });
			}
		},
		120_000,
	);
});
