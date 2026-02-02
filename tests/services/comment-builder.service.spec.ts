import { beforeEach, describe, expect, test } from "bun:test";

import type { ProcessedFileResult } from "@/services/";

import { CommentBuilderService, TranslationFile } from "@/services/";

import { createMockPullRequestListItem } from "@tests/fixtures";

describe("CommentBuilderService", () => {
	let commentBuilderService: CommentBuilderService;

	beforeEach(() => {
		commentBuilderService = new CommentBuilderService();
	});

	const createMockPrData = (prNumber: number) => createMockPullRequestListItem(prNumber);

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
			expect(result).toContain("#123");
			expect(result).toContain("#124");
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

			expect(result).toBeString();
			expect(result.trim()).not.toBe("");
		});

		test("should handle empty results array", () => {
			const results: ProcessedFileResult[] = [];
			const filesToTranslate: TranslationFile[] = [];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toBeString();
			expect(result.trim()).not.toBe("");
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
			expect(result).toContain("#126");

			expect(result).not.toContain("2024");
			expect(result).not.toContain("01");
			expect(result).not.toContain("15");
		});
	});

	describe("concatComment", () => {
		test("should concatenate prefix, content, and suffix", () => {
			const content = "- docs\n  - #123";

			// @ts-expect-error - Call to private method
			const result = commentBuilderService.concatComment(content);

			expect(result).toBeString();
			expect(result).toContain("As seguintes páginas foram traduzidas");
			expect(result).toContain(content);
		});

		test("should handle empty content", () => {
			const content = "";

			// @ts-expect-error - Call to private method
			const result = commentBuilderService.concatComment(content);

			expect(result).toBeString();
			expect(result).toContain("As seguintes páginas foram traduzidas");
		});

		test("should handle multiline content", () => {
			const content = "Line 1\nLine 2\nLine 3";

			// @ts-expect-error - Call to private method
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
				new TranslationFile("# Test", "test.md", "src/content/docs/advanced/test.md", "sha_test"),
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
				new TranslationFile(
					"# Article",
					"article.md",
					"src/content/blog/2024/03/15/some-folder/article.md",
					"sha_article",
				),
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
				new TranslationFile(
					"# Introduction",
					"intro.md",
					"src/content/docs/intro.md",
					"sha_file_1",
				),
				new TranslationFile(
					"# Advanced",
					"advanced.md",
					"src/content/docs/guides/advanced.md",
					"sha_file_2",
				),
				new TranslationFile("# API", "api.md", "src/content/docs/reference/api.md", "sha_file_3"),
			];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toContain("docs");
			expect(result).toContain("guides");
			expect(result).toContain("reference");
			expect(result).toContain("#129");
			expect(result).toContain("#130");
			expect(result).toContain("#131");
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
				new TranslationFile("# Zebra", "zebra.md", "src/content/docs/zebra.md", "sha_file_zebra"),
				new TranslationFile("# Alpha", "alpha.md", "src/content/docs/alpha.md", "sha_file_alpha"),
			];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			const alphaIndex = result.indexOf("#133");
			const zebraIndex = result.indexOf("#132");
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
				new TranslationFile(
					"# Deep",
					"deep.md",
					"src/content/docs/level1/level2/level3/deep.md",
					"sha_file_deep",
				),
			];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toContain("docs");
			expect(result).toContain("level1");
			expect(result).toContain("level2");
			expect(result).toContain("level3");
			expect(result).toContain("#134");
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
				new TranslationFile("# Empty", "", "src/content/docs/", "sha_empty_file"),
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
				new TranslationFile(
					"# Special",
					"special-file_name.with.dots.md",
					"src/content/docs/special-file_name.with.dots.md",
					"sha_special_file",
				),
			];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toContain("#136");
		});

		test("should handle large number of files", () => {
			const results: ProcessedFileResult[] = [];
			const filesToTranslate: TranslationFile[] = [];

			for (let index = 1; index <= 50; index++) {
				results.push({
					filename: `file-${index.toString().padStart(2, "0")}.md`,
					branch: null,
					translation: `# File ${index}`,
					pullRequest: createMockPrData(100 + index),
					error: null,
				});

				filesToTranslate.push(
					new TranslationFile(
						`# File ${index}`,
						`file-${index.toString().padStart(2, "0")}.md`,
						`src/content/docs/batch/file-${index.toString().padStart(2, "0")}.md`,
						`sha_file_${index}`,
					),
				);
			}

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toBeString();
			expect(result).toContain("batch");
			expect(result).toContain("#101");
			expect(result).toContain("#150");
		});
	});
});
