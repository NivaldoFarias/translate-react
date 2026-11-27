import { describe, expect, test } from "bun:test";

import { hasPendingChangesRequestedReview } from "@/app/services/runner/workflow/pull-request-review.util";

import { createMockPullRequestReviewSnapshot } from "@tests/fixtures";

describe("hasPendingChangesRequestedReview", () => {
	test("is true when a maintainer's latest decisive review requests changes", () => {
		const reviews = [
			createMockPullRequestReviewSnapshot({ id: 1, state: "CHANGES_REQUESTED" }),
			createMockPullRequestReviewSnapshot({
				id: 2,
				state: "COMMENTED",
				submittedAt: new Date("2026-06-04T12:00:00Z"),
			}),
		];

		expect(hasPendingChangesRequestedReview(reviews)).toBe(true);
	});

	test("is false once the same maintainer approves", () => {
		const reviews = [
			createMockPullRequestReviewSnapshot({ id: 1, state: "CHANGES_REQUESTED" }),
			createMockPullRequestReviewSnapshot({
				id: 2,
				state: "APPROVED",
				submittedAt: new Date("2026-06-16T02:18:04Z"),
			}),
		];

		expect(hasPendingChangesRequestedReview(reviews)).toBe(false);
	});

	test("is true when one maintainer approves but another still requests changes", () => {
		const reviews = [
			createMockPullRequestReviewSnapshot({ id: 1, login: "jpfigueredo", state: "APPROVED" }),
			createMockPullRequestReviewSnapshot({ id: 2, login: "jhonmike", state: "CHANGES_REQUESTED" }),
		];

		expect(hasPendingChangesRequestedReview(reviews)).toBe(true);
	});

	test("ignores change requests from bots and non-contributors", () => {
		const reviews = [
			createMockPullRequestReviewSnapshot({ id: 1, login: "vercel[bot]", userType: "Bot" }),
			createMockPullRequestReviewSnapshot({ id: 2, login: "drive-by", authorAssociation: "NONE" }),
		];

		expect(hasPendingChangesRequestedReview(reviews)).toBe(false);
	});
});
