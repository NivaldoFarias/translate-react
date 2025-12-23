import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { StatusCodes } from "http-status-codes";

import { BranchService } from "@/services/github/branch.service";

const mockFindPullRequestByBranch = mock(() => Promise.resolve(null));
const mockCheckPullRequestStatus = mock(() =>
	Promise.resolve({ needsUpdate: false, mergeableState: "clean" }),
);

/** Mocked Octokit instance structure */
const mockOctokit = {
	git: {
		getRef: mock(() =>
			Promise.resolve({
				data: { object: { sha: "abc123def456" } },
			}),
		),
		createRef: mock(() =>
			Promise.resolve({
				data: {
					ref: "refs/heads/test-branch",
					object: { sha: "abc123def456" },
				},
			}),
		),
		deleteRef: mock(() =>
			Promise.resolve({
				data: {},
				status: StatusCodes.NO_CONTENT,
			}),
		),
	},
	repos: {
		listCommits: mock(() =>
			Promise.resolve({
				data: [{ author: { login: "test-fork-owner" }, sha: "commit123" }],
			}),
		),
		get: mock(() =>
			Promise.resolve({
				data: { default_branch: "main" },
			}),
		),
	},
};

void mock.module("@octokit/rest", () => ({
	Octokit: class MockOctokit {
		git = mockOctokit.git;
		repos = mockOctokit.repos;
	},
}));

void mock.module("@/utils/setup-signal-handlers.util", () => ({
	setupSignalHandlers: mock(() => {
		/* empty */
	}),
}));

describe("BranchService", () => {
	let branchService: BranchService;

	const mockFork = { owner: "test-fork-owner", repo: "test-fork-repo" };

	afterAll(() => {
		mock.clearAllMocks();
	});

	beforeEach(() => {
		mockOctokit.git.getRef.mockClear();
		mockOctokit.git.createRef.mockClear();
		mockOctokit.git.deleteRef.mockClear();
		mockOctokit.repos.listCommits.mockClear();
		mockOctokit.repos.get.mockClear();
		mockFindPullRequestByBranch.mockClear();
		mockCheckPullRequestStatus.mockClear();

		mockOctokit.repos.get.mockImplementation(() =>
			Promise.resolve({
				data: { default_branch: "main" },
			}),
		);
		mockOctokit.git.getRef.mockImplementation(() =>
			Promise.resolve({
				data: { object: { sha: "abc123def456" } },
			}),
		);
		mockOctokit.git.createRef.mockImplementation(() =>
			Promise.resolve({
				data: {
					ref: "refs/heads/test-branch",
					object: { sha: "abc123def456" },
				},
			}),
		);
		mockOctokit.git.deleteRef.mockImplementation(() =>
			Promise.resolve({
				data: {},
				status: StatusCodes.NO_CONTENT,
			}),
		);
		mockFindPullRequestByBranch.mockImplementation(() => Promise.resolve(null));
		mockCheckPullRequestStatus.mockImplementation(() =>
			Promise.resolve({ needsUpdate: false, mergeableState: "clean" }),
		);

		branchService = new BranchService();
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

			expect(mockOctokit.git.getRef).toHaveBeenCalledWith({
				...mockFork,
				ref: "heads/main",
			});

			expect(mockOctokit.git.createRef).toHaveBeenCalledWith({
				...mockFork,
				ref: "refs/heads/feature/test",
				sha: "abc123def456",
			});

			expect(result).toBeDefined();
			expect(result.data).toBeDefined();
		});

		test("should create branch from specified base branch when base branch is provided", async () => {
			await branchService.createBranch("feature/test", "develop");

			expect(mockOctokit.git.getRef).toHaveBeenCalledWith({
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
			mockOctokit.git.createRef.mockImplementation(() =>
				Promise.reject(new Error("Branch creation failed")),
			);

			expect(branchService.createBranch("feature/test")).rejects.toThrow("Branch creation failed");

			const activeBranches = Array.from(branchService.activeBranches);

			expect(activeBranches).not.toContain("feature/test");
		});

		test("should handle base branch not found error", () => {
			mockOctokit.git.getRef.mockImplementation(() =>
				Promise.reject(new Error("Reference not found")),
			);

			expect(branchService.createBranch("feature/test", "nonexistent")).rejects.toThrow(
				"Reference not found",
			);
		});
	});

	describe("getBranch", () => {
		test("should retrieve branch information when branch exists", async () => {
			const result = await branchService.getBranch("main");

			expect(mockOctokit.git.getRef).toHaveBeenCalledWith({
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
			mockOctokit.git.getRef.mockImplementation(() => Promise.reject(notFoundError));

			const result = await branchService.getBranch("nonexistent");

			expect(result).toBeNull();
		});

		test("should re-throw non-404 errors", () => {
			const forbiddenError = Object.assign(new Error("Forbidden"), {
				status: StatusCodes.FORBIDDEN,
			});
			mockOctokit.git.getRef.mockImplementation(() => Promise.reject(forbiddenError));

			expect(branchService.getBranch("protected")).rejects.toThrow("Forbidden");
		});
	});

	describe("deleteBranch", () => {
		test("should delete branch and remove from tracking when deletion succeeds", async () => {
			await branchService.createBranch("feature/test");

			const result = await branchService.deleteBranch("feature/test");

			expect(mockOctokit.git.deleteRef).toHaveBeenCalledWith({
				...mockFork,
				ref: "heads/feature/test",
			});

			const activeBranches = Array.from(branchService.activeBranches);

			expect(activeBranches).not.toContain("feature/test");
			expect(result.status).toBe(StatusCodes.NO_CONTENT);
		});

		test("should not remove branch from tracking when deletion fails", async () => {
			await branchService.createBranch("feature/test");
			mockOctokit.git.deleteRef.mockImplementation(() =>
				Promise.reject(new Error("Deletion failed")),
			);

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

			expect(mockOctokit.git.getRef).toHaveBeenCalledWith({
				...mockFork,
				ref: "heads/feature/test",
			});

			expect(mockOctokit.repos.listCommits).toHaveBeenCalledWith({
				...mockFork,
				sha: "abc123def456",
			});

			expect(result).toBe(true);
		});

		test("should return false when fork owner has no commits", async () => {
			mockOctokit.repos.listCommits.mockImplementation(() =>
				Promise.resolve({
					data: [{ author: { login: "different-user" }, sha: "commit123" }],
				}),
			);

			const result = await branchService.checkIfCommitExistsOnFork("feature/test");

			expect(result).toBe(false);
		});

		test("should return false when no commits exist", async () => {
			mockOctokit.repos.listCommits.mockImplementation(() => Promise.resolve({ data: [] }));

			const result = await branchService.checkIfCommitExistsOnFork("feature/test");

			expect(result).toBe(false);
		});

		test("should handle missing author information", async () => {
			mockOctokit.repos.listCommits.mockImplementation(() =>
				Promise.resolve({
					data: [{ author: null as unknown as { login: string }, sha: "commit123" }],
				}),
			);

			const result = await branchService.checkIfCommitExistsOnFork("feature/test");

			expect(result).toBe(false);
		});
	});

	describe("Branch Name Validation", () => {
		test("should handle special characters in branch names", async () => {
			await branchService.createBranch("feature/test-branch_123");

			expect(mockOctokit.git.createRef).toHaveBeenCalledWith({
				...mockFork,
				ref: "refs/heads/feature/test-branch_123",
				sha: "abc123def456",
			});
		});

		test("should handle long branch names", async () => {
			const longBranchName = "feature/" + "a".repeat(100);

			await branchService.createBranch(longBranchName);

			expect(mockOctokit.git.createRef).toHaveBeenCalledWith({
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
			const rateLimitError = Object.assign(new Error("API rate limit exceeded"), {
				status: StatusCodes.FORBIDDEN,
			});
			mockOctokit.git.createRef.mockImplementation(() => Promise.reject(rateLimitError));

			expect(branchService.createBranch("feature/test")).rejects.toThrow("API rate limit exceeded");
		});
	});
});
