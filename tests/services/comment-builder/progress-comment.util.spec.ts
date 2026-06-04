import { describe, expect, test } from "bun:test";

import {
	filterProgressCommentResultsByAction,
	filterReportableProgressCommentResults,
	hasReportableProgressComment,
	selectProgressCommentPayload,
} from "@/app/services/comment-builder/progress-comment.util";
import { PullRequestProgressAction } from "@/app/services/github/types";
import { TranslationFile } from "@/app/services/translator/translation-file";

import { createMockPullRequestListItem } from "@tests/fixtures";

describe("progress-comment.util", () => {
	describe("filterProgressCommentResultsByAction", () => {
		test("filters results by pull request progress action", () => {
			const results = [
				{
					filename: "a.md",
					branch: null,
					translation: null,
					reviewerNotices: [],
					pullRequest: createMockPullRequestListItem(1),
					pullRequestProgress: PullRequestProgressAction.Created,
					error: null,
				},
				{
					filename: "b.md",
					branch: null,
					translation: null,
					reviewerNotices: [],
					pullRequest: createMockPullRequestListItem(2),
					pullRequestProgress: PullRequestProgressAction.Reused,
					error: null,
				},
			];

			expect(
				filterProgressCommentResultsByAction(results, PullRequestProgressAction.Created),
			).toHaveLength(1);
			expect(
				filterProgressCommentResultsByAction(results, PullRequestProgressAction.Reused),
			).toHaveLength(1);
		});
	});

	describe("filterReportableProgressCommentResults", () => {
		test("includes only newly created pull requests", () => {
			const results = [
				{
					filename: "a.md",
					branch: null,
					translation: null,
					reviewerNotices: [],
					pullRequest: createMockPullRequestListItem(1),
					pullRequestProgress: PullRequestProgressAction.Created,
					error: null,
				},
				{
					filename: "b.md",
					branch: null,
					translation: null,
					reviewerNotices: [],
					pullRequest: createMockPullRequestListItem(2),
					pullRequestProgress: PullRequestProgressAction.Reused,
					error: null,
				},
			];

			expect(filterReportableProgressCommentResults(results)).toHaveLength(1);
		});
	});

	describe("selectProgressCommentPayload", () => {
		test("splits created and updated pull requests into separate sections", () => {
			const filesToTranslate = [
				new TranslationFile("# A", "a.md", "src/content/a.md", "sha_a"),
				new TranslationFile("# B", "b.md", "src/content/b.md", "sha_b"),
			];
			const results = [
				{
					filename: "a.md",
					branch: null,
					translation: "# A",
					reviewerNotices: [],
					pullRequest: createMockPullRequestListItem(10),
					pullRequestProgress: PullRequestProgressAction.Created,
					error: null,
				},
				{
					filename: "b.md",
					branch: null,
					translation: "# B",
					reviewerNotices: [],
					pullRequest: createMockPullRequestListItem(11),
					pullRequestProgress: PullRequestProgressAction.Reused,
					error: null,
				},
			];

			const payload = selectProgressCommentPayload(results, filesToTranslate);

			expect(payload.created.reportableResults).toHaveLength(1);
			expect(payload.created.reportableFiles[0]?.filename).toBe("a.md");
			expect(payload.updated.reportableResults).toHaveLength(1);
			expect(payload.updated.reportableFiles[0]?.filename).toBe("b.md");
		});
	});

	describe("hasReportableProgressComment", () => {
		test("returns true when either section has pull requests", () => {
			expect(
				hasReportableProgressComment({
					created: { reportableResults: [], reportableFiles: [] },
					updated: {
						reportableResults: [
							{
								filename: "a.md",
								branch: null,
								translation: null,
								reviewerNotices: [],
								pullRequest: createMockPullRequestListItem(1),
								pullRequestProgress: PullRequestProgressAction.Reused,
								error: null,
							},
						],
						reportableFiles: [],
					},
				}),
			).toBe(true);
		});
	});
});
