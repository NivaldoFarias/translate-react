import { describe, expect, test } from "bun:test";

import { getMaintainerFeedbackSnapshot } from "@/app/services/runner/workflow/maintainer-feedback.util";

describe("getMaintainerFeedbackSnapshot", () => {
	test("includes inline comment authors when the review body is empty", () => {
		const snapshot = getMaintainerFeedbackSnapshot(
			[
				{
					id: 42,
					login: "jhonmike",
					authorAssociation: "MEMBER",
					userType: "User",
					state: "CHANGES_REQUESTED",
					submittedAt: new Date("2026-06-03T12:00:00Z"),
					body: null,
				},
			],
			new Date("2026-06-03T10:00:00Z"),
			[
				{
					login: "jhonmike",
					authorAssociation: "MEMBER",
					userType: "User",
					createdAt: new Date("2026-06-03T12:05:00Z"),
					body: "Use sentence case in this heading.",
					pullRequestReviewId: 42,
				},
			],
		);

		expect(snapshot.authorLogins).toEqual(["jhonmike"]);
		expect(snapshot.bodies).toEqual(["Use sentence case in this heading."]);
	});
});
