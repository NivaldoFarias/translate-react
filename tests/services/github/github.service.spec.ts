import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { StatusCodes } from "http-status-codes";

import type { components } from "@octokit/openapi-types";
import type { Octokit, RestEndpointMethodTypes } from "@octokit/rest";

import type { GitHubServiceDependencies } from "@/app/services/github/github.service";
import type { PatchedRepositoryTreeItem, ProcessedFileResult } from "@/app/services/github/types";

import type { MockOctokit } from "@tests/mocks";

import { GitHubService } from "@/app/services/github/github.service";
import { PullRequestProgressAction } from "@/app/services/github/types";
import { TranslationFile } from "@/app/services/translator/translation-file";

import {
	createOctokitRequestErrorFixture,
	createProcessedFileResultsFixture,
	createRepositoryTreeItemFixture,
	createTranslationFilesFixture,
} from "@tests/fixtures";
import { createMockCommentBuilderService, createMockOctokit, testRepositories } from "@tests/mocks";

/** Creates test GitHubService with dependencies */
function createTestGitHubService(overrides?: Partial<GitHubServiceDependencies>): GitHubService {
	return new GitHubService({
		octokit: overrides?.octokit ?? createMockOctokit(),
		repositories: overrides?.repositories ?? testRepositories,
		commentBuilderService: overrides?.commentBuilderService ?? createMockCommentBuilderService(),
	} as GitHubServiceDependencies);
}

void mock.module("@/app/utils/setup-signal-handlers.util", () => ({
	setupSignalHandlers: mock(() => {
		/* empty */
	}),
}));

describe("GitHubService", () => {
	let octokitMock: MockOctokit;
	let githubService: GitHubService;

	const mockFork = { owner: "test-fork-owner", repo: "test-fork-repo" };

	afterAll(() => {
		mock.clearAllMocks();
	});

	beforeEach(() => {
		octokitMock = createMockOctokit();
		githubService = createTestGitHubService({ octokit: octokitMock as unknown as Octokit });
	});

	describe("Repository Operations", () => {
		describe("getDefaultBranch", () => {
			test("should return default branch for fork when target is fork", async () => {
				const branch = await githubService.getDefaultBranch("fork");

				expect(octokitMock.repos.get).toHaveBeenCalledWith(testRepositories.fork);
				expect(branch).toBe("main");
			});

			test("should return default branch for upstream when target is upstream", async () => {
				const branch = await githubService.getDefaultBranch("upstream");

				expect(octokitMock.repos.get).toHaveBeenCalledWith(testRepositories.upstream);
				expect(branch).toBe("main");
			});

			test("should default to fork when no target is specified", async () => {
				const branch = await githubService.getDefaultBranch();

				expect(octokitMock.repos.get).toHaveBeenCalledWith(testRepositories.fork);
				expect(branch).toBe("main");
			});

			test("should throw RequestError when API call fails", () => {
				const notFoundError = createOctokitRequestErrorFixture({
					message: "Not Found",
					status: StatusCodes.NOT_FOUND,
				});
				octokitMock.repos.get.mockRejectedValueOnce(notFoundError);

				expect(githubService.getDefaultBranch("fork")).rejects.toThrow(notFoundError);
			});
		});

		describe("getRepositoryTree", () => {
			test("should return fork tree when target is fork", async () => {
				const tree = await githubService.getRepositoryTree("fork", "main");

				expect(octokitMock.git.getTree).toHaveBeenCalledWith({
					...testRepositories.fork,
					tree_sha: "main",
					recursive: "true",
				});
				expect(tree).toHaveLength(1);
			});

			test("should return upstream tree when target is upstream", async () => {
				const tree = await githubService.getRepositoryTree("upstream", "main");

				expect(octokitMock.git.getTree).toHaveBeenCalledWith({
					...testRepositories.upstream,
					tree_sha: "main",
					recursive: "true",
				});
				expect(tree).toHaveLength(1);
			});

			test("should default to fork when no target is specified", async () => {
				const tree = await githubService.getRepositoryTree(undefined, "main");

				expect(octokitMock.git.getTree).toHaveBeenCalledWith({
					...testRepositories.fork,
					tree_sha: "main",
					recursive: "true",
				});
				expect(tree).toHaveLength(1);
			});

			test("should fetch default branch when base branch is not specified", async () => {
				octokitMock.repos.get.mockResolvedValueOnce({ data: { default_branch: "develop" } });

				await githubService.getRepositoryTree("fork", undefined);

				expect(octokitMock.repos.get).toHaveBeenCalledWith(testRepositories.fork);
				expect(octokitMock.git.getTree).toHaveBeenCalledWith({
					...testRepositories.fork,
					tree_sha: "develop",
					recursive: "true",
				});
			});

			test("should filter repository tree by default", async () => {
				octokitMock.git.getTree.mockResolvedValueOnce({
					data: {
						tree: [
							{ path: "src/test/file.md", type: "blob", sha: "abc123", url: "", mode: "100644" },
							{ path: "README.md", type: "blob", sha: "def456", url: "", mode: "100644" },
							{ path: "src/component.tsx", type: "blob", sha: "ghi789", url: "", mode: "100644" },
							{ path: "file.md", type: "blob", sha: "jkl012", url: "", mode: "100644" },
						],
					},
				});

				const tree = await githubService.getRepositoryTree("fork", "main");

				expect(tree).toHaveLength(1);
				expect(tree[0]?.path).toBe("src/test/file.md");
			});

			test("should throw RequestError when API call fails", () => {
				const forbiddenError = createOctokitRequestErrorFixture({
					message: "Forbidden",
					status: StatusCodes.FORBIDDEN,
					options: { response: { status: StatusCodes.FORBIDDEN } },
				});
				octokitMock.git.getTree.mockRejectedValueOnce(forbiddenError);

				expect(githubService.getRepositoryTree("fork", "main")).rejects.toThrow(forbiddenError);
			});
		});

		describe("verifyTokenPermissions", () => {
			test("should return true when token has valid permissions", async () => {
				const result = await githubService.verifyTokenPermissions();

				expect(result).toBe(true);
			});

			test("should return false when token verification fails", async () => {
				octokitMock.rest.repos.get.mockRejectedValueOnce(new Error("Unauthorized"));

				const result = await githubService.verifyTokenPermissions();

				expect(result).toBe(false);
			});
		});

		describe("isBranchBehind", () => {
			test("should return false when branches are up-to-date", async () => {
				octokitMock.repos.compareCommits.mockResolvedValue({
					data: { ahead_by: 0, behind_by: 0 },
				});

				const result = await githubService.isBranchBehind("feature-branch", "main", "fork");

				expect(result).toBe(false);
				expect(octokitMock.repos.compareCommits).toHaveBeenCalledWith({
					...testRepositories.fork,
					base: "feature-branch",
					head: "main",
				});
			});

			test("should return true when head is behind base", async () => {
				octokitMock.repos.compareCommits.mockResolvedValue({
					data: { ahead_by: 5, behind_by: 0 },
				});

				const result = await githubService.isBranchBehind("feature-branch", "main", "fork");

				expect(result).toBe(true);
			});

			test("should return false when head is ahead of base", async () => {
				octokitMock.repos.compareCommits.mockResolvedValue({
					data: { ahead_by: 0, behind_by: 3 },
				});

				const result = await githubService.isBranchBehind("feature-branch", "main", "fork");

				expect(result).toBe(false);
			});

			test("should use fork repository config by default", async () => {
				octokitMock.repos.compareCommits.mockResolvedValue({
					data: { ahead_by: 0, behind_by: 0 },
				});

				await githubService.isBranchBehind("feature-branch", "main");

				expect(octokitMock.repos.compareCommits).toHaveBeenCalledWith({
					...testRepositories.fork,
					base: "feature-branch",
					head: "main",
				});
			});

			test("should return false when comparison fails", async () => {
				octokitMock.repos.compareCommits.mockRejectedValue(new Error("API error"));

				const result = await githubService.isBranchBehind("feature-branch", "main", "fork");

				expect(result).toBe(false);
			});
		});

		describe("forkExists", () => {
			test("should resolve when fork exists", () => {
				expect(githubService.forkExists()).resolves.toBeUndefined();
				expect(octokitMock.repos.get).toHaveBeenCalledWith(testRepositories.fork);
			});

			test("should throw RequestError when fork does not exist", () => {
				const notFoundError = createOctokitRequestErrorFixture({
					message: "Not Found",
					status: StatusCodes.NOT_FOUND,
					options: { response: { status: StatusCodes.NOT_FOUND } },
				});
				octokitMock.repos.get.mockRejectedValueOnce(notFoundError);

				expect(githubService.forkExists()).rejects.toThrow(notFoundError);
			});
		});

		describe("isForkSynced", () => {
			test("should return true when fork and upstream have same latest commit", async () => {
				const sharedSha = "same-commit-sha-12345";
				octokitMock.repos.listCommits.mockResolvedValueOnce({
					data: [{ sha: sharedSha }],
				} as RestEndpointMethodTypes["repos"]["listCommits"]["response"]);
				octokitMock.repos.listCommits.mockResolvedValueOnce({
					data: [{ sha: sharedSha }],
				} as RestEndpointMethodTypes["repos"]["listCommits"]["response"]);

				const result = await githubService.isForkSynced();

				expect(result).toBe(true);
			});

			test("should return false when fork and upstream have different commits", async () => {
				let callCount = 0;
				octokitMock.repos.listCommits.mockImplementation(() => {
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

				const result = await githubService.isForkSynced();

				expect(result).toBe(false);
			});

			test("should return false when API call fails", async () => {
				octokitMock.repos.get.mockRejectedValueOnce(new Error("API Error"));

				const result = await githubService.isForkSynced();

				expect(result).toBe(false);
			});
		});

		describe("syncFork", () => {
			test("should return true when fork is synced successfully", async () => {
				const result = await githubService.syncFork();

				expect(result).toBe(true);
				expect(octokitMock.repos.mergeUpstream).toHaveBeenCalledWith({
					...testRepositories.fork,
					branch: "main",
				});
			});

			test("should return false when sync fails", async () => {
				octokitMock.repos.mergeUpstream.mockRejectedValueOnce(new Error("Merge conflict"));

				const result = await githubService.syncFork();

				expect(result).toBe(false);
			});
		});

		describe("fetchTranslationGuidelinesFile", () => {
			test("should return translation guidelines content when first candidate file exists", async () => {
				const translationGuidelinesContent = "React - React\ncomponent - componente";
				octokitMock.repos.getContent.mockResolvedValueOnce({
					data: {
						content: Buffer.from(translationGuidelinesContent).toString("base64"),
						encoding: "base64",
						type: "file",
						sha: "abc123",
					},
				});

				const result = await githubService.fetchTranslationGuidelinesFile();

				expect(result).toBe(translationGuidelinesContent);
				expect(octokitMock.repos.getContent).toHaveBeenCalledWith({
					...testRepositories.upstream,
					path: "GLOSSARY.md",
				});
			});

			test("should try next candidate when first file does not exist", async () => {
				const translationGuidelinesContent = "## Translation Guidelines";
				octokitMock.repos.getContent.mockRejectedValueOnce(
					Object.assign(new Error("Not Found"), { status: StatusCodes.NOT_FOUND }),
				);
				octokitMock.repos.getContent.mockResolvedValueOnce({
					data: {
						content: Buffer.from(translationGuidelinesContent).toString("base64"),
						encoding: "base64",
						type: "file",
						sha: "def456",
					},
				});

				const result = await githubService.fetchTranslationGuidelinesFile();

				expect(result).toBe(translationGuidelinesContent);
				expect(octokitMock.repos.getContent).toHaveBeenCalledTimes(2);
				expect(octokitMock.repos.getContent).toHaveBeenNthCalledWith(1, {
					...testRepositories.upstream,
					path: "GLOSSARY.md",
				});
				expect(octokitMock.repos.getContent).toHaveBeenNthCalledWith(2, {
					...testRepositories.upstream,
					path: "TRANSLATION.md",
				});
			});

			test("should return null when translation guidelines file has no content", async () => {
				octokitMock.repos.getContent.mockResolvedValue({ data: {} });

				const result = await githubService.fetchTranslationGuidelinesFile();

				expect(result).toBeNull();
			});

			test("should return null when no candidate files exist", async () => {
				const notFoundError = Object.assign(new Error("Not Found"), {
					status: StatusCodes.NOT_FOUND,
				});
				octokitMock.repos.getContent.mockRejectedValue(notFoundError);

				const result = await githubService.fetchTranslationGuidelinesFile();

				expect(result).toBeNull();
			});
		});
	});

	describe("Branch Operations", () => {
		describe("createBranch", () => {
			test("should create branch from main when no base branch is specified", async () => {
				const result = await githubService.createBranch("feature/test");

				expect(octokitMock.git.getRef).toHaveBeenCalledWith({
					...mockFork,
					ref: "heads/main",
				});

				expect(octokitMock.git.createRef).toHaveBeenCalledWith({
					...mockFork,
					ref: "refs/heads/feature/test",
					sha: "abc123def456",
				});

				expect(result).toBeDefined();
				expect(result.data).toBeDefined();
			});

			test("should create branch from specified base branch when base branch is provided", async () => {
				await githubService.createBranch("feature/test", "develop");

				expect(octokitMock.git.getRef).toHaveBeenCalledWith({
					...mockFork,
					ref: "heads/develop",
				});
			});

			test("should handle branch creation errors when error occurs", () => {
				octokitMock.git.createRef.mockImplementation(() =>
					Promise.reject(new Error("Branch creation failed")),
				);

				expect(githubService.createBranch("feature/test")).rejects.toThrow(
					"Branch creation failed",
				);
			});

			test("should handle base branch not found error", () => {
				octokitMock.git.getRef.mockImplementation(() =>
					Promise.reject(new Error("Reference not found")),
				);

				expect(githubService.createBranch("feature/test", "nonexistent")).rejects.toThrow(
					"Reference not found",
				);
			});
		});

		describe("getBranch", () => {
			test("should retrieve branch information when branch exists", async () => {
				const result = await githubService.getBranch("main");

				expect(octokitMock.git.getRef).toHaveBeenCalledWith({
					...mockFork,
					ref: "heads/main",
				});

				expect(result).not.toBeNull();
				expect(result?.data.object.sha).toBe("abc123def456");
			});

			test("should return undefined for non-existent branch (404)", async () => {
				const notFoundError = createOctokitRequestErrorFixture({
					message: "Not Found",
					status: StatusCodes.NOT_FOUND,
				});
				octokitMock.git.getRef.mockImplementation(() => Promise.reject(notFoundError));

				const result = await githubService.getBranch("nonexistent");

				expect(result).toBeUndefined();
			});

			test("should re-throw non-404 errors", () => {
				const forbiddenError = createOctokitRequestErrorFixture({
					message: "Forbidden",
					status: StatusCodes.FORBIDDEN,
				});
				octokitMock.git.getRef.mockImplementation(() => Promise.reject(forbiddenError));

				expect(githubService.getBranch("protected")).rejects.toThrow(forbiddenError);
			});
		});

		describe("deleteBranch", () => {
			test("should delete branch when deletion succeeds", async () => {
				await githubService.createBranch("feature/test");

				const result = await githubService.deleteBranch("feature/test");

				expect(octokitMock.git.deleteRef).toHaveBeenCalledWith({
					...mockFork,
					ref: "heads/feature/test",
				});

				expect(result.status).toBe(StatusCodes.NO_CONTENT);
			});

			test("should not remove branch from tracking when deletion fails", async () => {
				await githubService.createBranch("feature/test");
				octokitMock.git.deleteRef.mockImplementation(() =>
					Promise.reject(new Error("Deletion failed")),
				);

				expect(githubService.deleteBranch("feature/test")).rejects.toThrow("Deletion failed");
			});
		});
	});

	describe("Content and Pull Request Operations", () => {
		let fixtures: {
			processedFileResults: ProcessedFileResult[];
			translationFiles: TranslationFile[];
		};

		beforeEach(() => {
			fixtures = {
				processedFileResults: createProcessedFileResultsFixture({ count: 2 }),
				translationFiles: createTranslationFilesFixture({ count: 2 }),
			};
		});

		describe("commitTranslation", () => {
			test("should commit translation when valid translation data is provided", async () => {
				const mockBranch = {
					ref: "refs/heads/translate/test",
					node_id: "branch-node-id",
					url: "https://api.github.com/repos/test/test/git/refs/heads/translate/test",
					object: {
						type: "commit",
						sha: "branch-sha",
						url: "https://api.github.com/repos/test/test/git/commits/branch-sha",
					},
				};

				const mockFile = new TranslationFile(
					"# Original Content",
					"file.md",
					"src/test/file.md",
					"stale-tree-sha",
				);

				const result = await githubService.commitTranslation({
					branch: mockBranch,
					file: mockFile,
					content: "# Translated Content",
					message: "test: translate content",
				});

				expect(result).toBeDefined();
				expect(octokitMock.repos.getContent).toHaveBeenCalledWith({
					...testRepositories.fork,
					path: mockFile.path,
					ref: mockBranch.ref,
				});
				expect(octokitMock.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
					expect.objectContaining({
						...testRepositories.fork,
						path: mockFile.path,
						branch: mockBranch.ref,
						sha: "abc123",
					}),
				);
			});

			test("should use branch-tip blob sha from getContent when it differs from the tree file sha", async () => {
				octokitMock.repos.getContent.mockResolvedValueOnce({
					data: {
						type: "file",
						encoding: "base64",
						content: Buffer.from("# On branch").toString("base64"),
						sha: "branch-tip-sha-999",
					},
				});

				const mockBranch = {
					ref: "refs/heads/translate/reused",
					node_id: "branch-node-id",
					url: "https://api.github.com/repos/test/test/git/refs/heads/translate/reused",
					object: { type: "commit", sha: "branch-sha", url: "" },
				};

				const mockFile = new TranslationFile(
					"# Original",
					"file.md",
					"src/learn/react-v18.md",
					"tree-discovery-sha",
				);

				await githubService.commitTranslation({
					branch: mockBranch,
					file: mockFile,
					content: "# Translated",
					message: "translate: test",
				});

				expect(octokitMock.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
					expect.objectContaining({
						sha: "branch-tip-sha-999",
					}),
				);
			});

			test("should omit sha when file is missing on the branch (getContent 404)", async () => {
				const notFoundError = createOctokitRequestErrorFixture({
					message: "Not Found",
					status: StatusCodes.NOT_FOUND,
					options: { request: { method: "GET" }, response: { status: StatusCodes.NOT_FOUND } },
				});
				octokitMock.repos.getContent.mockRejectedValueOnce(notFoundError);

				const mockBranch = {
					ref: "refs/heads/translate/new-file",
					node_id: "branch-node-id",
					url: "https://api.github.com/repos/test/test/git/refs/heads/translate/new-file",
					object: { type: "commit", sha: "branch-sha", url: "" },
				};

				const mockFile = new TranslationFile("# Original", "new.md", "src/new.md", "tree-sha");

				await githubService.commitTranslation({
					branch: mockBranch,
					file: mockFile,
					content: "# Translated",
					message: "translate: add file",
				});

				expect(octokitMock.repos.createOrUpdateFileContents).toHaveBeenCalledWith({
					...testRepositories.fork,
					path: mockFile.path,
					message: "translate: add file",
					content: Buffer.from("# Translated").toString("base64"),
					branch: mockBranch.ref,
				});
			});

			test("should throw RequestError when commit fails", () => {
				const commitError = createOctokitRequestErrorFixture({
					message: "Commit failed",
					status: StatusCodes.BAD_REQUEST,
					options: { request: { method: "PUT" }, response: { status: StatusCodes.BAD_REQUEST } },
				});
				octokitMock.repos.createOrUpdateFileContents.mockRejectedValueOnce(commitError);

				const mockBranch = {
					ref: "refs/heads/translate/test",
					node_id: "branch-node-id",
					url: "https://api.github.com/repos/test/test/git/refs/heads/translate/test",
					object: { type: "commit", sha: "branch-sha", url: "" },
				};

				const mockFile = new TranslationFile("# Original", "file.md", "src/test/file.md", "abc123");

				expect(
					githubService.commitTranslation({
						branch: mockBranch,
						file: mockFile,
						content: "# Translated",
						message: "translate: test",
					}),
				).rejects.toThrow(commitError);
			});

			test("should propagate non-404 errors from getContent before commit", () => {
				const rateLimitError = createOctokitRequestErrorFixture({
					message: "API rate limit exceeded",
					status: StatusCodes.TOO_MANY_REQUESTS,
					options: {
						request: { method: "GET" },
						response: { status: StatusCodes.TOO_MANY_REQUESTS },
					},
				});
				octokitMock.repos.getContent.mockRejectedValueOnce(rateLimitError);

				const mockBranch = {
					ref: "refs/heads/translate/test",
					node_id: "branch-node-id",
					url: "https://api.github.com/repos/test/test/git/refs/heads/translate/test",
					object: { type: "commit", sha: "branch-sha", url: "" },
				};

				const mockFile = new TranslationFile("# Original", "file.md", "src/test/file.md", "abc123");

				expect(
					githubService.commitTranslation({
						branch: mockBranch,
						file: mockFile,
						content: "# Translated",
						message: "translate: test",
					}),
				).rejects.toThrow(rateLimitError);
			});
		});

		describe("createPullRequest", () => {
			test("should create pull request when valid PR data is provided", async () => {
				const pr = await githubService.createPullRequest({
					branch: "translate/test",
					title: "test: new translation",
					body: "Adds test translation",
				});

				expect(pr.number).toBe(1);
				expect(pr.html_url).toBe("https://github.com/test/test/pull/1");
			});

			test("should use custom base branch when specified", async () => {
				await githubService.createPullRequest({
					branch: "translate/test",
					title: "Test PR",
					body: "Test body",
					baseBranch: "develop",
				});

				expect(octokitMock.pulls.create).toHaveBeenCalledWith(
					expect.objectContaining({ base: "develop" }),
				);
			});

			test("should throw RequestError when PR creation fails", () => {
				const prError = createOctokitRequestErrorFixture({
					status: StatusCodes.UNPROCESSABLE_ENTITY,
					message: "PR creation failed",
					options: {
						request: { method: "POST" },
						response: { status: StatusCodes.UNPROCESSABLE_ENTITY },
					},
				});
				octokitMock.pulls.create.mockRejectedValueOnce(prError);

				expect(
					githubService.createPullRequest({
						branch: "translate/test",
						title: "Test PR",
						body: "Test body",
					}),
				).rejects.toThrow(prError);
			});
		});

		describe("getFile", () => {
			test("should get upstream file content at default branch when file exists", async () => {
				const repoTreeItem: PatchedRepositoryTreeItem = createRepositoryTreeItemFixture({
					path: "src/test/file.md",
					sha: "abc123",
					filename: "file.md",
				});

				const file = await githubService.getFile(repoTreeItem);

				expect(file.content).toBe("# Test Content");
				expect(file.sha).toBe("abc123");
				expect(file.path).toBe("src/test/file.md");
				expect(file.filename).toBe("file.md");
				expect(octokitMock.repos.getContent).toHaveBeenCalledWith({
					...testRepositories.upstream,
					path: "src/test/file.md",
					ref: "main",
				});
				expect(octokitMock.git.getBlob).not.toHaveBeenCalled();
			});

			test("should handle file content errors when file does not exist", () => {
				const notFoundError = createOctokitRequestErrorFixture({
					status: StatusCodes.NOT_FOUND,
					message: "Not Found",
					options: {
						request: { method: "GET" },
						response: { status: StatusCodes.NOT_FOUND },
					},
				});
				octokitMock.repos.getContent.mockRejectedValueOnce(notFoundError);

				const repoTreeItem: PatchedRepositoryTreeItem = createRepositoryTreeItemFixture({
					path: "src/test/non-existent.md",
					sha: "missing",
					filename: "non-existent.md",
				});

				expect(githubService.getFile(repoTreeItem)).rejects.toThrow(notFoundError);
			});
		});

		describe("listOpenPullRequests", () => {
			test("should return list of open pull requests when called", async () => {
				octokitMock.paginate.mockResolvedValueOnce([
					{ number: 1, title: "PR 1" },
					{ number: 2, title: "PR 2" },
				] as RestEndpointMethodTypes["pulls"]["list"]["response"]["data"]);

				const prs = await githubService.listOpenPullRequests();

				expect(prs).toHaveLength(2);
				expect(octokitMock.paginate).toHaveBeenCalledWith("GET /repos/{owner}/{repo}/pulls", {
					...testRepositories.upstream,
					state: "open",
					per_page: 100,
				});
			});

			test("should return empty array when no open PRs exist", async () => {
				octokitMock.pulls.list.mockResolvedValueOnce({ data: [] });

				const prs = await githubService.listOpenPullRequests();

				expect(prs).toHaveLength(0);
			});

			test("should throw RequestError when API call fails", () => {
				const apiError = createOctokitRequestErrorFixture({ message: "API Error" });
				octokitMock.paginate.mockRejectedValueOnce(apiError);

				expect(githubService.listOpenPullRequests()).rejects.toThrow(apiError);
			});
		});

		describe("getPullRequestFiles", () => {
			test("should return list of file paths when PR has files", async () => {
				octokitMock.paginate.mockResolvedValueOnce([
					{ filename: "src/file1.md" },
					{ filename: "src/file2.md" },
				]);

				const files = await githubService.getPullRequestFiles(123);

				expect(files).toEqual(["src/file1.md", "src/file2.md"]);
				expect(octokitMock.paginate).toHaveBeenCalledWith(
					"GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
					{ ...testRepositories.upstream, pull_number: 123, per_page: 100 },
				);
			});

			test("should return empty array when PR has no files", async () => {
				octokitMock.paginate.mockResolvedValueOnce([]);

				const files = await githubService.getPullRequestFiles(123);

				expect(files).toEqual([]);
			});

			test("should throw RequestError when API call fails", () => {
				const apiError = createOctokitRequestErrorFixture({ message: "API Error" });
				octokitMock.paginate.mockRejectedValue(apiError);

				expect(githubService.getPullRequestFiles(123)).rejects.toThrow(apiError);
			});

			test("should retry pull request file list fetch before failing", async () => {
				const apiError = createOctokitRequestErrorFixture({ message: "Transient API Error" });
				octokitMock.paginate
					.mockRejectedValueOnce(apiError)
					.mockRejectedValueOnce(apiError)
					.mockResolvedValueOnce([{ filename: "src/file1.md" }]);

				const files = await githubService.getPullRequestFiles(456);

				expect(files).toEqual(["src/file1.md"]);
				expect(octokitMock.paginate).toHaveBeenCalledTimes(3);
			});
		});

		describe("listPullRequestIssueComments", () => {
			test("should return normalized issue comments for a pull request", async () => {
				octokitMock.paginate.mockResolvedValueOnce([
					{
						user: { login: "maintainer", type: "User" },
						author_association: "MEMBER",
						created_at: "2026-06-01T12:00:00Z",
						body: "Please fix the heading.",
					},
				]);

				const comments = await githubService.listPullRequestIssueComments(42);

				expect(comments).toEqual([
					{
						login: "maintainer",
						authorAssociation: "MEMBER",
						userType: "User",
						createdAt: new Date("2026-06-01T12:00:00Z"),
						body: "Please fix the heading.",
					},
				]);
				expect(octokitMock.paginate).toHaveBeenCalledWith(
					"GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
					{ ...testRepositories.upstream, issue_number: 42, per_page: 100 },
				);
			});
		});

		describe("findPullRequestByBranch", () => {
			test("should return PR when branch matches", async () => {
				octokitMock.pulls.list.mockResolvedValueOnce({
					data: [{ number: 1, head: { ref: "translate/test" }, title: "Test PR" }],
				} as RestEndpointMethodTypes["pulls"]["list"]["response"]);

				const pr = await githubService.findPullRequestByBranch("translate/test");

				expect(pr?.number).toBe(1);
				expect(octokitMock.pulls.list).toHaveBeenCalledWith({
					...testRepositories.upstream,
					head: `${testRepositories.fork.owner}:translate/test`,
				});
			});

			test("should return undefined when no PR matches branch", async () => {
				octokitMock.pulls.list.mockResolvedValueOnce({ data: [] });

				const pr = await githubService.findPullRequestByBranch("translate/test");

				expect(pr).toBeUndefined();
			});

			test("should throw RequestError when API call fails", () => {
				const apiError = createOctokitRequestErrorFixture({ message: "API Error" });
				octokitMock.pulls.list.mockRejectedValueOnce(apiError);

				expect(githubService.findPullRequestByBranch("translate/test")).rejects.toThrow(apiError);
			});
		});

		describe("createCommentOnPullRequest", () => {
			test("should create comment on PR successfully", async () => {
				octokitMock.issues.createComment.mockResolvedValueOnce({
					data: { id: 123, body: "Test comment" },
				});

				const result = await githubService.createCommentOnPullRequest(42, "Test comment");

				expect(result.data.id).toBe(123);
				expect(octokitMock.issues.createComment).toHaveBeenCalledWith({
					...testRepositories.upstream,
					issue_number: 42,
					body: "Test comment",
				});
			});

			test("should throw RequestError when comment creation fails", () => {
				const commentError = createOctokitRequestErrorFixture({
					message: "Comment failed",
					status: StatusCodes.BAD_REQUEST,
					options: { request: { method: "POST" }, response: { status: StatusCodes.BAD_REQUEST } },
				});
				octokitMock.issues.createComment.mockRejectedValueOnce(commentError);

				expect(githubService.createCommentOnPullRequest(42, "Test")).rejects.toThrow(commentError);
			});
		});

		describe("checkPullRequestStatus", () => {
			test("should return clean status when PR is mergeable", async () => {
				octokitMock.pulls.get.mockImplementation(() =>
					Promise.resolve({
						data: {
							number: 1,
							mergeable: true,
							mergeable_state: "clean",
							user: { login: "test-user" },
						},
					}),
				);

				const status = await githubService.checkPullRequestStatus(1);

				expect(status.hasConflicts).toBe(false);
				expect(status.needsUpdate).toBe(false);
				expect(status.mergeableState).toBe("clean");
				expect(status.createdBy).toBe("test-user");
			});

			test("should return dirty status when PR has conflicts", async () => {
				octokitMock.pulls.get.mockResolvedValueOnce({
					data: {
						number: 1,
						mergeable: false,
						mergeable_state: "dirty",
						user: { login: "other-user" },
					},
				});

				const status = await githubService.checkPullRequestStatus(1);

				expect(status.hasConflicts).toBe(true);
				expect(status.needsUpdate).toBe(true);
				expect(status.mergeableState).toBe("dirty");
				expect(status.createdBy).toBe("other-user");
			});

			test("should return behind status without conflicts", async () => {
				octokitMock.pulls.get.mockResolvedValueOnce({
					data: {
						number: 1,
						mergeable: true,
						mergeable_state: "behind",
						user: { login: "test-fork-owner" },
					},
				});

				const status = await githubService.checkPullRequestStatus(1);

				expect(status.hasConflicts).toBe(false);
				expect(status.needsUpdate).toBe(false);
				expect(status.mergeableState).toBe("behind");
				expect(status.createdBy).toBe("test-fork-owner");
			});

			test("should return creator login when user exists", async () => {
				octokitMock.pulls.get.mockResolvedValueOnce({
					data: {
						number: 1,
						mergeable: true,
						mergeable_state: "clean",
						user: { login: "test-creator" },
					},
				});

				const status = await githubService.checkPullRequestStatus(1);

				expect(status.createdBy).toBe("test-creator");
			});

			test("should throw RequestError when API call fails", () => {
				const apiError = createOctokitRequestErrorFixture({ message: "API Error" });
				octokitMock.pulls.get.mockImplementation(() => Promise.reject(apiError));

				expect(githubService.checkPullRequestStatus(1)).rejects.toThrow(apiError);
			});
		});

		describe("closePullRequest", () => {
			test("should close PR successfully", async () => {
				octokitMock.pulls.update.mockResolvedValueOnce({ data: { number: 42, state: "closed" } });

				const result = await githubService.closePullRequest(42);

				expect(result.state).toBe("closed");
				expect(octokitMock.pulls.update).toHaveBeenCalledWith({
					...testRepositories.upstream,
					pull_number: 42,
					state: "closed",
				});
			});

			test("should throw RequestError when PR closure fails", () => {
				const closeError = createOctokitRequestErrorFixture({
					message: "Close failed",
					status: StatusCodes.BAD_REQUEST,
					options: { request: { method: "PATCH" }, response: { status: StatusCodes.BAD_REQUEST } },
				});
				octokitMock.pulls.update.mockRejectedValueOnce(closeError);

				expect(githubService.closePullRequest(42)).rejects.toThrow(closeError);
			});
		});

		describe("commentCompiledResultsOnIssue", () => {
			test("should log error when no progress issue is found", () => {
				octokitMock.rest.search.issuesAndPullRequests.mockResolvedValueOnce({
					data: { total_count: 0, items: [] },
				});

				expect(
					githubService.commentCompiledResultsOnIssue(
						fixtures.processedFileResults,
						fixtures.translationFiles,
					),
				).resolves.toBeUndefined();
			});

			test("should create a new comment when progress issue exists", async () => {
				octokitMock.rest.search.issuesAndPullRequests.mockResolvedValueOnce({
					data: {
						items: [
							{ number: 123, state: "open" } as components["schemas"]["issue-search-result-item"],
						],
						total_count: 1,
					},
				});

				octokitMock.issues.createComment.mockResolvedValueOnce({
					data: { id: 1, html_url: "https://github.com/test/test/issues/123#comment-1" },
				});

				const result = await githubService.commentCompiledResultsOnIssue(
					fixtures.processedFileResults,
					fixtures.translationFiles,
				);
				expect(result).toBeDefined();
				expect(octokitMock.issues.createComment).toHaveBeenCalledWith(
					expect.objectContaining({
						issue_number: 123,
					}),
				);
			});

			test("should skip commenting when no pull requests were produced", async () => {
				const failedOnly = createProcessedFileResultsFixture({ count: 1, containInvalid: true });

				const result = await githubService.commentCompiledResultsOnIssue(
					failedOnly,
					fixtures.translationFiles,
				);

				expect(result).toBeUndefined();
				expect(octokitMock.issues.createComment).not.toHaveBeenCalled();
			});

			test("should skip commenting when only existing pull requests were reused", async () => {
				const reusedOnly: ProcessedFileResult[] = [
					{
						branch: null,
						filename: "legacy.md",
						translation: null,
						retries: [],
						pullRequest: { number: 1090 } as ProcessedFileResult["pullRequest"],
						pullRequestProgress: PullRequestProgressAction.Reused,
						error: null,
					},
				];

				const result = await githubService.commentCompiledResultsOnIssue(
					reusedOnly,
					fixtures.translationFiles,
				);

				expect(result).toBeUndefined();
				expect(octokitMock.issues.createComment).not.toHaveBeenCalled();
			});

			test("should skip commenting when no results to report", async () => {
				const result = await githubService.commentCompiledResultsOnIssue(
					createProcessedFileResultsFixture({ count: 0 }),
					fixtures.translationFiles,
				);

				expect(result).toBeUndefined();
			});

			test("should skip commenting when no files to translate", async () => {
				const result = await githubService.commentCompiledResultsOnIssue(
					fixtures.processedFileResults,
					createTranslationFilesFixture({ count: 0 }),
				);

				expect(result).toBeUndefined();
			});
		});
	});
});
