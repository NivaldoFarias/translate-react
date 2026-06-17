import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { WORKFLOW_FIXTURE_MANIFEST } from "@tests/fixtures/md/workflow.manifest";
import { WorkflowFixturePrScenario } from "@tests/fixtures/workflow-fixture.util";

import {
	createIntegrationRunner,
	installOpenRouterModelLimitsStub,
	loadWorkflowFilesFromMdFixtureDir,
	restoreOpenRouterModelLimitsStub,
} from "./create-integration-runner";

const WORKFLOW_MANIFEST_BASELINES = Object.keys(WORKFLOW_FIXTURE_MANIFEST);

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

	test.each(WORKFLOW_MANIFEST_BASELINES.map((basename) => [basename] as const))(
		"manifest %s matches workflow fixture scenario",
		async (basename) => {
			const files = await loadWorkflowFilesFromMdFixtureDir([basename]);

			expect(files).toHaveLength(1);

			const file = files[0];
			if (file === undefined) {
				throw new Error(`expected one integration workflow file for ${basename}`);
			}

			const manifestEntry =
				WORKFLOW_FIXTURE_MANIFEST[basename as keyof typeof WORKFLOW_FIXTURE_MANIFEST];
			expect(file.treeItem.path).toBe(manifestEntry.tree.path);
			expect(file.smoke.pullRequestNumber).toBe(manifestEntry.smoke.pullRequestNumber);

			const { runner, github, chatMock } = createIntegrationRunner(file);
			const stats = await runner.run();
			const scenario = file.smoke.pullRequestScenario ?? WorkflowFixturePrScenario.New;

			switch (scenario) {
				case WorkflowFixturePrScenario.New: {
					expect(stats.totalCount).toBe(1);
					expect(stats.successCount).toBe(1);
					expect(stats.failureCount).toBe(0);
					expect(github.commitTranslation.mock.calls.length).toBeGreaterThanOrEqual(1);
					expect(github.createPullRequest.mock.calls.length).toBeGreaterThanOrEqual(1);
					expect(chatMock.mock.calls.length).toBeGreaterThanOrEqual(1);
					expect(chatMockUsedSegmentBatch(chatMock)).toBe(true);
					break;
				}
				case WorkflowFixturePrScenario.OutOfSync: {
					expect(stats.totalCount).toBe(1);
					expect(stats.successCount).toBe(1);
					expect(stats.failureCount).toBe(0);
					expect(github.refreshTranslationBranchPreservePr).toHaveBeenCalled();
					expect(github.createPullRequest).not.toHaveBeenCalled();
					expect(github.closePullRequest).not.toHaveBeenCalled();
					expect(chatMock.mock.calls.length).toBeGreaterThanOrEqual(1);
					break;
				}
				case WorkflowFixturePrScenario.MaintainerFix: {
					expect(stats.totalCount).toBe(1);
					expect(stats.successCount).toBe(1);
					expect(stats.failureCount).toBe(0);
					expect(github.refreshTranslationBranchPreservePr).toHaveBeenCalled();
					expect(github.updatePullRequestBody).toHaveBeenCalled();
					expect(github.createPullRequest).not.toHaveBeenCalled();
					expect(github.closePullRequest).not.toHaveBeenCalled();
					expect(chatMock.mock.calls.length).toBeGreaterThanOrEqual(1);
					break;
				}
				case WorkflowFixturePrScenario.ValidSkip: {
					expect(stats.totalCount).toBe(0);
					expect(stats.successCount).toBe(0);
					expect(stats.failureCount).toBe(0);
					expect(github.commitTranslation).not.toHaveBeenCalled();
					expect(github.createPullRequest).not.toHaveBeenCalled();
					expect(chatMockUsedSegmentBatch(chatMock)).toBe(false);
					break;
				}
				default: {
					const exhaustive: never = scenario;
					throw new Error(`Unhandled workflow scenario: ${String(exhaustive)}`);
				}
			}
		},
		120_000,
	);
});
