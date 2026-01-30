import { describe, expect, test } from "bun:test";

import type { WorkflowStatistics } from "@/services/runner/runner.types";

import { ApplicationError, ErrorCode } from "@/errors/";
import {
	detectRateLimit,
	extractDocTitleFromContent,
	filterMarkdownFiles,
	formatElapsedTime,
	nftsCompatibleDateString,
	validateSuccessRate,
} from "@/utils/";
import { env } from "@/utils/env.util";

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

	describe("validateSuccessRate", () => {
		test("does not throw when success rate meets threshold", () => {
			const stats = {
				successRate: env.MIN_SUCCESS_RATE,
				successCount: 3,
				failureCount: 1,
				totalCount: 4,
			} satisfies WorkflowStatistics;

			expect(() => {
				validateSuccessRate(stats);
			}).not.toThrow();
		});

		test("throws ApplicationError when success rate is below threshold", () => {
			const below = Math.max(0, env.MIN_SUCCESS_RATE - 0.05);
			const stats = {
				successRate: below,
				successCount: 2,
				failureCount: 8,
				totalCount: 10,
			} satisfies WorkflowStatistics;

			try {
				validateSuccessRate(stats);
				throw new Error("Expected validateSuccessRate to throw ApplicationError");
			} catch (error) {
				expect(error).toBeInstanceOf(ApplicationError);

				if (error instanceof ApplicationError) {
					expect(error.code).toBe(ErrorCode.BelowMinimumSuccessRate);

					expect(error.metadata).toBeDefined();
					expect(error.metadata).toHaveProperty("successRate");
					expect((error.metadata as Record<string, unknown>)["successRate"]).toBe(
						(stats.successRate * 100).toFixed(1),
					);

					expect(error.metadata).toHaveProperty("minSuccessRate");
					expect((error.metadata as Record<string, unknown>)["minSuccessRate"]).toBe(
						(env.MIN_SUCCESS_RATE * 100).toFixed(0),
					);

					expect(error.metadata).toHaveProperty("successCount");
					expect((error.metadata as Record<string, unknown>)["successCount"]).toBe(
						stats.successCount,
					);

					expect(error.metadata).toHaveProperty("failureCount");
					expect((error.metadata as Record<string, unknown>)["failureCount"]).toBe(
						stats.failureCount,
					);

					expect(error.metadata).toHaveProperty("totalCount");
					expect((error.metadata as Record<string, unknown>)["totalCount"]).toBe(stats.totalCount);
				}
			}
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

	describe("extractDocTitleFromContent", () => {
		test("returns title from frontmatter with single quotes", () => {
			const content = "---\ntitle: 'Hello'\n---\n# Hello";
			const result = extractDocTitleFromContent(content);

			expect(result).toBe("Hello");
		});

		test("returns title from frontmatter with double quotes", () => {
			const content = '---\ntitle: "World"\n---\n# World';
			const result = extractDocTitleFromContent(content);

			expect(result).toBe("World");
		});

		test("returns undefined when no title in frontmatter", () => {
			const content = "---\nother: value\n---\n# Doc";
			const result = extractDocTitleFromContent(content);

			expect(result).toBeUndefined();
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
