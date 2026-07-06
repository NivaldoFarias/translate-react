import { describe, expect, test } from "bun:test";

import { TranslationBranchLifecycleManager } from "@/app/services/runner/workflow/translation-branch.lifecycle.manager";

import { createMockPullRequestListItem, createTranslationFileFixture } from "@tests/fixtures";
import { buildRunnerServiceDependencies } from "@tests/helpers/runner-dependencies.harness";
import { useTranslationTargetPaths } from "@tests/helpers/translation-target.harness";
import { createMockGitHubService } from "@tests/mocks";

const TARGET_PATH = "src/content/reference/rsc/use-client.md";

describe("TranslationBranchLifecycleManager", () => {
	useTranslationTargetPaths(TARGET_PATH);

	describe("prepareTranslationBranch", () => {
		test("preserves an open pull request when force-retranslating a configured target", async () => {
			const github = createMockGitHubService();
			github.refreshTranslationBranchPreservePr.mockResolvedValue({
				ref: "refs/heads/translate/reference/rsc/use-client.md",
				object: { sha: "refreshed-sha" },
			});

			const manager = new TranslationBranchLifecycleManager(
				buildRunnerServiceDependencies({ github }),
			);
			const file = createTranslationFileFixture({
				path: TARGET_PATH,
				filename: "use-client.md",
			});
			const existingPR = createMockPullRequestListItem(1173);
			const validity = {
				isValid: true,
				pullRequest: existingPR,
				invalidReason: undefined,
			};

			await manager.prepareTranslationBranch(file, validity);

			expect(github.refreshTranslationBranchPreservePr).toHaveBeenCalledWith(
				"translate/reference/rsc/use-client.md",
			);
			expect(github.closePullRequest).not.toHaveBeenCalled();
		});
	});
});
