import { describe, expect, test } from "bun:test";

import type { PullRequestIssueCommentSnapshot } from "@/app/services/github/types";

import {
	hasMaintainerFeedbackAfterRunnerCommit,
	isMaintainerFeedbackComment,
} from "@/app/services/runner/workflow/maintainer-feedback.util";

function comment(
	overrides: Partial<PullRequestIssueCommentSnapshot> &
		Pick<PullRequestIssueCommentSnapshot, "createdAt">,
): PullRequestIssueCommentSnapshot {
	return {
		login: "jhonmike",
		authorAssociation: "MEMBER",
		userType: "User",
		body: "",
		...overrides,
	};
}

describe("maintainer-feedback.util", () => {
	describe("isMaintainerFeedbackComment", () => {
		test("returns true for repository member comments", () => {
			expect(
				isMaintainerFeedbackComment(comment({ createdAt: new Date("2026-06-03T12:00:00Z") })),
			).toBe(true);
		});

		test("returns false for bot and ignored automation logins", () => {
			expect(
				isMaintainerFeedbackComment(
					comment({
						login: "vercel[bot]",
						userType: "Bot",
						createdAt: new Date("2026-06-03T12:00:00Z"),
					}),
				),
			).toBe(false);
			expect(
				isMaintainerFeedbackComment(
					comment({
						login: "github-actions[bot]",
						userType: "Bot",
						createdAt: new Date("2026-06-03T12:00:00Z"),
					}),
				),
			).toBe(false);
		});

		test("returns false for drive-by contributor comments", () => {
			expect(
				isMaintainerFeedbackComment(
					comment({
						authorAssociation: "CONTRIBUTOR",
						createdAt: new Date("2026-06-03T12:00:00Z"),
					}),
				),
			).toBe(false);
		});
	});

	describe("hasMaintainerFeedbackAfterRunnerCommit", () => {
		const runnerCommitAt = new Date("2026-06-03T10:00:00Z");

		test("returns true when a maintainer commented after the runner commit", () => {
			const comments = [comment({ createdAt: new Date("2026-06-03T11:30:00Z") })];

			expect(hasMaintainerFeedbackAfterRunnerCommit(comments, runnerCommitAt)).toBe(true);
		});

		test("returns false when maintainer feedback predates the runner commit", () => {
			const comments = [comment({ createdAt: new Date("2026-06-03T09:00:00Z") })];

			expect(hasMaintainerFeedbackAfterRunnerCommit(comments, runnerCommitAt)).toBe(false);
		});

		test("returns false when no runner commit baseline exists", () => {
			const comments = [comment({ createdAt: new Date("2026-06-03T11:30:00Z") })];

			expect(hasMaintainerFeedbackAfterRunnerCommit(comments, undefined)).toBe(false);
		});
	});
});
