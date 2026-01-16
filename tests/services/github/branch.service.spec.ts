import {
	createGitMocks,
	createMockContentService,
	createMockOctokit,
	createReposMocks,
	testRepositories,
} from "@tests/mocks";
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { StatusCodes } from "http-status-codes";

import type { RestEndpointMethodTypes } from "@octokit/rest";
import type { MockContentService, MockOctokitGit, MockOctokitRepos } from "@tests/mocks";

import type { BranchServiceDependencies } from "@/services/";

import { BranchService } from "@/services/";

/** Test subclass to expose protected cleanup method */
class TestableBranchService extends BranchService {
	public async testCleanup(): Promise<void> {
		return this.cleanup();
	}
}

/** Creates test BranchService with exposed cleanup method */
function createTestableBranchService(
	overrides?: Partial<BranchServiceDependencies>,
	gitMocks?: MockOctokitGit,
	reposMocks?: MockOctokitRepos,
	contentServiceMock?: MockContentService,
): {
	service: TestableBranchService;
	mocks: { git: MockOctokitGit; repos: MockOctokitRepos; content: MockContentService };
} {
	const git = gitMocks ?? createGitMocks();
	const repos = reposMocks ?? createReposMocks();
	const content = contentServiceMock ?? createMockContentService();

	const defaults = {
		octokit: createMockOctokit({ git, repos }),
		repositories: testRepositories,
		contentService: content,
	};

	return {
		service: new TestableBranchService({
			...(defaults as unknown as BranchServiceDependencies),
			...overrides,
		}),
		mocks: { git, repos, content },
	};
}

/** Creates test BranchService with dependencies */
function createTestBranchService(
	overrides?: Partial<BranchServiceDependencies>,
	gitMocks?: MockOctokitGit,
	reposMocks?: MockOctokitRepos,
	contentServiceMock?: MockContentService,
): {
	service: BranchService;
	mocks: { git: MockOctokitGit; repos: MockOctokitRepos; content: MockContentService };
} {
	const git = gitMocks ?? createGitMocks();
	const repos = reposMocks ?? createReposMocks();
	const content = contentServiceMock ?? createMockContentService();

	const defaults = {
		octokit: createMockOctokit({ git, repos }),
		repositories: testRepositories,
		contentService: content,
	};

	return {
		service: new BranchService({
			...(defaults as unknown as BranchServiceDependencies),
			...overrides,
		}),
		mocks: { git, repos, content },
	};
}

void mock.module("@/utils/setup-signal-handlers.util", () => ({
	setupSignalHandlers: mock(() => {
		/* empty */
	}),
}));

describe("BranchService", () => {
	let branchService: BranchService;
	let gitMocks: MockOctokitGit;
	let reposMocks: MockOctokitRepos;

	const mockFork = { owner: "test-fork-owner", repo: "test-fork-repo" };

	afterAll(() => {
		mock.clearAllMocks();
	});

	beforeEach(() => {
		const { service, mocks } = createTestBranchService();
		branchService = service;
		gitMocks = mocks.git;
		reposMocks = mocks.repos;
	});

	afterEach(() => {
		branchService.activeBranches.clear();
	});

	describe("Constructor", () => {
		test("should initialize with empty active branches set when instantiated", () => {
			const activeBranches = Array.from(branchService.activeBranches);

			expect(branchService).toBeInstanceOf(BranchService);
			expect(activeBranches).toEqual([]);
		});
	});

	describe("createBranch", () => {
		test("should create branch from main when no base branch is specified", async () => {
			const result = await branchService.createBranch("feature/test");

			expect(gitMocks.getRef).toHaveBeenCalledWith({
				...mockFork,
				ref: "heads/main",
			});

			expect(gitMocks.createRef).toHaveBeenCalledWith({
				...mockFork,
				ref: "refs/heads/feature/test",
				sha: "abc123def456",
			});

			expect(result).toBeDefined();
			expect(result.data).toBeDefined();
		});

		test("should create branch from specified base branch when base branch is provided", async () => {
			await branchService.createBranch("feature/test", "develop");

			expect(gitMocks.getRef).toHaveBeenCalledWith({
				...mockFork,
				ref: "heads/develop",
			});
		});

		test("should track created branch when branch is created successfully", async () => {
			await branchService.createBranch("feature/test");

			const activeBranches = Array.from(branchService.activeBranches);

			expect(activeBranches).toContain("feature/test");
		});

		test("should handle branch creation errors and cleanup tracking when error occurs", () => {
			gitMocks.createRef.mockImplementation(() =>
				Promise.reject(new Error("Branch creation failed")),
			);

			expect(branchService.createBranch("feature/test")).rejects.toThrow("Branch creation failed");

			const activeBranches = Array.from(branchService.activeBranches);

			expect(activeBranches).not.toContain("feature/test");
		});

		test("should handle base branch not found error", () => {
			gitMocks.getRef.mockImplementation(() => Promise.reject(new Error("Reference not found")));

			expect(branchService.createBranch("feature/test", "nonexistent")).rejects.toThrow(
				"Reference not found",
			);
		});
	});

	describe("getBranch", () => {
		test("should retrieve branch information when branch exists", async () => {
			const result = await branchService.getBranch("main");

			expect(gitMocks.getRef).toHaveBeenCalledWith({
				...mockFork,
				ref: "heads/main",
			});

			expect(result).not.toBeNull();
			expect(result?.data.object.sha).toBe("abc123def456");
		});

		test("should return null for non-existent branch (404)", async () => {
			const notFoundError = Object.assign(new Error("Not Found"), {
				status: StatusCodes.NOT_FOUND,
			});
			gitMocks.getRef.mockImplementation(() => Promise.reject(notFoundError));

			const result = await branchService.getBranch("nonexistent");

			expect(result).toBeNull();
		});

		test("should re-throw non-404 errors", () => {
			const forbiddenError = Object.assign(new Error("Forbidden"), {
				status: StatusCodes.FORBIDDEN,
			});
			gitMocks.getRef.mockImplementation(() => Promise.reject(forbiddenError));

			expect(branchService.getBranch("protected")).rejects.toThrow("Forbidden");
		});
	});

	describe("deleteBranch", () => {
		test("should delete branch and remove from tracking when deletion succeeds", async () => {
			await branchService.createBranch("feature/test");

			const result = await branchService.deleteBranch("feature/test");

			expect(gitMocks.deleteRef).toHaveBeenCalledWith({
				...mockFork,
				ref: "heads/feature/test",
			});

			const activeBranches = Array.from(branchService.activeBranches);

			expect(activeBranches).not.toContain("feature/test");
			expect(result.status).toBe(StatusCodes.NO_CONTENT);
		});

		test("should not remove branch from tracking when deletion fails", async () => {
			await branchService.createBranch("feature/test");
			gitMocks.deleteRef.mockImplementation(() => Promise.reject(new Error("Deletion failed")));

			expect(branchService.deleteBranch("feature/test")).rejects.toThrow("Deletion failed");

			const activeBranches = Array.from(branchService.activeBranches);

			expect(activeBranches).toContain("feature/test");
		});
	});

	describe("getActiveBranches", () => {
		test("should return empty array when no branches tracked", () => {
			const activeBranches = Array.from(branchService.activeBranches);

			expect(activeBranches).toEqual([]);
		});

		test("should return list of tracked branches when branches exist", async () => {
			await branchService.createBranch("feature/branch1");
			await branchService.createBranch("feature/branch2");

			const activeBranches = Array.from(branchService.activeBranches);

			expect(activeBranches).toContain("feature/branch1");
			expect(activeBranches).toContain("feature/branch2");
			expect(activeBranches).toHaveLength(2);
		});

		test("should return copy of internal set when accessed multiple times", async () => {
			await branchService.createBranch("feature/test");

			const activeBranches1 = Array.from(branchService.activeBranches);
			const activeBranches2 = Array.from(branchService.activeBranches);

			expect(activeBranches1).not.toBe(activeBranches2);
			expect(activeBranches1).toEqual(activeBranches2);
		});
	});

	describe("checkIfCommitExistsOnFork", () => {
		test("should return true when fork owner has commits", async () => {
			const result = await branchService.checkIfCommitExistsOnFork("feature/test");

			expect(gitMocks.getRef).toHaveBeenCalledWith({
				...mockFork,
				ref: "heads/feature/test",
			});

			expect(reposMocks.listCommits).toHaveBeenCalledWith({
				...mockFork,
				sha: "abc123def456",
			});

			expect(result).toBe(true);
		});

		test("should return false when fork owner has no commits", async () => {
			reposMocks.listCommits.mockResolvedValueOnce({
				data: [{ author: { login: "different-user" }, sha: "commit123" }],
			} as RestEndpointMethodTypes["repos"]["listCommits"]["response"]);

			const result = await branchService.checkIfCommitExistsOnFork("feature/test");

			expect(result).toBe(false);
		});

		test("should return false when no commits exist", async () => {
			reposMocks.listCommits.mockImplementation(() => Promise.resolve({ data: [] }));

			const result = await branchService.checkIfCommitExistsOnFork("feature/test");

			expect(result).toBe(false);
		});

		test("should handle missing author information", async () => {
			reposMocks.listCommits.mockResolvedValueOnce({
				data: [{ author: null, sha: "commit123" }],
			} as RestEndpointMethodTypes["repos"]["listCommits"]["response"]);

			const result = await branchService.checkIfCommitExistsOnFork("feature/test");

			expect(result).toBe(false);
		});
	});

	describe("Branch Name Validation", () => {
		test("should handle special characters in branch names", async () => {
			await branchService.createBranch("feature/test-branch_123");

			expect(gitMocks.createRef).toHaveBeenCalledWith({
				...mockFork,
				ref: "refs/heads/feature/test-branch_123",
				sha: "abc123def456",
			});
		});

		test("should handle long branch names", async () => {
			const longBranchName = "feature/" + "a".repeat(100);

			await branchService.createBranch(longBranchName);

			expect(gitMocks.createRef).toHaveBeenCalledWith({
				...mockFork,
				ref: `refs/heads/${longBranchName}`,
				sha: "abc123def456",
			});
		});
	});

	describe("Concurrent Operations", () => {
		test("should handle concurrent branch creation", async () => {
			const promises = [
				branchService.createBranch("feature/concurrent1"),
				branchService.createBranch("feature/concurrent2"),
				branchService.createBranch("feature/concurrent3"),
			];

			await Promise.all(promises);

			const activeBranches = Array.from(branchService.activeBranches);

			expect(activeBranches).toHaveLength(3);
			expect(activeBranches).toContain("feature/concurrent1");
			expect(activeBranches).toContain("feature/concurrent2");
			expect(activeBranches).toContain("feature/concurrent3");
		});

		test("should handle concurrent cleanup operations", async () => {
			await branchService.createBranch("feature/test1");
			await branchService.createBranch("feature/test2");

			const cleanupPromises = [
				branchService.deleteBranch("feature/test1"),
				branchService.deleteBranch("feature/test2"),
			];

			await Promise.all(cleanupPromises);

			const activeBranches = Array.from(branchService.activeBranches);

			expect(activeBranches).toEqual([]);
		});
	});

	describe("Error Handling", () => {
		test("should handle rate limiting errors", () => {
			gitMocks.createRef.mockRejectedValueOnce(
				Object.assign(new Error("API rate limit exceeded"), { status: StatusCodes.FORBIDDEN }),
			);

			expect(branchService.createBranch("feature/test")).rejects.toThrow("API rate limit exceeded");
		});
	});

	describe("cleanup", () => {
		let branchService: TestableBranchService;
		let contentService: MockContentService;

		beforeEach(() => {
			const { service, mocks } = createTestableBranchService();
			branchService = service;
			gitMocks = mocks.git;
			contentService = mocks.content;
		});

		afterEach(() => {
			branchService.activeBranches.clear();
		});

		test("should delete branch without PR during cleanup", async () => {
			await branchService.createBranch("translate/orphan-branch");
			contentService.findPullRequestByBranch.mockResolvedValue(undefined);

			await branchService.testCleanup();

			expect(contentService.findPullRequestByBranch).toHaveBeenCalledWith(
				"translate/orphan-branch",
			);
			expect(gitMocks.deleteRef).toHaveBeenCalledWith({
				owner: testRepositories.fork.owner,
				repo: testRepositories.fork.repo,
				ref: "heads/translate/orphan-branch",
			});
		});

		test("should delete branch with conflicted PR during cleanup", async () => {
			await branchService.createBranch("translate/conflicted-branch");
			contentService.findPullRequestByBranch.mockResolvedValue({
				number: 123,
			} as RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number]);
			contentService.checkPullRequestStatus.mockResolvedValue({
				needsUpdate: true,
				mergeableState: "dirty",
				hasConflicts: false,
				mergeable: null,
			});

			await branchService.testCleanup();

			expect(contentService.checkPullRequestStatus).toHaveBeenCalledWith(123);
			expect(gitMocks.deleteRef).toHaveBeenCalled();
		});

		test("should preserve branch with valid PR during cleanup", async () => {
			await branchService.createBranch("translate/valid-pr-branch");
			contentService.findPullRequestByBranch.mockResolvedValue({
				number: 456,
			} as RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number]);
			contentService.checkPullRequestStatus.mockResolvedValue({
				needsUpdate: false,
				mergeableState: "clean",
				hasConflicts: false,
				mergeable: null,
			});

			await branchService.testCleanup();

			expect(contentService.findPullRequestByBranch).toHaveBeenCalledWith(
				"translate/valid-pr-branch",
			);
			expect(contentService.checkPullRequestStatus).toHaveBeenCalledWith(456);
			expect(gitMocks.deleteRef).not.toHaveBeenCalled();
		});

		test("should handle errors gracefully during cleanup", async () => {
			await branchService.createBranch("translate/error-branch");
			contentService.findPullRequestByBranch.mockRejectedValue(new Error("API Error"));

			await branchService.testCleanup();

			expect(branchService.activeBranches.has("translate/error-branch")).toBe(true);
		});

		test("should process multiple branches during cleanup", async () => {
			await branchService.createBranch("translate/branch1");
			await branchService.createBranch("translate/branch2");
			await branchService.createBranch("translate/branch3");

			contentService.findPullRequestByBranch
				.mockResolvedValueOnce(undefined)
				.mockResolvedValueOnce({
					number: 1,
				} as RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number])
				.mockResolvedValueOnce({
					number: 2,
				} as RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number]);

			contentService.checkPullRequestStatus
				.mockResolvedValueOnce({
					needsUpdate: false,
					mergeableState: "clean",
					hasConflicts: false,
					mergeable: null,
				})
				.mockResolvedValueOnce({
					needsUpdate: true,
					mergeableState: "dirty",
					hasConflicts: false,
					mergeable: null,
				});

			await branchService.testCleanup();

			expect(gitMocks.deleteRef).toHaveBeenCalledTimes(2);
		});

		test("should not delete any branches when all have valid PRs", async () => {
			await branchService.createBranch("translate/pr-branch");
			contentService.findPullRequestByBranch.mockResolvedValue({
				number: 789,
			} as RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number]);
			contentService.checkPullRequestStatus.mockResolvedValue({
				needsUpdate: false,
				mergeableState: "clean",
				hasConflicts: false,
				mergeable: null,
			});

			await branchService.testCleanup();

			expect(gitMocks.deleteRef).not.toHaveBeenCalled();
			expect(branchService.activeBranches.has("translate/pr-branch")).toBe(true);
		});
	});

	describe("checkIfCommitExistsOnFork - additional edge cases", () => {
		test("should return false when branch does not exist", async () => {
			const notFoundError = Object.assign(new Error("Not Found"), {
				status: StatusCodes.NOT_FOUND,
			});
			gitMocks.getRef.mockImplementation(() => Promise.reject(notFoundError));

			const result = await branchService.checkIfCommitExistsOnFork("nonexistent-branch");

			expect(result).toBe(false);
		});

		test("should throw mapped error when listCommits fails", () => {
			reposMocks.listCommits.mockRejectedValue(new Error("API Error"));

			expect(branchService.checkIfCommitExistsOnFork("feature/test")).rejects.toThrow("API Error");
		});
	});
});
