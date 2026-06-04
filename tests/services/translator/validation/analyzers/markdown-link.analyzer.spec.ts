import { describe, expect, test } from "bun:test";

import {
	extractMarkdownLinkSpans,
	findMarkdownLinkViolations,
} from "@/app/services/translator/validation/analyzers/markdown-link.analyzer";

describe("markdown-link analyzer", () => {
	test("extractMarkdownLinkSpans returns url and text", () => {
		const spans = extractMarkdownLinkSpans("[label](/path)");

		expect(spans).toHaveLength(1);
		expect(spans[0]?.url).toBe("/path");
		expect(spans[0]?.text).toBe("label");
	});

	test("findMarkdownLinkViolations detects broken link closings", () => {
		const source = "[docs](/learn)";
		const translated = "\\`docs\\`](/learn)";

		const violations = findMarkdownLinkViolations(source, translated);

		expect(violations.length).toBeGreaterThan(0);
		expect(violations.some((violation) => violation.url === "/learn")).toBe(true);
	});
});
