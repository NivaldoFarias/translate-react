import { RestEndpointMethodTypes } from "@octokit/rest";
import { beforeEach, describe, expect, test } from "bun:test";

import { CommentBuilderService } from "@/services/comment-builder.service";
import { ProcessedFileResult } from "@/services/runner/";
import { TranslationFile } from "@/services/translator.service";

describe("CommentBuilderService", () => {
	let commentBuilderService: CommentBuilderService;

	beforeEach(() => {
		commentBuilderService = new CommentBuilderService();
	});

	const createMockPrData = (
		prNumber: number,
	): RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number] => {
		return {
			number: prNumber,
			id: prNumber,
			node_id: `PR_${String(prNumber)}`,
			url: `https://api.github.com/repos/test/test/pulls/${String(prNumber)}`,
			html_url: `https://github.com/test/test/pull/${String(prNumber)}`,
			diff_url: `https://github.com/test/test/pull/${String(prNumber)}.diff`,
			patch_url: `https://github.com/test/test/pull/${String(prNumber)}.patch`,
			issue_url: `https://github.com/test/test/issues/${String(prNumber)}`,
			commits_url: `https://api.github.com/repos/test/test/pulls/${String(prNumber)}/commits`,
			review_comments_url: `https://api.github.com/repos/test/test/pulls/${String(prNumber)}/comments`,
		} as unknown as RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number];
	};

	const createMockResult = (
		filename: string,
		prNumber: number | null = null,
	): ProcessedFileResult => {
		return {
			branch: null,
			filename,
			translation: `Translated content of ${filename}`,
			pullRequest: prNumber ? createMockPrData(prNumber) : null,
			error: null,
		};
	};

	const createMockTranslationFile = (filename: string, path: string): TranslationFile =>
		new TranslationFile(`# Content of ${filename}`, filename, path, `sha_${filename}`);

	describe("Constructor", () => {
		test("should initialize correctly when instantiated", () => {
			expect(commentBuilderService).toBeInstanceOf(CommentBuilderService);
		});
	});

	describe("buildComment", () => {
		const filesToTranslate: TranslationFile[] = [
			createMockTranslationFile("intro.md", "src/content/docs/intro.md"),
			createMockTranslationFile("api.md", "src/content/docs/api/api.md"),
		];

		test("should build hierarchical comment when results and files are provided", () => {
			const results: ProcessedFileResult[] = [
				createMockResult("intro.md", 123),
				createMockResult("api.md", 124),
			];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toBeString();
			expect(result).toContain("docs");
			expect(result).toContain("`intro.md`: #123");
			expect(result).toContain("`api.md`: #124");
		});

		test("should handle files without matching translation files", () => {
			const results: ProcessedFileResult[] = [createMockResult("missing.md", 125)];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toBeString();
			expect(result).not.toContain("missing.md");
		});

		test("should handle files without pull request numbers", () => {
			const results: ProcessedFileResult[] = [createMockResult("no-pr.md", null)];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toBe("");
		});

		test("should handle empty results array", () => {
			const results: ProcessedFileResult[] = [];
			const filesToTranslate: TranslationFile[] = [];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toBeString();
			expect(result.trim()).toBe("");
		});

		test("should handle blog posts with date paths", () => {
			const results: ProcessedFileResult[] = [
				{
					filename: "post.md",
					translation: "# Blog Post",
					branch: null,
					pullRequest: createMockPrData(126),
					error: null,
				},
			];

			const filesToTranslate: TranslationFile[] = [
				createMockTranslationFile("post.md", "src/content/blog/2024/01/15/post.md"),
			];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toContain("blog");
			expect(result).toContain("`post.md`: #126");

			expect(result).not.toContain("2024");
			expect(result).not.toContain("01");
			expect(result).not.toContain("15");
		});
	});

	describe("concatComment", () => {
		test("should concatenate prefix, content, and suffix", () => {
			const content = "- docs\n  - `intro.md`: #123";

			const result = commentBuilderService.concatComment(content);

			expect(result).toBeString();
			expect(result).toContain("As seguintes páginas foram traduzidas");
			expect(result).toContain(content);
			expect(result).toContain("Observações");
			expect(result).toContain("translate-react");
		});

		test("should handle empty content", () => {
			const content = "";

			const result = commentBuilderService.concatComment(content);

			expect(result).toBeString();
			expect(result).toContain("As seguintes páginas foram traduzidas");
			expect(result).toContain("Observações");
		});

		test("should handle multiline content", () => {
			const content = "Line 1\nLine 2\nLine 3";

			const result = commentBuilderService.concatComment(content);

			expect(result).toContain("Line 1");
			expect(result).toContain("Line 2");
			expect(result).toContain("Line 3");
		});
	});

	describe("comment getter", () => {
		test("should return comment template with prefix and suffix", () => {
			const comment = commentBuilderService.comment;

			expect(comment).toHaveProperty("prefix");
			expect(comment).toHaveProperty("suffix");
			expect(comment.prefix).toContain("As seguintes páginas foram traduzidas");
			expect(comment.suffix).toContain("Observações");
			expect(comment.suffix).toContain("translate-react");
		});

		test("should include environment variables in suffix", () => {
			const comment = commentBuilderService.comment;

			expect(comment.suffix).toContain("translate-react");
		});
	});

	describe("Path Simplification", () => {
		test("should remove src/content prefix from paths", () => {
			const results: ProcessedFileResult[] = [
				{
					filename: "test.md",
					translation: "# Test",
					branch: null,
					pullRequest: createMockPrData(127),
					error: null,
				},
			];

			const filesToTranslate: TranslationFile[] = [
				{
					filename: "test.md",
					path: "src/content/docs/advanced/test.md",
					content: "# Test",
					sha: "sha_test",
				},
			];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toContain("docs");
			expect(result).not.toContain("src");
			expect(result).not.toContain("content");
		});

		test("should simplify blog paths to just 'blog'", () => {
			const results: ProcessedFileResult[] = [
				{
					filename: "article.md",
					translation: "# Article",
					branch: null,
					pullRequest: createMockPrData(128),
					error: null,
				},
			];

			const filesToTranslate: TranslationFile[] = [
				{
					filename: "article.md",
					path: "src/content/blog/2024/03/15/some-folder/article.md",
					content: "# Article",
					sha: "sha_article",
				},
			];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toContain("blog");
			expect(result).not.toContain("2024");
			expect(result).not.toContain("03");
			expect(result).not.toContain("15");
			expect(result).not.toContain("some-folder");
		});
	});

	describe("Hierarchical Structure", () => {
		test("should create proper hierarchical structure", () => {
			const results: ProcessedFileResult[] = [
				{
					filename: "intro.md",
					translation: "# Introduction",
					branch: null,
					pullRequest: createMockPrData(129),
					error: null,
				},
				{
					filename: "advanced.md",
					translation: "# Advanced",
					branch: null,
					pullRequest: createMockPrData(130),
					error: null,
				},
				{
					filename: "api.md",
					translation: "# API",
					branch: null,
					pullRequest: createMockPrData(131),
					error: null,
				},
			];

			const filesToTranslate: TranslationFile[] = [
				{
					filename: "intro.md",
					path: "src/content/docs/intro.md",
					content: "# Introduction",
					sha: "sha_file_1",
				},
				{
					filename: "advanced.md",
					path: "src/content/docs/guides/advanced.md",
					content: "# Advanced",
					sha: "sha_file_2",
				},
				{
					filename: "api.md",
					path: "src/content/docs/reference/api.md",
					content: "# API",
					sha: "sha_file_3",
				},
			];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toContain("docs");
			expect(result).toContain("guides");
			expect(result).toContain("reference");
			expect(result).toContain("`intro.md`: #129");
			expect(result).toContain("`advanced.md`: #130");
			expect(result).toContain("`api.md`: #131");
		});

		test("should sort files and directories alphabetically", () => {
			const results: ProcessedFileResult[] = [
				{
					filename: "zebra.md",
					translation: "# Zebra",
					branch: null,
					pullRequest: createMockPrData(132),
					error: null,
				},
				{
					filename: "alpha.md",
					translation: "# Alpha",
					branch: null,
					pullRequest: createMockPrData(133),
					error: null,
				},
			];

			const filesToTranslate: TranslationFile[] = [
				{
					filename: "zebra.md",
					path: "src/content/docs/zebra.md",
					content: "# Zebra",
					sha: "sha_file_zebra",
				},
				{
					filename: "alpha.md",
					path: "src/content/docs/alpha.md",
					content: "# Alpha",
					sha: "sha_file_alpha",
				},
			];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			const alphaIndex = result.indexOf("alpha.md");
			const zebraIndex = result.indexOf("zebra.md");
			expect(alphaIndex).toBeLessThan(zebraIndex);
		});

		test("should handle nested directory structures", () => {
			const results: ProcessedFileResult[] = [
				{
					filename: "deep.md",
					translation: "# Deep",
					branch: null,
					pullRequest: createMockPrData(134),
					error: null,
				},
			];

			const filesToTranslate: TranslationFile[] = [
				{
					filename: "deep.md",
					path: "src/content/docs/level1/level2/level3/deep.md",
					content: "# Deep",
					sha: "sha_file_deep",
				},
			];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toContain("docs");
			expect(result).toContain("level1");
			expect(result).toContain("level2");
			expect(result).toContain("level3");
			expect(result).toContain("`deep.md`: #134");
		});
	});

	describe("Error Handling and Edge Cases", () => {
		test("should handle files with empty filenames", () => {
			const results: ProcessedFileResult[] = [
				{
					filename: "",
					translation: "# Empty",
					branch: null,
					pullRequest: createMockPrData(135),
					error: null,
				},
			];

			const filesToTranslate: TranslationFile[] = [
				{
					filename: "",
					path: "src/content/docs/",
					content: "# Empty",
					sha: "sha_empty_file",
				},
			];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toBeString();
		});

		test("should handle files with special characters in names", () => {
			const results: ProcessedFileResult[] = [
				{
					filename: "special-file_name.with.dots.md",
					translation: "# Special",
					branch: null,
					pullRequest: createMockPrData(136),
					error: null,
				},
			];

			const filesToTranslate: TranslationFile[] = [
				{
					filename: "special-file_name.with.dots.md",
					path: "src/content/docs/special-file_name.with.dots.md",
					content: "# Special",
					sha: "sha_special_file",
				},
			];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toContain("`special-file_name.with.dots.md`: #136");
		});

		test("should handle large number of files", () => {
			const results: ProcessedFileResult[] = [];
			const filesToTranslate: TranslationFile[] = [];

			for (let index = 1; index <= 50; index++) {
				results.push({
					filename: `file-${index.toString().padStart(2, "0")}.md`,
					branch: null,
					translation: `# File ${String(index)}`,
					pullRequest: createMockPrData(100 + index),
					error: null,
				});

				filesToTranslate.push({
					filename: `file-${index.toString().padStart(2, "0")}.md`,
					path: `src/content/docs/batch/file-${index.toString().padStart(2, "0")}.md`,
					content: `# File ${String(index)}`,
					sha: `sha_file_${String(index)}`,
				});
			}

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toBeString();
			expect(result).toContain("batch");
			expect(result).toContain("`file-01.md`: #101");
			expect(result).toContain("`file-50.md`: #150");
		});
	});
});
