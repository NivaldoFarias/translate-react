import { beforeEach, describe, expect, mock, test } from "bun:test";

import { TranslationFile } from "@/utils/translation-file.util";

import { ContentService } from "../../../src/services/github/content.service";

/**
 * Test suite for GitHub Content Service
 * Tests content retrieval and manipulation operations
 */
describe("GitHub Content Service", () => {
	let contentService: ContentService;
	const mockConfig = {
		upstream: { owner: "test-owner", repo: "test-repo" },
		fork: { owner: "fork-owner", repo: "fork-repo" },
		token: "test-token",
	};

	beforeEach(() => {
		contentService = new ContentService(mockConfig.upstream, mockConfig.fork, mockConfig.token);
	});

	test("should get untranslated files", async () => {
		const mockTree = {
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
		};

		const mockContent = {
			data: {
				type: "file",
				encoding: "base64",
				content: Buffer.from("# Test Content").toString("base64"),
				sha: "abc123",
			},
		};

		// @ts-ignore - Mocking private property
		contentService.octokit = {
			git: {
				getTree: mock(() => Promise.resolve(mockTree)),
			},
			repos: {
				getContent: mock(() => Promise.resolve(mockContent)),
			},
		};

		const files = await contentService.getUntranslatedFiles(1);
		expect(files).toHaveLength(1);
		expect(files[0]?.content).toBe("# Test Content");
		expect(files[0]?.sha).toBe("abc123");
	});

	test("should commit translation", async () => {
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

		const mockGetContent = {
			data: {
				sha: "current-sha",
			},
		};

		const mockCreateOrUpdate = {
			data: {
				content: {
					sha: "new-sha",
				},
			},
		};

		// @ts-ignore - Mocking private property
		contentService.octokit = {
			repos: {
				getContent: mock(() => Promise.resolve(mockGetContent)),
				createOrUpdateFileContents: mock(() => Promise.resolve(mockCreateOrUpdate)),
			},
		};

		expect(
			contentService.commitTranslation(
				mockBranch,
				mockFile,
				"# Translated Content",
				"test: translate content",
			),
		).resolves.not.toThrow();
	});

	test("should create pull request", async () => {
		const mockPR = {
			number: 1,
			title: "test: new translation",
			html_url: "https://github.com/test/test/pull/1",
		};

		// @ts-ignore - Mocking private property
		contentService.octokit = {
			pulls: {
				list: mock(() => Promise.resolve({ data: [] })),
				create: mock(() => Promise.resolve({ data: mockPR })),
			},
		};

		const pr = await contentService.createPullRequest(
			"translate/test",
			"test: new translation",
			"Adds test translation",
		);

		expect(pr.number).toBe(1);
		expect(pr.html_url).toBe("https://github.com/test/test/pull/1");
	});

	test("should get file content", async () => {
		const mockBlob = {
			data: {
				content: Buffer.from("# Test Content").toString("base64"),
				encoding: "base64",
			},
		};

		// @ts-ignore - Mocking private property
		contentService.octokit = {
			git: {
				getBlob: mock(() => Promise.resolve(mockBlob)),
			},
		};

		const file: TranslationFile = {
			path: "src/test/file.md",
			content: "# Original Content",
			sha: "abc123",
			filename: "file.md",
		};

		const content = await contentService.getFileContent(file);
		expect(content).toBe("# Test Content");
	});

	test("should handle file content errors", async () => {
		// @ts-ignore - Mocking private property
		contentService.octokit = {
			git: {
				getBlob: mock(() => Promise.reject(new Error("Not Found"))),
			},
		};

		const file: TranslationFile = {
			path: "src/test/non-existent.md",
			content: "",
			sha: "missing",
			filename: "non-existent.md",
		};

		expect(contentService.getFileContent(file)).rejects.toThrow("Not Found");
	});
});
