import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

import type { components } from "node_modules/@octokit/plugin-paginate-rest/node_modules/@octokit/types/node_modules/@octokit/openapi-types";
import type { RestEndpointMethodTypes } from "node_modules/@octokit/plugin-rest-endpoint-methods/dist-types/generated/parameters-and-response-types";

import type {
	ContentServiceDependencies,
	PatchedRepositoryTreeItem,
	ProcessedFileResult,
} from "@/services/";

import type { MockCommentBuilderService, MockOctokit } from "@tests/mocks";

import { ContentService, TranslationFile } from "@/services/";

import {
	createProcessedFileResultsFixture,
	createRepositoryTreeItemFixture,
	createTranslationFilesFixture,
} from "@tests/fixtures";
import { createMockCommentBuilderService, createMockOctokit, testRepositories } from "@tests/mocks";

/** Creates test ContentService with dependencies */
function createTestContentService(overrides?: Partial<ContentServiceDependencies>): {
	service: ContentService;
	mocks: MockOctokit & {
		commentBuilder: MockCommentBuilderService;
	};
} {
	const octokit = createMockOctokit();
	const commentBuilder = createMockCommentBuilderService();

	const defaults = {
		octokit,
		repositories: testRepositories,
		commentBuilderService: commentBuilder,
	};

	return {
		service: new ContentService({
			...(defaults as unknown as ContentServiceDependencies),
			...overrides,
		}),
		mocks: { ...octokit, commentBuilder },
	};
}

describe("ContentService", () => {
	let contentService: ContentService;
	let octokitMock: MockOctokit;
	let commentBuilderMock: MockCommentBuilderService;
	let fixtures: {
		processedFileResults: ProcessedFileResult[];
		translationFiles: TranslationFile[];
	};

	afterAll(() => {
		mock.clearAllMocks();
	});

	beforeEach(() => {
		const { service, mocks } = createTestContentService();
		contentService = service;
		octokitMock = mocks;
		commentBuilderMock = mocks.commentBuilder;

		fixtures = {
			processedFileResults: createProcessedFileResultsFixture({ count: 2 }),
			translationFiles: createTranslationFilesFixture({ count: 2 }),
		};
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

		const mockFile = new TranslationFile(
			"# Original Content",
			"file.md",
			"src/test/file.md",
			"abc123",
		);

		const result = await contentService.commitTranslation({
			branch: mockBranch,
			file: mockFile,
			content: "# Translated Content",
			message: "test: translate content",
		});

		expect(result).toBeDefined();
		expect(octokitMock.repos.createOrUpdateFileContents).toHaveBeenCalled();
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
		const repoTreeItem: PatchedRepositoryTreeItem = createRepositoryTreeItemFixture({
			path: "src/test/file.md",
			sha: "abc123",
			filename: "file.md",
		});

		const file = await contentService.getFile(repoTreeItem);

		expect(file.content).toBe("# Test Content");
		expect(file.sha).toBe("abc123");
		expect(file.path).toBe("src/test/file.md");
		expect(file.filename).toBe("file.md");
	});

	test("should handle file content errors when file does not exist", () => {
		octokitMock.git.getBlob.mockRejectedValueOnce(new Error("Not Found"));

		const repoTreeItem: PatchedRepositoryTreeItem = createRepositoryTreeItemFixture({
			path: "src/test/non-existent.md",
			sha: "missing",
			filename: "non-existent.md",
		});

		expect(contentService.getFile(repoTreeItem)).rejects.toThrow("Not Found");
	});

	describe("listOpenPullRequests", () => {
		test("should return list of open pull requests when called", async () => {
			octokitMock.pulls.list.mockResolvedValueOnce({
				data: [
					{ number: 1, title: "PR 1" },
					{ number: 2, title: "PR 2" },
				],
			} as RestEndpointMethodTypes["pulls"]["list"]["response"]);

			const prs = await contentService.listOpenPullRequests();

			expect(prs).toHaveLength(2);
			expect(octokitMock.pulls.list).toHaveBeenCalledWith({
				...testRepositories.upstream,
				state: "open",
			});
		});

		test("should return empty array when no open PRs exist", async () => {
			octokitMock.pulls.list.mockResolvedValueOnce({ data: [] });

			const prs = await contentService.listOpenPullRequests();

			expect(prs).toHaveLength(0);
		});

		test("should throw mapped error when API call fails", () => {
			octokitMock.pulls.list.mockRejectedValueOnce(new Error("API Error"));

			expect(contentService.listOpenPullRequests()).rejects.toThrow();
		});
	});

	describe("findPullRequestByNumber", () => {
		test("should return PR data when PR exists", async () => {
			octokitMock.pulls.get.mockResolvedValueOnce({
				data: { number: 42, title: "Test PR", state: "open" },
			});
			const response = await contentService.findPullRequestByNumber(42);

			expect(response.data.number).toBe(42);
			expect(octokitMock.pulls.get).toHaveBeenCalledWith({
				...testRepositories.upstream,
				pull_number: 42,
			});
		});

		test("should throw mapped error when PR does not exist", () => {
			octokitMock.pulls.get.mockRejectedValueOnce(new Error("Not Found"));

			expect(contentService.findPullRequestByNumber(999)).rejects.toThrow();
		});
	});

	describe("getPullRequestFiles", () => {
		test("should return list of file paths when PR has files", async () => {
			octokitMock.pulls.listFiles.mockResolvedValueOnce({
				data: [{ filename: "src/file1.md" }, { filename: "src/file2.md" }],
			} as RestEndpointMethodTypes["pulls"]["listFiles"]["response"]);
			const files = await contentService.getPullRequestFiles(123);

			expect(files).toEqual(["src/file1.md", "src/file2.md"]);
			expect(octokitMock.pulls.listFiles).toHaveBeenCalledWith({
				...testRepositories.upstream,
				pull_number: 123,
			});
		});

		test("should return empty array when PR has no files", async () => {
			octokitMock.pulls.listFiles.mockResolvedValueOnce({ data: [] });

			const files = await contentService.getPullRequestFiles(123);

			expect(files).toEqual([]);
		});

		test("should throw mapped error when API call fails", () => {
			octokitMock.pulls.listFiles.mockRejectedValueOnce(new Error("API Error"));

			expect(contentService.getPullRequestFiles(123)).rejects.toThrow();
		});
	});

	describe("commitTranslation", () => {
		test("should throw mapped error when commit fails", () => {
			octokitMock.repos.createOrUpdateFileContents.mockRejectedValueOnce(
				new Error("Commit failed"),
			);

			const mockBranch = {
				ref: "refs/heads/translate/test",
				node_id: "branch-node-id",
				url: "https://api.github.com/repos/test/test/git/refs/heads/translate/test",
				object: { type: "commit", sha: "branch-sha", url: "" },
			};

			const mockFile = new TranslationFile("# Original", "file.md", "src/test/file.md", "abc123");

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
			octokitMock.pulls.create.mockResolvedValueOnce({
				data: { number: 1, title: "Test PR", html_url: "https://github.com/test/pull/1" },
			});
			await contentService.createPullRequest({
				branch: "translate/test",
				title: "Test PR",
				body: "Test body",
				baseBranch: "develop",
			});

			expect(octokitMock.pulls.create).toHaveBeenCalledWith(
				expect.objectContaining({ base: "develop" }),
			);
		});

		test("should throw mapped error when PR creation fails", () => {
			octokitMock.pulls.create.mockRejectedValueOnce(new Error("PR creation failed"));

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
			octokitMock.pulls.list.mockResolvedValueOnce({
				data: [{ number: 1, head: { ref: "translate/test" }, title: "Test PR" }],
			} as RestEndpointMethodTypes["pulls"]["list"]["response"]);
			const pr = await contentService.findPullRequestByBranch("translate/test");

			expect(pr?.number).toBe(1);
			expect(octokitMock.pulls.list).toHaveBeenCalledWith({
				...testRepositories.upstream,
				head: `${testRepositories.fork.owner}:translate/test`,
			});
		});

		test("should return undefined when no PR matches branch", async () => {
			octokitMock.pulls.list.mockResolvedValueOnce({ data: [] });

			const pr = await contentService.findPullRequestByBranch("translate/test");

			expect(pr).toBeUndefined();
		});

		test("should throw mapped error when API call fails", () => {
			octokitMock.pulls.list.mockRejectedValueOnce(new Error("API Error"));

			expect(contentService.findPullRequestByBranch("translate/test")).rejects.toThrow();
		});
	});

	describe("createCommentOnPullRequest", () => {
		test("should create comment on PR successfully", async () => {
			octokitMock.issues.createComment.mockResolvedValueOnce({
				data: { id: 123, body: "Test comment" },
			});
			const result = await contentService.createCommentOnPullRequest(42, "Test comment");

			expect(result.data.id).toBe(123);
			expect(octokitMock.issues.createComment).toHaveBeenCalledWith({
				...testRepositories.upstream,
				issue_number: 42,
				body: "Test comment",
			});
		});

		test("should throw mapped error when comment creation fails", () => {
			octokitMock.issues.createComment.mockRejectedValueOnce(new Error("Comment failed"));

			expect(contentService.createCommentOnPullRequest(42, "Test")).rejects.toThrow();
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
					},
				}),
			);

			const status = await contentService.checkPullRequestStatus(1);

			expect(status.hasConflicts).toBe(false);
			expect(status.needsUpdate).toBe(false);
			expect(status.mergeableState).toBe("clean");
		});

		test("should return dirty status when PR has conflicts", async () => {
			octokitMock.pulls.get.mockResolvedValueOnce({
				data: { number: 1, mergeable: false, mergeable_state: "dirty" },
			});

			const status = await contentService.checkPullRequestStatus(1);

			expect(status.hasConflicts).toBe(true);
			expect(status.needsUpdate).toBe(true);
			expect(status.mergeableState).toBe("dirty");
		});

		test("should return behind status without conflicts", async () => {
			octokitMock.pulls.get.mockResolvedValueOnce({
				data: { number: 1, mergeable: true, mergeable_state: "behind" },
			});

			const status = await contentService.checkPullRequestStatus(1);

			expect(status.hasConflicts).toBe(false);
			expect(status.needsUpdate).toBe(false);
			expect(status.mergeableState).toBe("behind");
		});

		test("should throw mapped error when API call fails", () => {
			octokitMock.pulls.get.mockImplementation(() => Promise.reject(new Error("API Error")));

			expect(contentService.checkPullRequestStatus(1)).rejects.toThrow();
		});
	});

	describe("closePullRequest", () => {
		test("should close PR successfully", async () => {
			octokitMock.pulls.update.mockResolvedValueOnce({ data: { number: 42, state: "closed" } });
			const result = await contentService.closePullRequest(42);

			expect(result.state).toBe("closed");
			expect(octokitMock.pulls.update).toHaveBeenCalledWith({
				...testRepositories.upstream,
				pull_number: 42,
				state: "closed",
			});
		});

		test("should throw mapped error when PR closure fails", () => {
			octokitMock.pulls.update.mockRejectedValueOnce(new Error("Close failed"));

			expect(contentService.closePullRequest(42)).rejects.toThrow();
		});
	});

	describe("commentCompiledResultsOnIssue", () => {
		test("should log error when no progress issue is found", () => {
			octokitMock.rest.search.issuesAndPullRequests.mockResolvedValueOnce({
				data: { total_count: 0, items: [] },
			});

			expect(
				contentService.commentCompiledResultsOnIssue(
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

			const result = await contentService.commentCompiledResultsOnIssue(
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

		describe("Edge Cases", () => {
			test("should pinpoint correct translation progress issue from multiple issues", async () => {
				octokitMock.rest.search.issuesAndPullRequests.mockResolvedValueOnce({
					data: {
						items: [
							{
								number: 1,
								state: "open",
								title: "Translation Progress (Old)",
								author_association: "FIRST_TIME_CONTRIBUTOR",
							},
							{
								number: 2,
								state: "open",
								title: "Translation Progress (Current)",
								author_association: "OWNER",
							},
							{
								number: 3,
								state: "open",
								title: "Translation Progress (Another)",
								author_association: "FIRST_TIMER",
							},
						] as components["schemas"]["issue-search-result-item"][],
						total_count: 3,
					},
				});

				octokitMock.issues.createComment.mockResolvedValueOnce({
					data: { id: 2, html_url: "https://github.com/test/test/issues/2#comment-2" },
				});

				const result = await contentService.commentCompiledResultsOnIssue(
					fixtures.processedFileResults,
					fixtures.translationFiles,
				);
				expect(result).toBeDefined();
				expect(octokitMock.issues.createComment).toHaveBeenCalledWith(
					expect.objectContaining({
						issue_number: 2,
					}),
				);
			});

			test("should skip commenting when no results to report", async () => {
				const result = await contentService.commentCompiledResultsOnIssue(
					createProcessedFileResultsFixture({ count: 0 }),
					fixtures.translationFiles,
				);

				expect(result).toBeUndefined();
			});

			test("should skip commenting when no files to translate", async () => {
				const result = await contentService.commentCompiledResultsOnIssue(
					fixtures.processedFileResults,
					createTranslationFilesFixture({ count: 0 }),
				);

				expect(result).toBeUndefined();
			});
		});
	});
});
