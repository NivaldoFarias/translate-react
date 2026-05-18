import { describe, expect, test } from "bun:test";

import {
	filterReportableProgressCommentResults,
	PullRequestProgressAction,
	TranslationFile,
} from "@/services/";
import { selectProgressCommentPayload } from "@/services/comment-builder/progress-comment.util";

import { createMockPullRequestListItem } from "@tests/fixtures";

describe("progress-comment.util", () => {
	describe("filterReportableProgressCommentResults", () => {
		test("includes only newly created pull requests", () => {
			const results = [
				{
					filename: "a.md",
					branch: null,
					translation: null,
					pullRequest: createMockPullRequestListItem(1),
					pullRequestProgress: PullRequestProgressAction.Created,
					error: null,
				},
				{
					filename: "b.md",
					branch: null,
					translation: null,
					pullRequest: createMockPullRequestListItem(2),
					pullRequestProgress: PullRequestProgressAction.Reused,
					error: null,
				},
			];

			expect(filterReportableProgressCommentResults(results)).toHaveLength(1);
		});

		test("excludes reused pull requests", () => {
			const results = [
				{
					filename: "a.md",
					branch: null,
					translation: null,
					pullRequest: createMockPullRequestListItem(1),
					pullRequestProgress: PullRequestProgressAction.Reused,
					error: null,
				},
			];

			expect(filterReportableProgressCommentResults(results)).toHaveLength(0);
		});
	});

	describe("selectProgressCommentPayload", () => {
		test("returns only matching translation files for reportable results", () => {
			const filesToTranslate = [
				new TranslationFile("# A", "a.md", "src/content/a.md", "sha_a"),
				new TranslationFile("# B", "b.md", "src/content/b.md", "sha_b"),
			];
			const results = [
				{
					filename: "a.md",
					branch: null,
					translation: "# A",
					pullRequest: createMockPullRequestListItem(10),
					pullRequestProgress: PullRequestProgressAction.Created,
					error: null,
				},
				{
					filename: "b.md",
					branch: null,
					translation: null,
					pullRequest: createMockPullRequestListItem(11),
					pullRequestProgress: PullRequestProgressAction.Reused,
					error: null,
				},
			];

			const { reportableResults, reportableFiles } = selectProgressCommentPayload(
				results,
				filesToTranslate,
			);

			expect(reportableResults).toHaveLength(1);
			expect(reportableFiles).toHaveLength(1);
			expect(reportableFiles[0]?.filename).toBe("a.md");
		});
	});
});
