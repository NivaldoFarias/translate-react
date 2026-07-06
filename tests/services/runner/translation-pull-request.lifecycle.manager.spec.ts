import { describe, expect, test } from "bun:test";

import { PullRequestProgressAction } from "@/app/services/github/types";
import { TranslationPullRequestLifecycleManager } from "@/app/services/runner/workflow/translation-pull-request.lifecycle.manager";

import {
	createMockPullRequestListItem,
	createProcessedFileResultsFixture,
	createTranslationFileFixture,
} from "@tests/fixtures";
import { buildRunnerServiceDependencies } from "@tests/helpers/runner-dependencies.harness";
import { useTranslationTargetPaths } from "@tests/helpers/translation-target.harness";
import { createMockGitHubService } from "@tests/mocks";

const TARGET_PATH = "src/content/reference/rsc/use-client.md";

describe("TranslationPullRequestLifecycleManager", () => {
	useTranslationTargetPaths(TARGET_PATH);

	describe("openTranslationPullRequest", () => {
		test("reuses and refreshes the body for a force-retranslate target with a valid open pull request", async () => {
			const github = createMockGitHubService();
			const manager = new TranslationPullRequestLifecycleManager(
				buildRunnerServiceDependencies({ github }),
				new Map(),
			);
			const file = createTranslationFileFixture({
				path: TARGET_PATH,
				filename: "use-client.md",
			});
			const existingPR = createMockPullRequestListItem(1173);
			const processingResults = createProcessedFileResultsFixture({ count: 1 });
			expect(processingResults).toHaveLength(1);
			const processingResult = processingResults[0];

			if (!processingResult) {
				throw new Error("Expected processed file result fixture");
			}

			processingResult.translation = "# Перевод\n\nОбновлённый текст.";

			const outcome = await manager.openTranslationPullRequest(file, processingResult, {
				isValid: true,
				pullRequest: existingPR,
			});

			expect(github.updatePullRequestBody).toHaveBeenCalled();
			expect(github.createPullRequest).not.toHaveBeenCalled();
			expect(outcome.pullRequest).toEqual(existingPR);
			expect(outcome.progress).toBe(PullRequestProgressAction.Reused);
		});
	});
});
