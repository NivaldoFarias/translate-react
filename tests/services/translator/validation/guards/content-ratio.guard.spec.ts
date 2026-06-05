import { describe, expect, test } from "bun:test";

import { contentRatioGuard } from "@/app/services/translator/validation/guards/content-ratio.guard";

describe("contentRatioGuard", () => {
	test("returns null for empty source (nothing to compare)", () => {
		expect(contentRatioGuard("", "anything")).toBeNull();
	});

	test("returns null when translated length is within 70%–140% of source", () => {
		const source = "x".repeat(100);
		const translated = "y".repeat(90);

		expect(contentRatioGuard(source, translated)).toBeNull();
	});

	test("fails when output is truncated below 70% of source length", () => {
		const source = "x".repeat(100);
		const translated = "y".repeat(50);

		const issue = contentRatioGuard(source, translated);

		expect(issue?.guardId).toBe("contentRatio");
		expect(issue?.message).toContain("too low");
		expect(issue?.retryHint).toContain("truncated");
	});

	test("fails when output expands beyond 140% of source length", () => {
		const source = "x".repeat(100);
		const translated = "y".repeat(200);

		const issue = contentRatioGuard(source, translated);

		expect(issue?.guardId).toBe("contentRatio");
		expect(issue?.message).toContain("too high");
		expect(issue?.retryHint).toContain("duplicated");
	});

	test("passes at the minimum acceptable ratio boundary", () => {
		const source = "x".repeat(100);
		const translated = "y".repeat(70);

		expect(contentRatioGuard(source, translated)).toBeNull();
	});

	test("passes at the maximum acceptable ratio boundary", () => {
		const source = "x".repeat(100);
		const translated = "y".repeat(140);

		expect(contentRatioGuard(source, translated)).toBeNull();
	});
});
