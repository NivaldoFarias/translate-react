import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
	createIntegrationRunner,
	installOpenRouterModelLimitsStub,
	loadIntegrationWorkflowFilesFromMdFixtureDir,
	restoreOpenRouterModelLimitsStub,
} from "./create-integration-runner";

describe("RunnerService workflow integration", () => {
	beforeAll(() => {
		installOpenRouterModelLimitsStub();
	});

	afterAll(() => {
		restoreOpenRouterModelLimitsStub();
	});

	test("small markdown: full run with real TranslatorService and mocked GitHub", async () => {
		const files = await loadIntegrationWorkflowFilesFromMdFixtureDir(["hydrateRoot.md"]);

		expect(files.length).toBe(1);

		const file = files[0];
		if (file === undefined) {
			throw new Error("expected one integration workflow file");
		}

		const { runner, github, chatMock } = createIntegrationRunner(file);

		const stats = await runner.run();

		expect(stats.totalCount).toBe(1);
		expect(stats.successCount).toBe(1);
		expect(stats.failureCount).toBe(0);
		expect(stats.successRate).toBe(1);

		expect(github.commitTranslation.mock.calls.length).toBeGreaterThanOrEqual(1);
		expect(github.createPullRequest.mock.calls.length).toBeGreaterThanOrEqual(1);
		expect(chatMock.mock.calls.length).toBeGreaterThanOrEqual(1);
	});

	test("large fixture: full run with chunking and passthrough LLM", async () => {
		const files = await loadIntegrationWorkflowFilesFromMdFixtureDir([
			"react-labs-view-transitions-activity-and-more.md",
		]);

		expect(files.length).toBe(1);

		const file = files[0];
		if (file === undefined) {
			throw new Error("expected one integration workflow file");
		}

		const { runner, github, chatMock } = createIntegrationRunner(file);

		const stats = await runner.run();

		expect(stats.totalCount).toBe(1);
		expect(stats.successCount).toBe(1);
		expect(stats.failureCount).toBe(0);
		expect(stats.successRate).toBe(1);

		expect(github.commitTranslation.mock.calls.length).toBeGreaterThanOrEqual(1);
		expect(github.createPullRequest.mock.calls.length).toBeGreaterThanOrEqual(1);
		expect(chatMock.mock.calls.length).toBeGreaterThanOrEqual(2);
	});
});
