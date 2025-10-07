/**
 * @fileoverview Tests for the {@link ContentService}.
 *
 * This suite covers content retrieval, file operations, commit creation,
 * and pull request management for GitHub-based translation workflow.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { ContentService } from "@/services/github/content.service";
import { TranslationFile } from "@/services/translator.service";

describe("ContentService", () => {
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

		// @ts-expect-error - Mocking private property
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

		const mockCreateOrUpdateResponse = {
			data: {
				content: {
					sha: "new-sha",
				},
				commit: {
					sha: "commit-sha",
				},
			},
		};

		// @ts-expect-error - Mocking private property for testing
		contentService.octokit = {
			repos: {
				createOrUpdateFileContents: mock(() => Promise.resolve(mockCreateOrUpdateResponse)),
			},
		};

		expect(
			await contentService.commitTranslation({
				branch: mockBranch,
				file: mockFile,
				content: "# Translated Content",
				message: "test: translate content",
			}),
		).resolves.toBeDefined();
	});

	test("should create pull request", async () => {
		const mockPR = {
			number: 1,
			title: "test: new translation",
			html_url: "https://github.com/test/test/pull/1",
		};

		// @ts-expect-error - Mocking private property
		contentService.octokit = {
			pulls: {
				list: mock(() => Promise.resolve({ data: [] })),
				create: mock(() => Promise.resolve({ data: mockPR })),
			},
		};

		const pr = await contentService.createPullRequest({
			branch: "translate/test",
			title: "test: new translation",
			body: "Adds test translation",
		});

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

		// @ts-expect-error - Mocking private property
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
		// @ts-expect-error - Mocking private property
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
