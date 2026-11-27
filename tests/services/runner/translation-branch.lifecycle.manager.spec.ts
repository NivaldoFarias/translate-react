import { describe, expect, test } from "bun:test";

import type { ProcessedFileResult } from "@/app/services/github/types";

import { TranslationBranchLifecycleManager } from "@/app/services/runner/workflow/translation-branch.lifecycle.manager";

import {
	createMockPullRequestListItem,
	createMockPullRequestReviewSnapshot,
	createTranslationFileFixture,
} from "@tests/fixtures";
import { buildRunnerServiceDependencies } from "@tests/helpers/runner-dependencies.harness";
import { useTranslationTargetPaths } from "@tests/helpers/translation-target.harness";
import { createMockGitHubService } from "@tests/mocks";

const TARGET_PATH = "src/content/reference/rsc/use-client.md";
const TARGET_BRANCH = "translate/reference/rsc/use-client.md";
const COMMIT = { content: "# Traduzido", message: "docs: translate `use-client.md`" };

/** Builds a failed processing result whose translation branch was already committed */
function createFailedResult(): ProcessedFileResult {
	return {
		branch: {
			ref: `refs/heads/${TARGET_BRANCH}`,
			node_id: "MDM6UmVmMTpyZWZzL2hlYWRzL3RyYW5zbGF0ZS90ZXN0",
			url: `https://api.github.com/repos/test/test/git/refs/heads/${TARGET_BRANCH}`,
			object: { sha: "commit-sha", type: "commit", url: "" },
		},
		filename: "use-client.md",
		translation: "# Traduzido",
		reviewerNotices: [],
		pullRequest: null,
		pullRequestProgress: null,
		error: new Error("Pull request update failed"),
	};
}

describe("TranslationBranchLifecycleManager", () => {
	useTranslationTargetPaths(TARGET_PATH);

	describe("commitTranslation", () => {
		test("keeps an open pull request when force-retranslating a configured target", async () => {
			const github = createMockGitHubService();
			const manager = new TranslationBranchLifecycleManager(
				buildRunnerServiceDependencies({ github }),
			);
			const file = createTranslationFileFixture({ path: TARGET_PATH, filename: "use-client.md" });
			const validity = { isValid: true, pullRequest: createMockPullRequestListItem(1173) };

			const branch = await manager.commitTranslation(file, validity, COMMIT);

			expect(branch.object.sha).toBe("commit-sha");
			expect(github.commitTranslation).toHaveBeenCalledWith({
				branchName: TARGET_BRANCH,
				file,
				...COMMIT,
			});
			expect(github.closePullRequest).not.toHaveBeenCalled();
		});

		test("closes an unapproved pull request before committing a fresh translation", async () => {
			const github = createMockGitHubService();
			github.findPullRequestByBranch.mockResolvedValue(createMockPullRequestListItem(1201));
			github.listPullRequestReviews.mockResolvedValue([]);
			const manager = new TranslationBranchLifecycleManager(
				buildRunnerServiceDependencies({ github }),
			);
			const file = createTranslationFileFixture({
				path: "src/content/learn/index.md",
				filename: "index.md",
			});

			await manager.commitTranslation(
				file,
				{ isValid: false, invalidReason: "not_translated" },
				COMMIT,
			);

			expect(github.closePullRequest).toHaveBeenCalledWith(1201);
			expect(github.deleteBranch).not.toHaveBeenCalled();
		});

		test("keeps an approved pull request open instead of closing it", async () => {
			const github = createMockGitHubService();
			github.findPullRequestByBranch.mockResolvedValue(createMockPullRequestListItem(1182));
			github.listPullRequestReviews.mockResolvedValue([
				createMockPullRequestReviewSnapshot({ id: 99, state: "APPROVED", body: "Aprovado." }),
			]);
			const manager = new TranslationBranchLifecycleManager(
				buildRunnerServiceDependencies({ github }),
			);
			const file = createTranslationFileFixture({
				path: "src/content/blog/2024/04/25/react-19-upgrade-guide.md",
				filename: "react-19-upgrade-guide.md",
			});

			await manager.commitTranslation(
				file,
				{ isValid: false, invalidReason: "not_translated" },
				COMMIT,
			);

			expect(github.closePullRequest).not.toHaveBeenCalled();
			expect(github.commitTranslation).toHaveBeenCalled();
		});
	});

	describe("cleanupFailedTranslation", () => {
		test("keeps the branch when it has an open pull request", async () => {
			const github = createMockGitHubService();
			github.findPullRequestByBranch.mockResolvedValue(createMockPullRequestListItem(1173));
			const manager = new TranslationBranchLifecycleManager(
				buildRunnerServiceDependencies({ github }),
			);

			await manager.cleanupFailedTranslation(createFailedResult());

			expect(github.deleteBranch).not.toHaveBeenCalled();
		});

		test("deletes the branch when no pull request is open", async () => {
			const github = createMockGitHubService();
			github.findPullRequestByBranch.mockResolvedValue(undefined);
			const manager = new TranslationBranchLifecycleManager(
				buildRunnerServiceDependencies({ github }),
			);

			await manager.cleanupFailedTranslation(createFailedResult());

			expect(github.deleteBranch).toHaveBeenCalledWith(TARGET_BRANCH);
		});

		test("keeps the branch when the pull request lookup fails", async () => {
			const github = createMockGitHubService();
			github.findPullRequestByBranch.mockRejectedValue(new Error("API rate limit exceeded"));
			const manager = new TranslationBranchLifecycleManager(
				buildRunnerServiceDependencies({ github }),
			);

			await manager.cleanupFailedTranslation(createFailedResult());

			expect(github.deleteBranch).not.toHaveBeenCalled();
		});
	});
});
