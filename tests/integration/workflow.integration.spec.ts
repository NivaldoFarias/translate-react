import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
	createIntegrationRunner,
	installOpenRouterModelLimitsStub,
	loadIntegrationWorkflowFilesFromMdFixtureDir,
	restoreOpenRouterModelLimitsStub,
} from "./create-integration-runner";

function chatMockUsedSegmentBatch(chatMock: { mock: { calls: unknown[][] } }) {
	return chatMock.mock.calls.some(([params]) => {
		const messages = (params as { messages: { role: string; content: string }[] }).messages;
		const userMessage = [...messages].reverse().find((message) => message.role === "user");
		if (!userMessage || typeof userMessage.content !== "string") {
			return false;
		}

		try {
			const parsed = JSON.parse(userMessage.content) as { items?: { segmentId?: string }[] };
			return Array.isArray(parsed.items) && parsed.items[0]?.segmentId !== undefined;
		} catch {
			return false;
		}
	});
}

describe("RunnerService workflow integration", () => {
	beforeAll(() => {
		installOpenRouterModelLimitsStub();
	});

	afterAll(() => {
		restoreOpenRouterModelLimitsStub();
	});

	test("small fixture: full run with real TranslatorService and mocked GitHub", async () => {
		const files = await loadIntegrationWorkflowFilesFromMdFixtureDir(["use-memo.md"]);

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

		expect(chatMockUsedSegmentBatch(chatMock)).toBe(true);
	});

	test("medium fixture: full run with real TranslatorService and mocked GitHub", async () => {
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
		expect(chatMockUsedSegmentBatch(chatMock)).toBe(true);
	});

	test("large fixture: full run with segment batching and passthrough LLM", async () => {
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
		expect(chatMockUsedSegmentBatch(chatMock)).toBe(true);
	});
});
