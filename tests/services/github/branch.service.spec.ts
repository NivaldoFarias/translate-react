/**
 * @fileoverview Tests for the {@link BranchService}.
 *
 * This test suite covers Git branch operations including branch creation, deletion,
 * cleanup management, and fork commit verification. Tests include proper error handling,
 * cleanup handlers, branch tracking, and GitHub API integration patterns.
 *
 * Key test coverage areas:
 * - Branch lifecycle management (create, get, delete)
 * - Active branch tracking and cleanup
 * - Process termination signal handling
 * - Fork commit verification
 * - Error scenarios and recovery
 * - GitHub API response validation
 */

import { Octokit } from "@octokit/rest";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { StatusCodes } from "http-status-codes";

import { BranchService } from "@/services/github/branch.service";

mock.module("@/utils/env.util", () => ({
	env: {
		REPO_FORK_OWNER: "test-fork-owner",
		GITHUB_TOKEN: "gho_test_token_with_40_characters_exactly",
	},
}));

describe("BranchService", () => {
	let branchService: BranchService;
	let mockOctokit: Octokit;
	let mockGetRef: ReturnType<typeof mock>;
	let mockCreateRef: ReturnType<typeof mock>;
	let mockDeleteRef: ReturnType<typeof mock>;
	let mockListCommits: ReturnType<typeof mock>;

	const mockUpstream = { owner: "upstream-owner", repo: "upstream-repo" };
	const mockFork = { owner: "test-fork-owner", repo: "fork-repo" };

	beforeEach(() => {
		mockGetRef = mock(() =>
			Promise.resolve({
				data: {
					object: { sha: "abc123def456" },
				},
			}),
		);

		mockCreateRef = mock(() =>
			Promise.resolve({
				data: {
					ref: "refs/heads/test-branch",
					object: { sha: "abc123def456" },
				},
			}),
		);

		mockDeleteRef = mock(() =>
			Promise.resolve({
				data: {},
				status: StatusCodes.NO_CONTENT,
			}),
		);

		mockListCommits = mock(() =>
			Promise.resolve({
				data: [
					{
						author: { login: "test-fork-owner" },
						sha: "commit123",
					},
				],
			}),
		);

		mockOctokit = {
			git: {
				getRef: mockGetRef,
				createRef: mockCreateRef,
				deleteRef: mockDeleteRef,
			},
			repos: {
				listCommits: mockListCommits,
			},
		} as unknown as Octokit;

		branchService = new BranchService(mockUpstream, mockFork);

		// @ts-expect-error
		branchService.octokit = mockOctokit;
	});

	afterEach(() => {
		mock.restore();
	});

	describe("Constructor", () => {
		test("should initialize with provided configuration", () => {
			expect(branchService).toBeInstanceOf(BranchService);

			// @ts-expect-error
			expect(branchService.upstream).toEqual(mockUpstream);
			// @ts-expect-error
			expect(branchService.fork).toEqual(mockFork);
		});

		test("should initialize empty active branches set", () => {
			const activeBranches = Array.from(branchService.activeBranches);
			expect(activeBranches).toEqual([]);
		});
	});

	describe("createBranch", () => {
		test("should create branch from main by default", async () => {
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

		test("should create branch from specified base branch", async () => {
			await branchService.createBranch("feature/test", "develop");

			expect(mockOctokit.git.getRef).toHaveBeenCalledWith({
				...mockFork,
				ref: "heads/develop",
			});
		});

		test("should track created branch for cleanup", async () => {
			await branchService.createBranch("feature/test");

			const activeBranches = Array.from(branchService.activeBranches);
			expect(activeBranches).toContain("feature/test");
		});

		test("should handle branch creation errors and cleanup tracking", async () => {
			mockOctokit.git.createRef.mockRejectedValueOnce(new Error("Branch creation failed"));

			expect(await branchService.createBranch("feature/test")).rejects.toThrow(
				"Branch creation failed",
			);

			const activeBranches = Array.from(branchService.activeBranches);
			expect(activeBranches).not.toContain("feature/test");
		});

		test("should handle base branch not found error", async () => {
			mockOctokit.git.getRef.mockRejectedValueOnce(new Error("Reference not found"));

			expect(await branchService.createBranch("feature/test", "nonexistent")).rejects.toThrow(
				"Reference not found",
			);
		});
	});

	describe("getBranch", () => {
		test("should retrieve branch information", async () => {
			const result = await branchService.getBranch("main");

			expect(mockOctokit.git.getRef).toHaveBeenCalledWith({
				...mockFork,
				ref: "heads/main",
			});

			expect(result).not.toBeNull();
			expect(result!.data.object.sha).toBe("abc123def456");
		});

		test("should return null for non-existent branch (404)", async () => {
			const error = new Error("Not Found");
			// @ts-expect-error
			error.status = StatusCodes.NOT_FOUND;
			mockOctokit.git.getRef.mockRejectedValueOnce(error);

			const result = await branchService.getBranch("nonexistent");
			expect(result).toBeNull();
		});

		test("should re-throw non-404 errors", async () => {
			const error = new Error("Forbidden");
			// @ts-expect-error
			error.status = StatusCodes.FORBIDDEN;
			mockOctokit.git.getRef.mockRejectedValueOnce(error);

			expect(await branchService.getBranch("protected")).rejects.toThrow("Forbidden");
		});
	});

	describe("deleteBranch", () => {
		test("should delete branch and remove from tracking", async () => {
			await branchService.createBranch("feature/test");

			const result = await branchService.deleteBranch("feature/test");

			expect(mockOctokit.git.deleteRef).toHaveBeenCalledWith({
				...mockFork,
				ref: "heads/feature/test",
			});

			const activeBranches = Array.from(branchService.activeBranches);
			expect(activeBranches).not.toContain("feature/test");
			expect(result.status).toBe(204);
		});

		test("should keep tracking if deletion fails", async () => {
			await branchService.createBranch("feature/test");
			mockOctokit.git.deleteRef.mockRejectedValueOnce(new Error("Deletion failed"));

			expect(await branchService.deleteBranch("feature/test")).rejects.toThrow("Deletion failed");

			const activeBranches = Array.from(branchService.activeBranches);
			expect(activeBranches).toContain("feature/test");
		});
	});

	describe("getActiveBranches", () => {
		test("should return empty array when no branches tracked", () => {
			const activeBranches = Array.from(branchService.activeBranches);
			expect(activeBranches).toEqual([]);
		});

		test("should return list of tracked branches", async () => {
			await branchService.createBranch("feature/branch1");
			await branchService.createBranch("feature/branch2");

			const activeBranches = Array.from(branchService.activeBranches);
			expect(activeBranches).toContain("feature/branch1");
			expect(activeBranches).toContain("feature/branch2");
			expect(activeBranches).toHaveLength(2);
		});

		test("should return copy of internal set", async () => {
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
			mockOctokit.repos.listCommits.mockResolvedValueOnce({
				data: [
					{
						author: { login: "different-user" },
						sha: "commit123",
					},
				],
			});

			const result = await branchService.checkIfCommitExistsOnFork("feature/test");
			expect(result).toBe(false);
		});

		test("should return false when no commits exist", async () => {
			mockOctokit.repos.listCommits.mockResolvedValueOnce({
				data: [],
			});

			const result = await branchService.checkIfCommitExistsOnFork("feature/test");
			expect(result).toBe(false);
		});

		test("should handle missing author information", async () => {
			mockOctokit.repos.listCommits.mockResolvedValueOnce({
				data: [
					{
						author: null,
						sha: "commit123",
					},
				],
			});

			const result = await branchService.checkIfCommitExistsOnFork("feature/test");
			expect(result).toBe(false);
		});
	});

	describe("Cleanup and Error Handling", () => {
		test("should clean up all active branches", async () => {
			await branchService.createBranch("feature/branch1");
			await branchService.createBranch("feature/branch2");

			// @ts-expect-error
			await branchService.cleanup();

			expect(mockOctokit.git.deleteRef).toHaveBeenCalledTimes(2);
			expect(mockOctokit.git.deleteRef).toHaveBeenCalledWith({
				...mockFork,
				ref: "heads/feature/branch1",
			});
			expect(mockOctokit.git.deleteRef).toHaveBeenCalledWith({
				...mockFork,
				ref: "heads/feature/branch2",
			});

			const activeBranches = Array.from(branchService.activeBranches);
			expect(activeBranches).toEqual([]);
		});

		test("should handle cleanup errors gracefully", async () => {
			await branchService.createBranch("feature/test");
			mockOctokit.git.deleteRef.mockRejectedValueOnce(new Error("Cleanup failed"));

			// @ts-expect-error
			expect(await branchService.cleanup()).rejects.toThrow("Cleanup failed");

			const activeBranches = Array.from(branchService.activeBranches);
			expect(activeBranches).toContain("feature/test");
		});

		test("should handle rate limiting", async () => {
			const rateLimitError = new Error("API rate limit exceeded");
			// @ts-expect-error
			rateLimitError.status = StatusCodes.FORBIDDEN;
			mockOctokit.git.createRef.mockRejectedValueOnce(rateLimitError);

			expect(await branchService.createBranch("feature/test")).rejects.toThrow(
				"API rate limit exceeded",
			);
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
});
