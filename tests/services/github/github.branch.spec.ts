import { RequestError } from "@octokit/request-error";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { StatusCodes } from "http-status-codes";

import type { Octokit } from "@octokit/rest";

import type { SharedGitHubDependencies } from "@/app/services/github/types";

import { GitHubBranch } from "@/app/services/github/github.branch";

import { createMockOctokit, testRepositories } from "@tests/mocks";

describe("GitHubBranch", () => {
	let branch: GitHubBranch;
	let octokitMock: ReturnType<typeof createMockOctokit>;

	beforeEach(() => {
		octokitMock = createMockOctokit();
		const deps: SharedGitHubDependencies = {
			octokit: octokitMock as unknown as Octokit,
			repositories: testRepositories,
		};
		branch = new GitHubBranch(deps);
	});

	describe("pointBranchAtCommit", () => {
		test("force-updates an existing branch instead of deleting it", async () => {
			const result = await branch.pointBranchAtCommit(
				"translate/learn/index.md",
				"translation-commit-sha",
			);

			expect(result.object.sha).toBe("translation-commit-sha");
			expect(octokitMock.git.updateRef).toHaveBeenCalledWith({
				...testRepositories.fork,
				ref: "heads/translate/learn/index.md",
				sha: "translation-commit-sha",
				force: true,
			});
			expect(octokitMock.git.deleteRef).not.toHaveBeenCalled();
			expect(branch.activeBranches.has("translate/learn/index.md")).toBe(false);
		});

		test("creates and tracks the branch when it does not exist", async () => {
			octokitMock.git.getRef.mockRejectedValueOnce(
				new RequestError("Not Found", StatusCodes.NOT_FOUND, {
					request: { method: "GET", url: "https://api.github.com/test", headers: {} },
				}),
			);

			await branch.pointBranchAtCommit("translate/learn/index.md", "translation-commit-sha");

			expect(octokitMock.git.createRef).toHaveBeenCalledWith({
				...testRepositories.fork,
				ref: "refs/heads/translate/learn/index.md",
				sha: "translation-commit-sha",
			});
			expect(branch.activeBranches.has("translate/learn/index.md")).toBe(true);
		});
	});

	describe("cleanup", () => {
		test("skips cleanup when cleanupContentAccess is not set", async () => {
			branch.activeBranches.add("some-branch");

			await (branch as unknown as { cleanup(): Promise<void> }).cleanup();

			expect(octokitMock.git.deleteRef).not.toHaveBeenCalled();
		});

		test("deletes branch when no PR exists", async () => {
			const findPullRequestByBranch = mock(() => Promise.resolve(undefined));
			branch.setCleanupPullRequestAccess({ findPullRequestByBranch });
			branch.activeBranches.add("translate/file1.md");

			await (branch as unknown as { cleanup(): Promise<void> }).cleanup();

			expect(findPullRequestByBranch).toHaveBeenCalledWith("translate/file1.md");
			expect(octokitMock.git.deleteRef).toHaveBeenCalledWith({
				...testRepositories.fork,
				ref: "heads/translate/file1.md",
			});
		});

		test("preserves branch when an open PR exists, even one with conflicts", async () => {
			const findPullRequestByBranch = mock(() => Promise.resolve({ number: 42 }));
			branch.setCleanupPullRequestAccess({ findPullRequestByBranch });
			branch.activeBranches.add("translate/file2.md");

			await (branch as unknown as { cleanup(): Promise<void> }).cleanup();

			expect(octokitMock.git.deleteRef).not.toHaveBeenCalled();
		});

		test("skips deletion when findPullRequestByBranch throws", async () => {
			const findPullRequestByBranch = mock(() => Promise.reject(new Error("API error")));
			branch.setCleanupPullRequestAccess({ findPullRequestByBranch });
			branch.activeBranches.add("translate/file4.md");

			await (branch as unknown as { cleanup(): Promise<void> }).cleanup();

			expect(octokitMock.git.deleteRef).not.toHaveBeenCalled();
		});
	});
});
