import { describe, expect, test } from "bun:test";

import { canonicalizeMarkdownLinkUrlForComparison } from "@/app/utils/mdn-url.util";

describe("canonicalizeMarkdownLinkUrlForComparison", () => {
	test("strips MDN locale segments for comparison", () => {
		expect(
			canonicalizeMarkdownLinkUrlForComparison(
				"https://developer.mozilla.org/en-US/docs/Glossary/String",
			),
		).toBe("https://developer.mozilla.org/docs/Glossary/String");
	});

	test("treats rewritten locale URLs as equivalent to en-US", () => {
		const enUs = "https://developer.mozilla.org/en-US/docs/Glossary/String";
		const ru = "https://developer.mozilla.org/ru/docs/Glossary/String";

		expect(canonicalizeMarkdownLinkUrlForComparison(ru)).toBe(
			canonicalizeMarkdownLinkUrlForComparison(enUs),
		);
	});

	test("leaves non-MDN URLs unchanged", () => {
		expect(canonicalizeMarkdownLinkUrlForComparison("/learn")).toBe("/learn");
	});
});
