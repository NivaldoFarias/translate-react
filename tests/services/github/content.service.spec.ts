import {
	createGitMocks,
	createIssuesMocks,
	createMockCommentBuilderService,
	createMockOctokit,
	createPullsMocks,
	createReposMocks,
	testRepositories,
} from "@tests/mocks";
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

import type {
	MockCommentBuilderService,
	MockOctokitGit,
	MockOctokitIssues,
	MockOctokitPulls,
	MockOctokitRepos,
} from "@tests/mocks";
import type { RestEndpointMethodTypes } from "node_modules/@octokit/plugin-rest-endpoint-methods/dist-types/generated/parameters-and-response-types";

import type { ContentServiceDependencies, TranslationFile } from "@/services/";

import { ContentService } from "@/services/";

/** Creates test ContentService with dependencies */
function createTestContentService(
	overrides?: Partial<ContentServiceDependencies>,
	gitMocks?: MockOctokitGit,
	reposMocks?: MockOctokitRepos,
	pullsMocks?: MockOctokitPulls,
	issuesMocks?: MockOctokitIssues,
): {
	service: ContentService;
	mocks: {
		git: MockOctokitGit;
		repos: MockOctokitRepos;
		pulls: MockOctokitPulls;
		issues: MockOctokitIssues;
		commentBuilder: MockCommentBuilderService;
	};
} {
	const git = gitMocks ?? createGitMocks();
	const repos = reposMocks ?? createReposMocks();
	const pulls = pullsMocks ?? createPullsMocks();
	const issues = issuesMocks ?? createIssuesMocks();
	const commentBuilder = createMockCommentBuilderService();

	const defaults = {
		octokit: createMockOctokit({ git, repos, pulls, issues }),
		repositories: testRepositories,
		commentBuilderService: commentBuilder,
		issueNumber: 555,
	};

	return {
		service: new ContentService({
			...(defaults as unknown as ContentServiceDependencies),
			...overrides,
		}),
		mocks: { git, repos, pulls, issues, commentBuilder },
	};
}

describe("ContentService", () => {
	let contentService: ContentService;
	let gitMocks: MockOctokitGit;
	let reposMocks: MockOctokitRepos;
	let pullsMocks: MockOctokitPulls;
	let issuesMocks: MockOctokitIssues;
	let commentBuilderMocks: MockCommentBuilderService;

	afterAll(() => {
		mock.clearAllMocks();
	});

	beforeEach(() => {
		const { service, mocks } = createTestContentService();
		contentService = service;
		gitMocks = mocks.git;
		reposMocks = mocks.repos;
		pullsMocks = mocks.pulls;
		issuesMocks = mocks.issues;
		commentBuilderMocks = mocks.commentBuilder;
	});

	test("should get untranslated files when batch size is specified", async () => {
		const files = await contentService.getUntranslatedFiles(1);

		expect(files).toHaveLength(1);
		expect(files[0]?.content).toBe("# Test Content");
		expect(files[0]?.sha).toBe("abc123");
	});

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

		const mockFile = {
			path: "src/test/file.md",
			content: "# Original Content",
			sha: "abc123",
			filename: "file.md",
		};

		const result = await contentService.commitTranslation({
			branch: mockBranch,
			file: mockFile,
			content: "# Translated Content",
			message: "test: translate content",
		});

		expect(result).toBeDefined();
		expect(reposMocks.createOrUpdateFileContents).toHaveBeenCalled();
	});

	test("should create pull request when valid PR data is provided", async () => {
		const pr = await contentService.createPullRequest({
			branch: "translate/test",
			title: "test: new translation",
			body: "Adds test translation",
		});

		expect(pr.number).toBe(1);
		expect(pr.html_url).toBe("https://github.com/test/test/pull/1");
	});

	test("should get file content when file exists", async () => {
		const file: TranslationFile = {
			path: "src/test/file.md",
			content: "# Original Content",
			sha: "abc123",
			filename: "file.md",
		};

		const content = await contentService.getFileContent(file);

		expect(content).toBe("# Test Content");
	});

	test("should handle file content errors when file does not exist", () => {
		gitMocks.getBlob.mockRejectedValueOnce(new Error("Not Found"));

		const file: TranslationFile = {
			path: "src/test/non-existent.md",
			content: "",
			sha: "missing",
			filename: "non-existent.md",
		};

		expect(contentService.getFileContent(file)).rejects.toThrow("Not Found");
	});

	describe("listOpenPullRequests", () => {
		test("should return list of open pull requests when called", async () => {
			pullsMocks.list.mockResolvedValueOnce({
				data: [
					{ number: 1, title: "PR 1" },
					{ number: 2, title: "PR 2" },
				],
			} as RestEndpointMethodTypes["pulls"]["list"]["response"]);

			const prs = await contentService.listOpenPullRequests();

			expect(prs).toHaveLength(2);
			expect(pullsMocks.list).toHaveBeenCalledWith({
				...testRepositories.upstream,
				state: "open",
			});
		});

		test("should return empty array when no open PRs exist", async () => {
			pullsMocks.list.mockResolvedValueOnce({ data: [] });

			const prs = await contentService.listOpenPullRequests();

			expect(prs).toHaveLength(0);
		});

		test("should throw mapped error when API call fails", () => {
			pullsMocks.list.mockRejectedValueOnce(new Error("API Error"));

			expect(contentService.listOpenPullRequests()).rejects.toThrow();
		});
	});

	describe("findPullRequestByNumber", () => {
		test("should return PR data when PR exists", async () => {
			pullsMocks.get.mockResolvedValueOnce({
				data: { number: 42, title: "Test PR", state: "open" },
			});
			const response = await contentService.findPullRequestByNumber(42);

			expect(response.data.number).toBe(42);
			expect(pullsMocks.get).toHaveBeenCalledWith({
				...testRepositories.upstream,
				pull_number: 42,
			});
		});

		test("should throw mapped error when PR does not exist", () => {
			pullsMocks.get.mockRejectedValueOnce(new Error("Not Found"));

			expect(contentService.findPullRequestByNumber(999)).rejects.toThrow();
		});
	});

	describe("getPullRequestFiles", () => {
		test("should return list of file paths when PR has files", async () => {
			pullsMocks.listFiles.mockResolvedValueOnce({
				data: [{ filename: "src/file1.md" }, { filename: "src/file2.md" }],
			} as RestEndpointMethodTypes["pulls"]["listFiles"]["response"]);
			const files = await contentService.getPullRequestFiles(123);

			expect(files).toEqual(["src/file1.md", "src/file2.md"]);
			expect(pullsMocks.listFiles).toHaveBeenCalledWith({
				...testRepositories.upstream,
				pull_number: 123,
			});
		});

		test("should return empty array when PR has no files", async () => {
			pullsMocks.listFiles.mockResolvedValueOnce({ data: [] });

			const files = await contentService.getPullRequestFiles(123);

			expect(files).toEqual([]);
		});

		test("should throw mapped error when API call fails", () => {
			pullsMocks.listFiles.mockRejectedValueOnce(new Error("API Error"));

			expect(contentService.getPullRequestFiles(123)).rejects.toThrow();
		});
	});

	describe("getUntranslatedFiles", () => {
		test("should throw error when repository tree is empty", () => {
			gitMocks.getTree.mockResolvedValueOnce({ data: { tree: [] } });

			expect(contentService.getUntranslatedFiles()).rejects.toThrow();
		});

		test("should skip files without path", async () => {
			gitMocks.getTree.mockResolvedValueOnce({
				data: {
					tree: [
						{ path: "src/test/file.md", type: "blob", sha: "abc123", url: "" },
						{ type: "blob", sha: "def456", url: "" },
					],
				},
			});

			const files = await contentService.getUntranslatedFiles();

			expect(files).toHaveLength(1);
		});

		test("should limit files when maxFiles is specified", async () => {
			gitMocks.getTree.mockResolvedValueOnce({
				data: {
					tree: [
						{ path: "src/test/file1.md", type: "blob", sha: "abc123", url: "" },
						{ path: "src/test/file2.md", type: "blob", sha: "def456", url: "" },
						{ path: "src/test/file3.md", type: "blob", sha: "ghi789", url: "" },
					],
				},
			});

			const files = await contentService.getUntranslatedFiles(2);

			expect(files).toHaveLength(2);
		});
	});

	describe("commitTranslation", () => {
		test("should throw mapped error when commit fails", () => {
			reposMocks.createOrUpdateFileContents.mockRejectedValueOnce(new Error("Commit failed"));

			const mockBranch = {
				ref: "refs/heads/translate/test",
				node_id: "branch-node-id",
				url: "https://api.github.com/repos/test/test/git/refs/heads/translate/test",
				object: { type: "commit", sha: "branch-sha", url: "" },
			};

			const mockFile = {
				path: "src/test/file.md",
				content: "# Original",
				sha: "abc123",
				filename: "file.md",
			};

			expect(
				contentService.commitTranslation({
					branch: mockBranch,
					file: mockFile,
					content: "# Translated",
					message: "translate: test",
				}),
			).rejects.toThrow();
		});
	});

	describe("createPullRequest", () => {
		test("should use custom base branch when specified", async () => {
			pullsMocks.create.mockResolvedValueOnce({
				data: { number: 1, title: "Test PR", html_url: "https://github.com/test/pull/1" },
			});
			await contentService.createPullRequest({
				branch: "translate/test",
				title: "Test PR",
				body: "Test body",
				baseBranch: "develop",
			});

			expect(pullsMocks.create).toHaveBeenCalledWith(expect.objectContaining({ base: "develop" }));
		});

		test("should throw mapped error when PR creation fails", () => {
			pullsMocks.create.mockRejectedValueOnce(new Error("PR creation failed"));

			expect(
				contentService.createPullRequest({
					branch: "translate/test",
					title: "Test PR",
					body: "Test body",
				}),
			).rejects.toThrow();
		});
	});

	describe("findPullRequestByBranch", () => {
		test("should return PR when branch matches", async () => {
			pullsMocks.list.mockResolvedValueOnce({
				data: [{ number: 1, head: { ref: "translate/test" }, title: "Test PR" }],
			} as RestEndpointMethodTypes["pulls"]["list"]["response"]);
			const pr = await contentService.findPullRequestByBranch("translate/test");

			expect(pr?.number).toBe(1);
			expect(pullsMocks.list).toHaveBeenCalledWith({
				...testRepositories.upstream,
				head: `${testRepositories.fork.owner}:translate/test`,
			});
		});

		test("should return undefined when no PR matches branch", async () => {
			pullsMocks.list.mockResolvedValueOnce({ data: [] });

			const pr = await contentService.findPullRequestByBranch("translate/test");

			expect(pr).toBeUndefined();
		});

		test("should throw mapped error when API call fails", () => {
			pullsMocks.list.mockRejectedValueOnce(new Error("API Error"));

			expect(contentService.findPullRequestByBranch("translate/test")).rejects.toThrow();
		});
	});

	describe("createCommentOnPullRequest", () => {
		test("should create comment on PR successfully", async () => {
			issuesMocks.createComment.mockResolvedValueOnce({ data: { id: 123, body: "Test comment" } });
			const result = await contentService.createCommentOnPullRequest(42, "Test comment");

			expect(result.data.id).toBe(123);
			expect(issuesMocks.createComment).toHaveBeenCalledWith({
				...testRepositories.upstream,
				issue_number: 42,
				body: "Test comment",
			});
		});

		test("should throw mapped error when comment creation fails", () => {
			issuesMocks.createComment.mockRejectedValueOnce(new Error("Comment failed"));

			expect(contentService.createCommentOnPullRequest(42, "Test")).rejects.toThrow();
		});
	});

	describe("checkPullRequestStatus", () => {
		test("should return clean status when PR is mergeable", async () => {
			pullsMocks.get.mockImplementation(() =>
				Promise.resolve({
					data: {
						number: 1,
						mergeable: true,
						mergeable_state: "clean",
					},
				}),
			);

			const status = await contentService.checkPullRequestStatus(1);

			expect(status.hasConflicts).toBe(false);
			expect(status.needsUpdate).toBe(false);
			expect(status.mergeableState).toBe("clean");
		});

		test("should return dirty status when PR has conflicts", async () => {
			pullsMocks.get.mockResolvedValueOnce({
				data: { number: 1, mergeable: false, mergeable_state: "dirty" },
			});

			const status = await contentService.checkPullRequestStatus(1);

			expect(status.hasConflicts).toBe(true);
			expect(status.needsUpdate).toBe(true);
			expect(status.mergeableState).toBe("dirty");
		});

		test("should return behind status without conflicts", async () => {
			pullsMocks.get.mockResolvedValueOnce({
				data: { number: 1, mergeable: true, mergeable_state: "behind" },
			});

			const status = await contentService.checkPullRequestStatus(1);

			expect(status.hasConflicts).toBe(false);
			expect(status.needsUpdate).toBe(false);
			expect(status.mergeableState).toBe("behind");
		});

		test("should throw mapped error when API call fails", () => {
			pullsMocks.get.mockImplementation(() => Promise.reject(new Error("API Error")));

			expect(contentService.checkPullRequestStatus(1)).rejects.toThrow();
		});
	});

	describe("closePullRequest", () => {
		test("should close PR successfully", async () => {
			pullsMocks.update.mockResolvedValueOnce({ data: { number: 42, state: "closed" } });
			const result = await contentService.closePullRequest(42);

			expect(result.state).toBe("closed");
			expect(pullsMocks.update).toHaveBeenCalledWith({
				...testRepositories.upstream,
				pull_number: 42,
				state: "closed",
			});
		});

		test("should throw mapped error when PR closure fails", () => {
			pullsMocks.update.mockRejectedValueOnce(new Error("Close failed"));

			expect(contentService.closePullRequest(42)).rejects.toThrow();
		});
	});

	describe("commentCompiledResultsOnIssue", () => {
		test("should throw error when no issue number configured", () => {
			const { service } = createTestContentService({ issueNumber: undefined });

			expect(service.commentCompiledResultsOnIssue([], [])).rejects.toThrow(
				"No progress issue number configured",
			);
		});

		test("should throw error when issue is closed", () => {
			issuesMocks.get.mockResolvedValueOnce({ data: { number: 555, state: "closed" } });

			expect(contentService.commentCompiledResultsOnIssue([], [])).rejects.toThrow();
		});

		test("should create new comment when no existing user comment found", async () => {
			issuesMocks.get.mockResolvedValueOnce({ data: { number: 555, state: "open" } });
			issuesMocks.listComments.mockResolvedValueOnce({ data: [] });
			issuesMocks.createComment.mockResolvedValueOnce({ data: { id: 999, body: "New comment" } });

			const result = await contentService.commentCompiledResultsOnIssue([], []);

			expect(result.id).toBe(999);
			expect(issuesMocks.createComment).toHaveBeenCalled();
		});

		test("should update existing comment when user comment found", async () => {
			issuesMocks.get.mockResolvedValueOnce({ data: { number: 555, state: "open" } });
			issuesMocks.listComments.mockResolvedValueOnce({
				data: [
					{ id: 888, user: { login: "test-fork-owner" }, body: "Existing comment with suffix" },
				],
			} as RestEndpointMethodTypes["issues"]["listComments"]["response"]);
			issuesMocks.updateComment.mockResolvedValueOnce({
				data: { id: 888, body: "Updated comment" },
			});
			commentBuilderMocks.comment.suffix = "suffix";

			const result = await contentService.commentCompiledResultsOnIssue([], []);

			expect(result.id).toBe(888);
			expect(issuesMocks.updateComment).toHaveBeenCalledWith(
				expect.objectContaining({
					comment_id: 888,
				}),
			);
		});

		test("should throw mapped error when API call fails", () => {
			issuesMocks.get.mockRejectedValueOnce(new Error("API Error"));

			expect(contentService.commentCompiledResultsOnIssue([], [])).rejects.toThrow();
		});
	});
});
