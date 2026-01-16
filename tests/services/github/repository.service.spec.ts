import {
	createGitMocks,
	createMockOctokit,
	createReposMocks,
	testRepositories,
} from "@tests/mocks";
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { StatusCodes } from "http-status-codes";

import type { Octokit, RestEndpointMethodTypes } from "@octokit/rest";
import type { MockOctokitGit, MockOctokitRepos } from "@tests/mocks";

import type { RepositoryServiceDependencies } from "@/services/";

import { RepositoryService } from "@/services/";

/** Creates test RepositoryService with dependencies */
function createTestRepositoryService(
	overrides?: Partial<RepositoryServiceDependencies>,
	gitMocks?: MockOctokitGit,
	reposMocks?: MockOctokitRepos,
): {
	service: RepositoryService;
	mocks: { git: MockOctokitGit; repos: MockOctokitRepos };
} {
	const git = gitMocks ?? createGitMocks();
	const repos = reposMocks ?? createReposMocks();

	const defaults = {
		octokit: createMockOctokit({ git, repos }),
		repositories: testRepositories,
	};

	return {
		service: new RepositoryService({
			...(defaults as unknown as RepositoryServiceDependencies),
			...overrides,
		}),
		mocks: { git, repos },
	};
}

describe("RepositoryService", () => {
	let repositoryService: RepositoryService;
	let gitMocks: MockOctokitGit;
	let reposMocks: MockOctokitRepos;

	afterAll(() => {
		mock.clearAllMocks();
	});

	beforeEach(() => {
		const { service, mocks } = createTestRepositoryService();
		repositoryService = service;
		gitMocks = mocks.git;
		reposMocks = mocks.repos;
	});

	describe("Constructor", () => {
		test("should initialize when valid dependencies are provided", () => {
			expect(repositoryService).toBeInstanceOf(RepositoryService);
		});
	});

	describe("getDefaultBranch", () => {
		test("should return default branch for fork when target is fork", async () => {
			const branch = await repositoryService.getDefaultBranch("fork");

			expect(reposMocks.get).toHaveBeenCalledWith(testRepositories.fork);
			expect(branch).toBe("main");
		});

		test("should return default branch for upstream when target is upstream", async () => {
			const branch = await repositoryService.getDefaultBranch("upstream");

			expect(reposMocks.get).toHaveBeenCalledWith(testRepositories.upstream);
			expect(branch).toBe("main");
		});

		test("should default to fork when no target is specified", async () => {
			const branch = await repositoryService.getDefaultBranch();

			expect(reposMocks.get).toHaveBeenCalledWith(testRepositories.fork);
			expect(branch).toBe("main");
		});

		test("should throw mapped error when API call fails", () => {
			reposMocks.get.mockRejectedValueOnce(
				Object.assign(new Error("Not Found"), { status: StatusCodes.NOT_FOUND }),
			);

			expect(repositoryService.getDefaultBranch("fork")).rejects.toThrow();
		});
	});

	describe("isBranchBehind", () => {
		test("should return false when branches are up-to-date (ahead_by = 0)", async () => {
			reposMocks.compareCommits.mockResolvedValue({
				data: { ahead_by: 0, behind_by: 0 },
			});

			const result = await repositoryService.isBranchBehind("feature-branch", "main", "fork");

			expect(result).toBe(false);
			expect(reposMocks.compareCommits).toHaveBeenCalledWith({
				...testRepositories.fork,
				base: "feature-branch",
				head: "main",
			});
		});

		test("should return true when head is behind base (ahead_by > 0)", async () => {
			reposMocks.compareCommits.mockResolvedValue({
				data: { ahead_by: 5, behind_by: 0 },
			});

			const result = await repositoryService.isBranchBehind("feature-branch", "main", "fork");

			expect(result).toBe(true);
		});

		test("should return false when head is ahead of base (behind_by > 0)", async () => {
			reposMocks.compareCommits.mockResolvedValue({
				data: { ahead_by: 0, behind_by: 3 },
			});

			const result = await repositoryService.isBranchBehind("feature-branch", "main", "fork");

			expect(result).toBe(false);
		});

		test("should use fork repository config by default", async () => {
			reposMocks.compareCommits.mockResolvedValue({
				data: { ahead_by: 0, behind_by: 0 },
			});

			await repositoryService.isBranchBehind("feature-branch", "main");

			expect(reposMocks.compareCommits).toHaveBeenCalledWith({
				...testRepositories.fork,
				base: "feature-branch",
				head: "main",
			});
		});

		test("should use upstream repository config when specified", async () => {
			reposMocks.compareCommits.mockResolvedValue({
				data: { ahead_by: 0, behind_by: 0 },
			});

			await repositoryService.isBranchBehind("feature-branch", "main", "upstream");

			expect(reposMocks.compareCommits).toHaveBeenCalledWith({
				...testRepositories.upstream,
				base: "feature-branch",
				head: "main",
			});
		});

		test("should return false when comparison fails", async () => {
			reposMocks.compareCommits.mockRejectedValue(new Error("API error"));

			const result = await repositoryService.isBranchBehind("feature-branch", "main", "fork");

			expect(result).toBe(false);
		});

		test("should handle diverged branches (both ahead and behind)", async () => {
			reposMocks.compareCommits.mockResolvedValue({
				data: { ahead_by: 3, behind_by: 2 },
			});

			const result = await repositoryService.isBranchBehind("feature-branch", "main", "fork");

			expect(result).toBe(true);
		});

		test("should work with translation branch naming pattern", async () => {
			reposMocks.compareCommits.mockResolvedValue({
				data: { ahead_by: 2, behind_by: 0 },
			});

			const result = await repositoryService.isBranchBehind(
				"translate/docs/intro.md",
				"main",
				"fork",
			);

			expect(result).toBe(true);
			expect(reposMocks.compareCommits).toHaveBeenCalledWith({
				...testRepositories.fork,
				base: "translate/docs/intro.md",
				head: "main",
			});
		});
	});

	describe("getRepositoryTree", () => {
		test("should return fork tree when target is fork", async () => {
			const tree = await repositoryService.getRepositoryTree("fork", "main", false);

			expect(gitMocks.getTree).toHaveBeenCalledWith({
				...testRepositories.fork,
				tree_sha: "main",
				recursive: "true",
			});
			expect(tree).toHaveLength(1);
		});

		test("should return upstream tree when target is upstream", async () => {
			const tree = await repositoryService.getRepositoryTree("upstream", "main", false);

			expect(gitMocks.getTree).toHaveBeenCalledWith({
				...testRepositories.upstream,
				tree_sha: "main",
				recursive: "true",
			});
			expect(tree).toHaveLength(1);
		});

		test("should default to fork when no target is specified", async () => {
			const tree = await repositoryService.getRepositoryTree(undefined, "main", false);

			expect(gitMocks.getTree).toHaveBeenCalledWith({
				...testRepositories.fork,
				tree_sha: "main",
				recursive: "true",
			});
			expect(tree).toHaveLength(1);
		});

		test("should fetch default branch when base branch is not specified", async () => {
			reposMocks.get.mockResolvedValueOnce({ data: { default_branch: "develop" } });

			await repositoryService.getRepositoryTree("fork", undefined, false);

			expect(reposMocks.get).toHaveBeenCalledWith(testRepositories.fork);
			expect(gitMocks.getTree).toHaveBeenCalledWith({
				...testRepositories.fork,
				tree_sha: "develop",
				recursive: "true",
			});
		});

		test("should fetch upstream default branch when upstream target specified", async () => {
			reposMocks.get.mockResolvedValueOnce({ data: { default_branch: "develop" } });

			await repositoryService.getRepositoryTree("upstream");

			expect(reposMocks.get).toHaveBeenCalledWith(testRepositories.upstream);
			expect(gitMocks.getTree).toHaveBeenCalledWith(
				expect.objectContaining({ tree_sha: "develop" }),
			);
		});

		test("should filter repository tree by default", async () => {
			gitMocks.getTree.mockResolvedValueOnce({
				data: {
					tree: [
						{ path: "src/test/file.md", type: "blob", sha: "abc123", url: "" },
						{ path: "README.md", type: "blob", sha: "def456", url: "" },
						{ path: "src/component.tsx", type: "blob", sha: "ghi789", url: "" },
						{ path: "file.md", type: "blob", sha: "jkl012", url: "" },
					],
				},
			});

			const tree = await repositoryService.getRepositoryTree("fork", "main");

			expect(tree).toHaveLength(1);
			expect(tree[0]?.path).toBe("src/test/file.md");
		});

		test("should not filter tree when filterIgnored is false", async () => {
			gitMocks.getTree.mockResolvedValueOnce({
				data: {
					tree: [
						{ path: "src/test/file.md", type: "blob", sha: "abc123", url: "" },
						{ path: "README.md", type: "blob", sha: "def456", url: "" },
					],
				},
			});

			const tree = await repositoryService.getRepositoryTree("fork", "main", false);

			expect(tree).toHaveLength(2);
		});

		test("should throw mapped error when API call fails", () => {
			gitMocks.getTree.mockRejectedValueOnce(
				Object.assign(new Error("Forbidden"), { status: StatusCodes.FORBIDDEN }),
			);

			expect(repositoryService.getRepositoryTree("fork", "main")).rejects.toThrow();
		});

		test("should return all upstream files for translation processing", async () => {
			gitMocks.getTree.mockResolvedValueOnce({
				data: {
					tree: [
						{ path: "src/file1.md", type: "blob", sha: "abc123", url: "" },
						{ path: "src/file2.md", type: "blob", sha: "def456", url: "" },
						{ path: "src/file3.md", type: "blob", sha: "xyz789", url: "" },
					],
				},
			});

			const candidateFiles = await repositoryService.getRepositoryTree("upstream", "main", false);

			expect(gitMocks.getTree).toHaveBeenCalledTimes(1);
			expect(gitMocks.getTree).toHaveBeenCalledWith({
				...testRepositories.upstream,
				tree_sha: "main",
				recursive: "true",
			});
			expect(candidateFiles).toHaveLength(3);
			expect(candidateFiles.map((f) => f.path)).toEqual([
				"src/file1.md",
				"src/file2.md",
				"src/file3.md",
			]);
		});

		test("should return empty array when repository has no files", async () => {
			gitMocks.getTree.mockResolvedValueOnce({
				data: { tree: [] },
			});

			const candidateFiles = await repositoryService.getRepositoryTree("upstream", "main", false);

			expect(candidateFiles).toHaveLength(0);
		});
	});

	describe("verifyTokenPermissions", () => {
		test("should return true when token has valid permissions", async () => {
			const mockOctokit = createMockOctokit();
			const { service } = createTestRepositoryService({
				octokit: mockOctokit as unknown as Octokit,
			});

			const result = await service.verifyTokenPermissions();

			expect(result).toBe(true);
		});

		test("should return false when token verification fails", async () => {
			const mockOctokit = createMockOctokit();
			mockOctokit.rest.repos.get.mockRejectedValueOnce(new Error("Unauthorized"));
			const { service } = createTestRepositoryService({
				octokit: mockOctokit as unknown as Octokit,
			});

			const result = await service.verifyTokenPermissions();

			expect(result).toBe(false);
		});
	});

	describe("forkExists", () => {
		test("should resolve when fork exists", () => {
			expect(repositoryService.forkExists()).resolves.toBeUndefined();
			expect(reposMocks.get).toHaveBeenCalledWith(testRepositories.fork);
		});

		test("should throw mapped error when fork does not exist", () => {
			reposMocks.get.mockRejectedValueOnce(
				Object.assign(new Error("Not Found"), { status: StatusCodes.NOT_FOUND }),
			);

			expect(repositoryService.forkExists()).rejects.toThrow();
		});
	});

	describe("isForkSynced", () => {
		test("should return true when fork and upstream have same latest commit", async () => {
			const sharedSha = "same-commit-sha-12345";
			reposMocks.listCommits.mockResolvedValueOnce({
				data: [{ sha: sharedSha }],
			} as RestEndpointMethodTypes["repos"]["listCommits"]["response"]);
			reposMocks.listCommits.mockResolvedValueOnce({
				data: [{ sha: sharedSha }],
			} as RestEndpointMethodTypes["repos"]["listCommits"]["response"]);

			const result = await repositoryService.isForkSynced();

			expect(result).toBe(true);
		});

		test("should return false when fork and upstream have different commits", async () => {
			let callCount = 0;
			reposMocks.listCommits.mockImplementation(() => {
				callCount++;
				return Promise.resolve({
					data: [
						{
							author: { login: "test-fork-owner" },
							sha: callCount === 1 ? "upstream-sha" : "fork-sha",
						},
					],
				} as RestEndpointMethodTypes["repos"]["listCommits"]["response"]);
			});

			const result = await repositoryService.isForkSynced();

			expect(result).toBe(false);
		});

		test("should return false when API call fails", async () => {
			reposMocks.get.mockRejectedValueOnce(new Error("API Error"));

			const result = await repositoryService.isForkSynced();

			expect(result).toBe(false);
		});
	});

	describe("syncFork", () => {
		test("should return true when fork is synced successfully", async () => {
			const mockOctokit = createMockOctokit();
			const { service } = createTestRepositoryService({
				octokit: mockOctokit as unknown as Octokit,
			});

			const result = await service.syncFork();

			expect(result).toBe(true);
			expect(mockOctokit.repos.mergeUpstream).toHaveBeenCalledWith({
				...testRepositories.fork,
				branch: "main",
			});
		});

		test("should return false when sync fails", async () => {
			const mockOctokit = createMockOctokit();
			mockOctokit.repos.mergeUpstream = mock(() => Promise.reject(new Error("Merge conflict")));
			const { service } = createTestRepositoryService({
				octokit: mockOctokit as unknown as Octokit,
			});

			const result = await service.syncFork();

			expect(result).toBe(false);
		});
	});

	describe("fetchGlossary", () => {
		test("should return glossary content when file exists", async () => {
			const glossaryContent = "React - React\ncomponent - componente";
			reposMocks.getContent.mockResolvedValueOnce({
				data: {
					content: Buffer.from(glossaryContent).toString("base64"),
					encoding: "base64",
					type: "file",
					sha: "abc123",
				},
			});

			const result = await repositoryService.fetchGlossary();

			expect(result).toBe(glossaryContent);
			expect(reposMocks.getContent).toHaveBeenCalledWith({
				...testRepositories.upstream,
				path: "GLOSSARY.md",
			});
		});

		test("should return null when glossary file has no content", async () => {
			reposMocks.getContent.mockResolvedValueOnce({ data: {} });

			const result = await repositoryService.fetchGlossary();

			expect(result).toBeNull();
		});

		test("should return null when glossary file does not exist", async () => {
			reposMocks.getContent.mockRejectedValueOnce(
				Object.assign(new Error("Not Found"), { status: StatusCodes.NOT_FOUND }),
			);

			const result = await repositoryService.fetchGlossary();

			expect(result).toBeNull();
		});
	});

	describe("filterRepositoryTree", () => {
		test("should filter out files without paths", async () => {
			gitMocks.getTree.mockResolvedValueOnce({
				data: {
					tree: [
						{ path: "src/test/file.md", type: "blob", sha: "abc123", url: "" },
						{ type: "blob", sha: "def456", url: "" },
					],
				},
			});

			const tree = await repositoryService.getRepositoryTree("fork", "main");

			expect(tree).toHaveLength(1);
		});

		test("should filter out non-markdown files", async () => {
			gitMocks.getTree.mockResolvedValueOnce({
				data: {
					tree: [
						{ path: "src/test/file.md", type: "blob", sha: "abc123", url: "" },
						{ path: "src/test/file.ts", type: "blob", sha: "def456", url: "" },
						{ path: "src/test/file.json", type: "blob", sha: "ghi789", url: "" },
					],
				},
			});

			const tree = await repositoryService.getRepositoryTree("fork", "main");

			expect(tree).toHaveLength(1);
			expect(tree[0]?.path).toBe("src/test/file.md");
		});

		test("should filter out files without src/ in path", async () => {
			gitMocks.getTree.mockResolvedValueOnce({
				data: {
					tree: [
						{ path: "src/test/file.md", type: "blob", sha: "abc123", url: "" },
						{ path: "docs/test/file.md", type: "blob", sha: "def456", url: "" },
					],
				},
			});

			const tree = await repositoryService.getRepositoryTree("fork", "main");

			expect(tree).toHaveLength(1);
			expect(tree[0]?.path).toBe("src/test/file.md");
		});

		test("should filter out root-level markdown files", async () => {
			gitMocks.getTree.mockResolvedValueOnce({
				data: {
					tree: [
						{ path: "src/test/file.md", type: "blob", sha: "abc123", url: "" },
						{ path: "README.md", type: "blob", sha: "def456", url: "" },
						{ path: "CONTRIBUTING.md", type: "blob", sha: "ghi789", url: "" },
					],
				},
			});

			const tree = await repositoryService.getRepositoryTree("fork", "main");

			expect(tree).toHaveLength(1);
		});
	});
});
