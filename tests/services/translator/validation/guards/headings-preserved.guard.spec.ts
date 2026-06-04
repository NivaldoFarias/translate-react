import { describe, expect, test } from "bun:test";

import { headingsPreservedGuard } from "@/app/services/translator/validation/guards/headings-preserved.guard";

describe("headingsPreservedGuard", () => {
	test("returns null when the source has no headings", () => {
		expect(headingsPreservedGuard("Plain text only.", "Só texto.")).toBeNull();
	});

	test("returns null when at least one heading survives translation", () => {
		const source = "# Title\n\n## Section\n\nBody";
		const translated = "Intro prose\n\n## Seção\n\nCorpo";

		expect(headingsPreservedGuard(source, translated)).toBeNull();
	});

	test("fails when every heading was removed", () => {
		const source = "# Title\n\n## Section\n\nContent";
		const translated = "Just plain text without hashes.";

		const issue = headingsPreservedGuard(source, translated);

		expect(issue?.guardId).toBe("headingsPreserved");
		expect(issue?.message).toContain("headings lost");
		expect(issue?.retryHint).toContain("heading");
	});

	test("fails when only the top-level heading is lost but subheadings remain", () => {
		const source = "# Title\n\n## Section";
		const translated = "No H1 here\n\n## Seção";

		expect(headingsPreservedGuard(source, translated)).toBeNull();
	});
});
