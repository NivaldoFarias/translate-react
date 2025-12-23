import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

import type { TranslationFile } from "@/services/translator.service";

import { ContentService } from "@/services/github/content.service";

/** Mocked Octokit instance structure */
const mockOctokit = {
	git: {
		getTree: mock(() =>
			Promise.resolve({
				data: {
					tree: [
						{
							path: "src/test/file.md",
							type: "blob",
							sha: "abc123",
							url: "https://api.github.com/repos/test/test/git/blobs/abc123",
						},
					],
				},
			}),
		),
		getBlob: mock(() =>
			Promise.resolve({
				data: {
					content: Buffer.from("# Test Content").toString("base64"),
					encoding: "base64",
				},
			}),
		),
	},
	repos: {
		getContent: mock(() =>
			Promise.resolve({
				data: {
					type: "file",
					encoding: "base64",
					content: Buffer.from("# Test Content").toString("base64"),
					sha: "abc123",
				},
			}),
		),
		createOrUpdateFileContents: mock(() =>
			Promise.resolve({
				data: {
					content: { sha: "new-sha" },
					commit: { sha: "commit-sha" },
				},
			}),
		),
	},
	pulls: {
		list: mock(() => Promise.resolve({ data: [] })),
		create: mock(() =>
			Promise.resolve({
				data: {
					number: 1,
					title: "test: new translation",
					html_url: "https://github.com/test/test/pull/1",
				},
			}),
		),
	},
};

void mock.module("@octokit/rest", () => {
	return {
		Octokit: class MockOctokit {
			git = mockOctokit.git;
			repos = mockOctokit.repos;
			pulls = mockOctokit.pulls;
		},
	};
});

void mock.module("@/services/comment-builder.service", () => {
	return {
		CommentBuilderService: class MockCommentBuilderService {
			build = mock(() => "Mock comment");
		},
	};
});

describe("ContentService", () => {
	let contentService: ContentService;

	afterAll(() => {
		mock.clearAllMocks();
	});

	beforeEach(() => {
		mockOctokit.git.getTree.mockClear();
		mockOctokit.git.getBlob.mockClear();
		mockOctokit.repos.getContent.mockClear();
		mockOctokit.repos.createOrUpdateFileContents.mockClear();
		mockOctokit.pulls.list.mockClear();
		mockOctokit.pulls.create.mockClear();

		mockOctokit.git.getTree.mockImplementation(() =>
			Promise.resolve({
				data: {
					tree: [
						{
							path: "src/test/file.md",
							type: "blob",
							sha: "abc123",
							url: "https://api.github.com/repos/test/test/git/blobs/abc123",
						},
					],
				},
			}),
		);
		mockOctokit.git.getBlob.mockImplementation(() =>
			Promise.resolve({
				data: {
					content: Buffer.from("# Test Content").toString("base64"),
					encoding: "base64",
				},
			}),
		);
		mockOctokit.repos.getContent.mockImplementation(() =>
			Promise.resolve({
				data: {
					type: "file",
					encoding: "base64",
					content: Buffer.from("# Test Content").toString("base64"),
					sha: "abc123",
				},
			}),
		);

		contentService = new ContentService();
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
		expect(mockOctokit.repos.createOrUpdateFileContents).toHaveBeenCalled();
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
		mockOctokit.git.getBlob.mockImplementation(() => Promise.reject(new Error("Not Found")));

		const file: TranslationFile = {
			path: "src/test/non-existent.md",
			content: "",
			sha: "missing",
			filename: "non-existent.md",
		};

		expect(contentService.getFileContent(file)).rejects.toThrow("Not Found");
	});
});
