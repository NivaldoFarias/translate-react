import { describe, expect, test } from "bun:test";

import type { PullRequestReviewSnapshot } from "@/app/services/github/types";

import {
	buildTranslationCommitMessage,
	getMaintainerFeedbackSnapshot,
	getUnresolvedChangesRequestedReviews,
	hasUnresolvedChangesRequestedReview,
	isReviewerFeedbackAuthor,
} from "@/app/services/runner/workflow/maintainer-feedback.util";

function review(
	overrides: Partial<PullRequestReviewSnapshot> & Pick<PullRequestReviewSnapshot, "submittedAt">,
): PullRequestReviewSnapshot {
	return {
		login: "jhonmike",
		authorAssociation: "MEMBER",
		userType: "User",
		state: "CHANGES_REQUESTED",
		body: "",
		...overrides,
	};
}

describe("maintainer-feedback.util", () => {
	describe("isReviewerFeedbackAuthor", () => {
		test("returns true for repository member reviews", () => {
			expect(
				isReviewerFeedbackAuthor(review({ submittedAt: new Date("2026-06-03T12:00:00Z") })),
			).toBe(true);
		});

		test("returns true for contributor reviews", () => {
			expect(
				isReviewerFeedbackAuthor(
					review({
						authorAssociation: "CONTRIBUTOR",
						submittedAt: new Date("2026-06-03T12:00:00Z"),
					}),
				),
			).toBe(true);
		});

		test("returns false for bot and ignored automation logins", () => {
			expect(
				isReviewerFeedbackAuthor(
					review({
						login: "vercel[bot]",
						userType: "Bot",
						submittedAt: new Date("2026-06-03T12:00:00Z"),
					}),
				),
			).toBe(false);
			expect(
				isReviewerFeedbackAuthor(
					review({
						login: "github-actions[bot]",
						userType: "Bot",
						submittedAt: new Date("2026-06-03T12:00:00Z"),
					}),
				),
			).toBe(false);
		});

		test("returns false for outside collaborator reviews", () => {
			expect(
				isReviewerFeedbackAuthor(
					review({
						authorAssociation: "NONE",
						submittedAt: new Date("2026-06-03T12:00:00Z"),
					}),
				),
			).toBe(false);
		});
	});

	describe("hasUnresolvedChangesRequestedReview", () => {
		const runnerCommitAt = new Date("2026-06-03T10:00:00Z");

		test("returns true when a qualifying CHANGES_REQUESTED review follows the runner commit", () => {
			const reviews = [
				review({
					body: "Fix the heading case.",
					submittedAt: new Date("2026-06-03T11:30:00Z"),
				}),
			];

			expect(hasUnresolvedChangesRequestedReview(reviews, runnerCommitAt)).toBe(true);
		});

		test("returns false when the latest review after the runner commit is APPROVED", () => {
			const reviews = [
				review({
					body: "Please fix the heading.",
					submittedAt: new Date("2026-06-03T11:00:00Z"),
				}),
				review({
					state: "APPROVED",
					body: "Looks good now.",
					submittedAt: new Date("2026-06-03T12:00:00Z"),
				}),
			];

			expect(hasUnresolvedChangesRequestedReview(reviews, runnerCommitAt)).toBe(false);
		});

		test("returns false when CHANGES_REQUESTED predates the runner commit", () => {
			const reviews = [
				review({
					body: "Please fix the heading.",
					submittedAt: new Date("2026-06-03T09:00:00Z"),
				}),
			];

			expect(hasUnresolvedChangesRequestedReview(reviews, runnerCommitAt)).toBe(false);
		});

		test("returns false when no runner commit baseline exists", () => {
			const reviews = [
				review({
					body: "Please fix the heading.",
					submittedAt: new Date("2026-06-03T11:30:00Z"),
				}),
			];

			expect(hasUnresolvedChangesRequestedReview(reviews, undefined)).toBe(false);
		});

		test("returns false for conversation-only COMMENTED reviews without CHANGES_REQUESTED", () => {
			const reviews = [
				review({
					state: "COMMENTED",
					body: "Thanks for the translation!",
					submittedAt: new Date("2026-06-03T11:30:00Z"),
				}),
			];

			expect(hasUnresolvedChangesRequestedReview(reviews, runnerCommitAt)).toBe(false);
		});
	});

	describe("getUnresolvedChangesRequestedReviews", () => {
		const runnerCommitAt = new Date("2026-06-03T10:00:00Z");

		test("keeps only the latest review per reviewer", () => {
			const reviews = [
				review({
					login: "jhonmike",
					body: "First request.",
					submittedAt: new Date("2026-06-03T11:00:00Z"),
				}),
				review({
					login: "jhonmike",
					state: "APPROVED",
					body: "Approved after manual fix.",
					submittedAt: new Date("2026-06-03T12:00:00Z"),
				}),
			];

			expect(getUnresolvedChangesRequestedReviews(reviews, runnerCommitAt)).toEqual([]);
		});
	});

	describe("getMaintainerFeedbackSnapshot", () => {
		const runnerCommitAt = new Date("2026-06-03T10:00:00Z");

		test("returns bodies and unique author logins in chronological order", () => {
			const reviews = [
				review({
					login: "jhonmike",
					body: "Fix the heading case.",
					submittedAt: new Date("2026-06-03T11:00:00Z"),
				}),
				review({
					login: "gaearon",
					authorAssociation: "OWNER",
					body: "Also check the link text.",
					submittedAt: new Date("2026-06-03T12:00:00Z"),
				}),
				review({
					login: "jhonmike",
					body: "One more note on terminology.",
					submittedAt: new Date("2026-06-03T13:00:00Z"),
				}),
			];

			expect(getMaintainerFeedbackSnapshot(reviews, runnerCommitAt)).toEqual({
				bodies: ["Also check the link text.", "One more note on terminology."],
				authorLogins: ["gaearon", "jhonmike"],
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
