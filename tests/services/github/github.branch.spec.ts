import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { Octokit } from "@octokit/rest";

import type { SharedGitHubDependencies } from "@/services/github/github.types";

import { GitHubBranch } from "@/services/github/github.branch";

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

	describe("cleanup", () => {
		test("skips cleanup when cleanupContentAccess is not set", async () => {
			branch.activeBranches.add("some-branch");

			await (branch as unknown as { cleanup(): Promise<void> }).cleanup();

			expect(octokitMock.git.deleteRef).not.toHaveBeenCalled();
		});

		test("deletes branch when no PR exists", async () => {
			const findPullRequestByBranch = mock(() => Promise.resolve(undefined));
			const checkPullRequestStatus = mock(() => Promise.resolve({ needsUpdate: false }));

			branch.setCleanupContentAccess({
				findPullRequestByBranch,
				checkPullRequestStatus,
			});
			branch.activeBranches.add("translate/file1.md");

			await (branch as unknown as { cleanup(): Promise<void> }).cleanup();

			expect(findPullRequestByBranch).toHaveBeenCalledWith("translate/file1.md");
			expect(octokitMock.git.deleteRef).toHaveBeenCalledWith({
				...testRepositories.fork,
				ref: "heads/translate/file1.md",
			});
		});

		test("deletes branch when PR has needsUpdate", async () => {
			const findPullRequestByBranch = mock(() => Promise.resolve({ number: 42 }));
			const checkPullRequestStatus = mock(() => Promise.resolve({ needsUpdate: true }));

			branch.setCleanupContentAccess({
				findPullRequestByBranch,
				checkPullRequestStatus,
			});
			branch.activeBranches.add("translate/file2.md");

			await (branch as unknown as { cleanup(): Promise<void> }).cleanup();

			expect(checkPullRequestStatus).toHaveBeenCalledWith(42);
			expect(octokitMock.git.deleteRef).toHaveBeenCalledWith({
				...testRepositories.fork,
				ref: "heads/translate/file2.md",
			});
		});

		test("preserves branch when PR exists and does not need update", async () => {
			const findPullRequestByBranch = mock(() => Promise.resolve({ number: 123 }));
			const checkPullRequestStatus = mock(() => Promise.resolve({ needsUpdate: false }));

			branch.setCleanupContentAccess({
				findPullRequestByBranch,
				checkPullRequestStatus,
			});
			branch.activeBranches.add("translate/file3.md");

			await (branch as unknown as { cleanup(): Promise<void> }).cleanup();

			expect(checkPullRequestStatus).toHaveBeenCalledWith(123);
			expect(octokitMock.git.deleteRef).not.toHaveBeenCalled();
		});

		test("skips deletion when findPullRequestByBranch throws", async () => {
			const findPullRequestByBranch = mock(() => Promise.reject(new Error("API error")));
			const checkPullRequestStatus = mock(() => Promise.resolve({ needsUpdate: false }));

			branch.setCleanupContentAccess({
				findPullRequestByBranch,
				checkPullRequestStatus,
			});
			branch.activeBranches.add("translate/file4.md");

			await (branch as unknown as { cleanup(): Promise<void> }).cleanup();

			expect(octokitMock.git.deleteRef).not.toHaveBeenCalled();
		});
	});
});
