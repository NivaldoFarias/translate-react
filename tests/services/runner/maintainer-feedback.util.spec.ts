import { describe, expect, test } from "bun:test";

import type { PullRequestIssueCommentSnapshot } from "@/app/services/github/types";

import {
	buildTranslationCommitMessage,
	getMaintainerFeedbackSnapshot,
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

	describe("getMaintainerFeedbackSnapshot", () => {
		const runnerCommitAt = new Date("2026-06-03T10:00:00Z");

		test("returns bodies and unique author logins in chronological order", () => {
			const comments = [
				comment({
					login: "jhonmike",
					body: "Fix the heading case.",
					createdAt: new Date("2026-06-03T11:00:00Z"),
				}),
				comment({
					login: "gaearon",
					body: "Also check the link text.",
					createdAt: new Date("2026-06-03T12:00:00Z"),
				}),
				comment({
					login: "jhonmike",
					body: "One more note on terminology.",
					createdAt: new Date("2026-06-03T13:00:00Z"),
				}),
			];

			expect(getMaintainerFeedbackSnapshot(comments, runnerCommitAt)).toEqual({
				bodies: [
					"Fix the heading case.",
					"Also check the link text.",
					"One more note on terminology.",
				],
				authorLogins: ["jhonmike", "gaearon"],
			});
		});
	});

	describe("buildTranslationCommitMessage", () => {
		test("returns subject only for standard translations", () => {
			expect(buildTranslationCommitMessage("target.md", "Portuguese")).toBe(
				"docs: translate `target.md` to Portuguese",
			);
		});

		test("adds maintainer attribution in the commit body", () => {
			expect(buildTranslationCommitMessage("target.md", "Portuguese", ["jhonmike"])).toBe(
				"docs: translate `target.md` to Portuguese\n\nper @jhonmike feedback",
			);
		});

		test("lists multiple maintainers in attribution order", () => {
			expect(
				buildTranslationCommitMessage("target.md", "Portuguese", ["jhonmike", "gaearon"]),
			).toBe("docs: translate `target.md` to Portuguese\n\nper @jhonmike, @gaearon feedback");
		});
	});
});
