import { describe, expect, test } from "bun:test";

import type { LocalePRBodyStrings } from "@/app/locales/types";

import { buildReviewerWarningsMarkdown } from "@/app/locales/reviewer-warnings-pr.util";

const strings: LocalePRBodyStrings["reviewerWarnings"] = {
	intro: "Validation issues detected:",
	detailsSummary: "Show validation details",
	guardLabel: (guardId) => guardId,
	violationLocation: (startLine, endLine) =>
		endLine === startLine ? `line ${startLine}` : `lines ${startLine}–${endLine}`,
};

describe("buildReviewerWarningsMarkdown", () => {
	test("returns empty string when there are no reviewer notices", () => {
		expect(buildReviewerWarningsMarkdown([], strings, "# Source", "# Translated")).toBe("");
	});

	test("formats JSX fence violations as diff blocks with line ranges", () => {
		const source = [
			"# Demo",
			"",
			"```js",
			"return (",
			"  <ViewTransition>",
			"    <div>animate me</div>",
			"  </ViewTransition>",
			");",
			"```",
		].join("\n");
		const translated = source.replace("<div>animate me</div>", "<div>anime-me</div>");

		const markdown = buildReviewerWarningsMarkdown(
			[
				{
					guardId: "fenceJsxStaticText",
					hint:
						'Inside fenced code blocks, do not translate JSX text between tags or demo UI string literals used in examples. Copy static JSX text exactly from the source in English. fence 1: keep JSX text "animate me" (changed to "anime-me")',
				},
			],
			strings,
			source,
			translated,
		);

		expect(markdown).toContain("<details>");
		expect(markdown).toContain("### fenceJsxStaticText");
		expect(markdown).toContain("##### `fenceJsxStaticText`");
		expect(markdown).toContain("###### 1. line");
		expect(markdown).toContain("```diff");
		expect(markdown).toContain("- animate me");
		expect(markdown).toContain("+ anime-me");
		expect(markdown).not.toContain("\\n");
		expect(markdown).not.toContain("> [!WARNING]");
	});
});
