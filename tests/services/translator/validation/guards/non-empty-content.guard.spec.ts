import { describe, expect, test } from "bun:test";

import { nonEmptyContentGuard } from "@/app/services/translator/validation/guards/non-empty-content.guard";

describe("nonEmptyContentGuard", () => {
	test("returns null for non-empty translated content", () => {
		expect(nonEmptyContentGuard("# Source", "# Traduzido")).toBeNull();
	});

	test("fails on empty string", () => {
		const issue = nonEmptyContentGuard("source", "");

		expect(issue?.guardId).toBe("nonEmptyContent");
		expect(issue?.message).toContain("empty");
	});

	test("fails on whitespace-only output", () => {
		const issue = nonEmptyContentGuard("source", "  \n\t  ");

		expect(issue?.guardId).toBe("nonEmptyContent");
		expect(issue?.retryHint).toContain("full translated document");
	});
});
