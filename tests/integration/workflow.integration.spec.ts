import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
	createIntegrationRunner,
	installOpenRouterModelLimitsStub,
	INTEGRATION_SMALL_MARKDOWN,
	readTestsFixtureUtf8,
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
		const { runner, github, chatMock } = createIntegrationRunner({
			repoPath: "src/content/integration-doc.md",
			filename: "integration-doc.md",
			content: INTEGRATION_SMALL_MARKDOWN,
			sha: "sha-integration-001",
		});

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
		const content = await readTestsFixtureUtf8(
			"fixtures/react-labs-view-transitions-activity-and-more.md",
		);

		const { runner, github, chatMock } = createIntegrationRunner({
			repoPath: "src/content/react-labs-view-transitions-activity-and-more.md",
			filename: "react-labs-view-transitions-activity-and-more.md",
			content,
			sha: "sha-large-fixture-001",
		});

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
