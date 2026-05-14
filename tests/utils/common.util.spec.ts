import { describe, expect, test } from "bun:test";

import {
	detectRateLimit,
	filterMarkdownFiles,
	formatElapsedTime,
	nftsCompatibleDateString,
} from "@/utils/";

import { createRepositoryTreeItemFixture } from "@tests/fixtures";

describe("common.util", () => {
	describe("nftsCompatibleDateString", () => {
		test("replaces colons with hyphens in ISO string", () => {
			const date = new Date("2024-01-01T12:34:56.000Z");
			const result = nftsCompatibleDateString(date);

			expect(result).toBe("2024-01-01T12-34-56.000Z");
		});

		test("includes milliseconds and timezone offset", () => {
			const date = new Date("2024-01-01T00:00:00.123Z");
			const result = nftsCompatibleDateString(date);

			expect(result).toBe("2024-01-01T00-00-00.123Z");
		});
	});

	describe("formatElapsedTime", () => {
		test("formats duration under 60 seconds in seconds", () => {
			const result = formatElapsedTime(30_000);

			expect(result).toContain("30");
			expect(result.toLowerCase()).toContain("second");
		});

		test("formats duration under 3600 seconds in minutes", () => {
			const result = formatElapsedTime(120_000);

			expect(result).toContain("2");
			expect(result.toLowerCase()).toContain("minute");
		});

		test("formats duration over 3600 seconds in hours", () => {
			const result = formatElapsedTime(7200_000);

			expect(result).toContain("2");
			expect(result.toLowerCase()).toContain("hour");
		});

		test("formats duration with locale-specific unit names", () => {
			const result = formatElapsedTime(120_000, "pt-BR");

			expect(result).toContain("2");
			expect(result.toLowerCase()).toContain("minuto");
		});
	});

	describe("filterMarkdownFiles", () => {
		test("includes items with .md path under src/", () => {
			const tree = [
				createRepositoryTreeItemFixture({ path: "src/docs/readme.md" }),
				createRepositoryTreeItemFixture({ path: "src/content/page.md" }),
			];

			const result = filterMarkdownFiles(tree);

			expect(result).toHaveLength(2);
			expect(result[0]?.path).toBe("src/docs/readme.md");
			expect(result[1]?.path).toBe("src/content/page.md");
		});

		test("excludes items without .md extension", () => {
			const tree = [
				createRepositoryTreeItemFixture({ path: "src/docs/readme.md" }),
				createRepositoryTreeItemFixture({ path: "src/content/index.js" }),
			];

			const result = filterMarkdownFiles(tree);

			expect(result).toHaveLength(1);
			expect(result[0]?.path).toBe("src/docs/readme.md");
		});

		test("excludes items whose path does not include src/", () => {
			const tree = [
				createRepositoryTreeItemFixture({ path: "src/docs/readme.md" }),
				createRepositoryTreeItemFixture({ path: "docs/readme.md" }),
			];

			const result = filterMarkdownFiles(tree);

			expect(result).toHaveLength(1);
			expect(result[0]?.path).toBe("src/docs/readme.md");
		});
	});

	describe("detectRateLimit", () => {
		test("returns true when statusCode is 429", () => {
			expect(detectRateLimit("any message", 429)).toBe(true);
		});

		test("returns true when message contains rate limit phrase", () => {
			expect(detectRateLimit("Rate limit exceeded")).toBe(true);
		});

		test("returns true when message contains 429", () => {
			expect(detectRateLimit("Error 429 too many requests")).toBe(true);
		});

		test("returns true when message contains quota", () => {
			expect(detectRateLimit("Quota exceeded for this month")).toBe(true);
		});

		test("returns false when message and status are not rate limit", () => {
			expect(detectRateLimit("Not found", 404)).toBe(false);
		});
	});
});
