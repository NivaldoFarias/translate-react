/**
 * @fileoverview Tests for the {@link CommentBuilderService}.
 *
 * This suite covers hierarchical comment building, path simplification,
 * structure formatting, and GitHub issue comment generation functionality
 * for the translation workflow result presentation.
 */

import { beforeEach, describe, expect, test } from "bun:test";

import { CommentBuilderService } from "@/services/comment-builder.service";
import { ProcessedFileResult } from "@/types";
import { TranslationFile } from "@/utils/translation-file.util";

describe("CommentBuilderService", () => {
	let commentBuilderService: CommentBuilderService;

	beforeEach(() => {
		commentBuilderService = new CommentBuilderService();
	});

	/** Helper function to create mock ProcessedFileResult */
	const createMockResult = (
		filename: string,
		prNumber: number | null = null,
	): ProcessedFileResult => ({
		branch: null,
		filename,
		translation: `Translated content of ${filename}`,
		pullRequest:
			prNumber ?
				{
					number: prNumber,
					id: prNumber,
					node_id: `PR_${prNumber}`,
					url: `https://api.github.com/repos/test/test/pulls/${prNumber}`,
					html_url: `https://github.com/test/test/pull/${prNumber}`,
					diff_url: `https://github.com/test/test/pull/${prNumber}.diff`,
					patch_url: `https://github.com/test/test/pull/${prNumber}.patch`,
					issue_url: `https://api.github.com/repos/test/test/issues/${prNumber}`,
					commits_url: `https://api.github.com/repos/test/test/pulls/${prNumber}/commits`,
					review_comments_url: `https://api.github.com/repos/test/test/pulls/${prNumber}/comments`,
					review_comment_url: `https://api.github.com/repos/test/test/pulls/comments{/number}`,
					comments_url: `https://api.github.com/repos/test/test/issues/${prNumber}/comments`,
					statuses_url: `https://api.github.com/repos/test/test/statuses/abc123`,
					state: "open" as const,
					locked: false,
					title: `Translation for ${filename}`,
					user: {
						login: "test-user",
						id: 1,
						node_id: "U_1",
						avatar_url: "https://github.com/images/error/test-user_happy.gif",
						gravatar_id: "",
						url: "https://api.github.com/users/test-user",
						html_url: "https://github.com/test-user",
						followers_url: "https://api.github.com/users/test-user/followers",
						following_url: "https://api.github.com/users/test-user/following{/other_user}",
						gists_url: "https://api.github.com/users/test-user/gists{/gist_id}",
						starred_url: "https://api.github.com/users/test-user/starred{/owner}{/repo}",
						subscriptions_url: "https://api.github.com/users/test-user/subscriptions",
						organizations_url: "https://api.github.com/users/test-user/orgs",
						repos_url: "https://api.github.com/users/test-user/repos",
						events_url: "https://api.github.com/users/test-user/events{/privacy}",
						received_events_url: "https://api.github.com/users/test-user/received_events",
						type: "User",
						site_admin: false,
					},
					body: `Automated translation for ${filename}`,
					created_at: "2025-10-03T00:00:00Z",
					updated_at: "2025-10-03T00:00:00Z",
					closed_at: null,
					merged_at: null,
					merge_commit_sha: null,
					assignee: null,
					assignees: [],
					requested_reviewers: [],
					requested_teams: [],
					labels: [],
					milestone: null,
					draft: false,
					head: {
						label: "test:feature-branch",
						ref: "feature-branch",
						sha: "abc123",
						user: {
							login: "test-user",
							id: 1,
							node_id: "U_1",
							avatar_url: "https://github.com/images/error/test-user_happy.gif",
							gravatar_id: "",
							url: "https://api.github.com/users/test-user",
							html_url: "https://github.com/test-user",
							followers_url: "https://api.github.com/users/test-user/followers",
							following_url: "https://api.github.com/users/test-user/following{/other_user}",
							gists_url: "https://api.github.com/users/test-user/gists{/gist_id}",
							starred_url: "https://api.github.com/users/test-user/starred{/owner}{/repo}",
							subscriptions_url: "https://api.github.com/users/test-user/subscriptions",
							organizations_url: "https://api.github.com/users/test-user/orgs",
							repos_url: "https://api.github.com/users/test-user/repos",
							events_url: "https://api.github.com/users/test-user/events{/privacy}",
							received_events_url: "https://api.github.com/users/test-user/received_events",
							type: "User",
							site_admin: false,
						},
						repo: {
							id: 1,
							node_id: "R_1",
							name: "test",
							full_name: "test/test",
							private: false,
							owner: {
								login: "test-user",
								id: 1,
								node_id: "U_1",
								avatar_url: "https://github.com/images/error/test-user_happy.gif",
								gravatar_id: "",
								url: "https://api.github.com/users/test-user",
								html_url: "https://github.com/test-user",
								followers_url: "https://api.github.com/users/test-user/followers",
								following_url: "https://api.github.com/users/test-user/following{/other_user}",
								gists_url: "https://api.github.com/users/test-user/gists{/gist_id}",
								starred_url: "https://api.github.com/users/test-user/starred{/owner}{/repo}",
								subscriptions_url: "https://api.github.com/users/test-user/subscriptions",
								organizations_url: "https://api.github.com/users/test-user/orgs",
								repos_url: "https://api.github.com/users/test-user/repos",
								events_url: "https://api.github.com/users/test-user/events{/privacy}",
								received_events_url: "https://api.github.com/users/test-user/received_events",
								type: "User",
								site_admin: false,
							},
							html_url: "https://github.com/test/test",
							description: "Test repository",
							fork: false,
							url: "https://api.github.com/repos/test/test",
							created_at: "2025-01-01T00:00:00Z",
							updated_at: "2025-10-03T00:00:00Z",
							pushed_at: "2025-10-03T00:00:00Z",
							git_url: "git://github.com/test/test.git",
							ssh_url: "git@github.com:test/test.git",
							clone_url: "https://github.com/test/test.git",
							svn_url: "https://github.com/test/test",
							homepage: null,
							size: 100,
							stargazers_count: 0,
							watchers_count: 0,
							language: "TypeScript",
							has_issues: true,
							has_projects: true,
							has_wiki: true,
							has_pages: false,
							has_downloads: true,
							archived: false,
							disabled: false,
							open_issues_count: 0,
							license: null,
							forks: 0,
							open_issues: 0,
							watchers: 0,
							default_branch: "main",
						},
					},
					base: {
						label: "test:main",
						ref: "main",
						sha: "def456",
						user: {
							login: "test-user",
							id: 1,
							node_id: "U_1",
							avatar_url: "https://github.com/images/error/test-user_happy.gif",
							gravatar_id: "",
							url: "https://api.github.com/users/test-user",
							html_url: "https://github.com/test-user",
							followers_url: "https://api.github.com/users/test-user/followers",
							following_url: "https://api.github.com/users/test-user/following{/other_user}",
							gists_url: "https://api.github.com/users/test-user/gists{/gist_id}",
							starred_url: "https://api.github.com/users/test-user/starred{/owner}{/repo}",
							subscriptions_url: "https://api.github.com/users/test-user/subscriptions",
							organizations_url: "https://api.github.com/users/test-user/orgs",
							repos_url: "https://api.github.com/users/test-user/repos",
							events_url: "https://api.github.com/users/test-user/events{/privacy}",
							received_events_url: "https://api.github.com/users/test-user/received_events",
							type: "User",
							site_admin: false,
						},
						repo: {
							id: 1,
							node_id: "R_1",
							name: "test",
							full_name: "test/test",
							private: false,
							owner: {
								login: "test-user",
								id: 1,
								node_id: "U_1",
								avatar_url: "https://github.com/images/error/test-user_happy.gif",
								gravatar_id: "",
								url: "https://api.github.com/users/test-user",
								html_url: "https://github.com/test-user",
								followers_url: "https://api.github.com/users/test-user/followers",
								following_url: "https://api.github.com/users/test-user/following{/other_user}",
								gists_url: "https://api.github.com/users/test-user/gists{/gist_id}",
								starred_url: "https://api.github.com/users/test-user/starred{/owner}{/repo}",
								subscriptions_url: "https://api.github.com/users/test-user/subscriptions",
								organizations_url: "https://api.github.com/users/test-user/orgs",
								repos_url: "https://api.github.com/users/test-user/repos",
								events_url: "https://api.github.com/users/test-user/events{/privacy}",
								received_events_url: "https://api.github.com/users/test-user/received_events",
								type: "User",
								site_admin: false,
							},
							html_url: "https://github.com/test/test",
							description: "Test repository",
							fork: false,
							url: "https://api.github.com/repos/test/test",
							created_at: "2025-01-01T00:00:00Z",
							updated_at: "2025-10-03T00:00:00Z",
							pushed_at: "2025-10-03T00:00:00Z",
							git_url: "git://github.com/test/test.git",
							ssh_url: "git@github.com:test/test.git",
							clone_url: "https://github.com/test/test.git",
							svn_url: "https://github.com/test/test",
							homepage: null,
							size: 100,
							stargazers_count: 0,
							watchers_count: 0,
							language: "TypeScript",
							has_issues: true,
							has_projects: true,
							has_wiki: true,
							has_pages: false,
							has_downloads: true,
							archived: false,
							disabled: false,
							open_issues_count: 0,
							license: null,
							forks: 0,
							open_issues: 0,
							watchers: 0,
							default_branch: "main",
						},
					},
					_links: {
						self: { href: `https://api.github.com/repos/test/test/pulls/${prNumber}` },
						html: { href: `https://github.com/test/test/pull/${prNumber}` },
						issue: { href: `https://api.github.com/repos/test/test/issues/${prNumber}` },
						comments: {
							href: `https://api.github.com/repos/test/test/issues/${prNumber}/comments`,
						},
						review_comments: {
							href: `https://api.github.com/repos/test/test/pulls/${prNumber}/comments`,
						},
						review_comment: {
							href: `https://api.github.com/repos/test/test/pulls/comments{/number}`,
						},
						commits: { href: `https://api.github.com/repos/test/test/pulls/${prNumber}/commits` },
						statuses: { href: `https://api.github.com/repos/test/test/statuses/abc123` },
					},
					author_association: "OWNER",
					auto_merge: null,
					active_lock_reason: null,
				}
			:	null,
		error: null,
	});

	/** Helper function to create mock TranslationFile */
	const createMockTranslationFile = (filename: string, path: string): TranslationFile =>
		new TranslationFile(`# Content of ${filename}`, filename, path, `sha_${filename}`);

	describe("Constructor", () => {
		test("should initialize correctly", () => {
			expect(commentBuilderService).toBeInstanceOf(CommentBuilderService);
		});
	});

	describe("buildComment", () => {
		test("should build hierarchical comment from results and files", () => {
			const results: ProcessedFileResult[] = [
				createMockResult("intro.md", 123),
				createMockResult("api.md", 124),
			];

			const filesToTranslate: TranslationFile[] = [
				createMockTranslationFile("intro.md", "src/content/docs/intro.md"),
				createMockTranslationFile("api.md", "src/content/docs/api/api.md"),
			];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toBeString();
			expect(result).toContain("docs");
			expect(result).toContain("`intro.md`: #123");
			expect(result).toContain("`api.md`: #124");
		});

		test("should handle files without matching translation files", () => {
			const results: ProcessedFileResult[] = [createMockResult("missing.md", 125)];

			const filesToTranslate: TranslationFile[] = [
				createMockTranslationFile("existing.md", "src/content/docs/existing.md"),
			];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toBeString();
			expect(result).not.toContain("missing.md");
		});

		test("should handle files without pull request numbers", () => {
			const results: ProcessedFileResult[] = [createMockResult("no-pr.md", null)];

			const filesToTranslate: TranslationFile[] = [
				createMockTranslationFile("no-pr.md", "src/content/docs/no-pr.md"),
			];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toContain("`no-pr.md`: #0");
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
					content: "# Blog Post",
					pullRequest: { number: 126 },
					error: null,
				},
			];

			const filesToTranslate: TranslationFile[] = [
				{
					filename: "post.md",
					path: "src/content/blog/2024/01/15/post.md",
					content: "# Blog Post",
				},
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
					content: "# Test",
					pullRequest: { number: 127 },
					error: null,
				},
			];

			const filesToTranslate: TranslationFile[] = [
				{
					filename: "test.md",
					path: "src/content/docs/advanced/test.md",
					content: "# Test",
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
					content: "# Article",
					pullRequest: { number: 128 },
					error: null,
				},
			];

			const filesToTranslate: TranslationFile[] = [
				{
					filename: "article.md",
					path: "src/content/blog/2024/03/15/some-folder/article.md",
					content: "# Article",
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
					content: "# Introduction",
					pullRequest: { number: 129 },
					error: null,
				},
				{
					filename: "advanced.md",
					content: "# Advanced",
					pullRequest: { number: 130 },
					error: null,
				},
				{
					filename: "api.md",
					content: "# API",
					pullRequest: { number: 131 },
					error: null,
				},
			];

			const filesToTranslate: TranslationFile[] = [
				{
					filename: "intro.md",
					path: "src/content/docs/intro.md",
					content: "# Introduction",
				},
				{
					filename: "advanced.md",
					path: "src/content/docs/guides/advanced.md",
					content: "# Advanced",
				},
				{
					filename: "api.md",
					path: "src/content/docs/reference/api.md",
					content: "# API",
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
					content: "# Zebra",
					pullRequest: { number: 132 },
					error: null,
				},
				{
					filename: "alpha.md",
					content: "# Alpha",
					pullRequest: { number: 133 },
					error: null,
				},
			];

			const filesToTranslate: TranslationFile[] = [
				{
					filename: "zebra.md",
					path: "src/content/docs/zebra.md",
					content: "# Zebra",
				},
				{
					filename: "alpha.md",
					path: "src/content/docs/alpha.md",
					content: "# Alpha",
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
					content: "# Deep",
					pullRequest: { number: 134 },
					error: null,
				},
			];

			const filesToTranslate: TranslationFile[] = [
				{
					filename: "deep.md",
					path: "src/content/docs/level1/level2/level3/deep.md",
					content: "# Deep",
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
					content: "# Empty",
					pullRequest: { number: 135 },
					error: null,
				},
			];

			const filesToTranslate: TranslationFile[] = [
				{
					filename: "",
					path: "src/content/docs/",
					content: "# Empty",
				},
			];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toBeString();
		});

		test("should handle files with special characters in names", () => {
			const results: ProcessedFileResult[] = [
				{
					filename: "special-file_name.with.dots.md",
					content: "# Special",
					pullRequest: { number: 136 },
					error: null,
				},
			];

			const filesToTranslate: TranslationFile[] = [
				{
					filename: "special-file_name.with.dots.md",
					path: "src/content/docs/special-file_name.with.dots.md",
					content: "# Special",
				},
			];

			const result = commentBuilderService.buildComment(results, filesToTranslate);

			expect(result).toContain("`special-file_name.with.dots.md`: #136");
		});

		test("should handle large number of files", () => {
			const results: ProcessedFileResult[] = [];
			const filesToTranslate: TranslationFile[] = [];

			for (let i = 1; i <= 50; i++) {
				results.push({
					filename: `file-${i.toString().padStart(2, "0")}.md`,
					content: `# File ${i}`,
					pullRequest: { number: 100 + i },
					error: null,
				});

				filesToTranslate.push({
					filename: `file-${i.toString().padStart(2, "0")}.md`,
					path: `src/content/docs/batch/file-${i.toString().padStart(2, "0")}.md`,
					content: `# File ${i}`,
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
