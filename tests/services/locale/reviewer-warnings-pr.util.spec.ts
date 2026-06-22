import { describe, expect, test } from "bun:test";

import type { LocalePRBodyStrings } from "@/app/locales/types";

import { buildReviewerWarningsMarkdown } from "@/app/locales/reviewer-warnings-pr.util";

const strings: LocalePRBodyStrings["reviewerWarnings"] = {
	intro: "Validation issues detected:",
	detailsSummary: "Show validation details",
	guardLabel: (guardId) => guardId,
	violationTally: (count) => (count === 1 ? "1 violation" : `${count} violations`),
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
					hint: 'Inside fenced code blocks, do not translate JSX text between tags or demo UI string literals used in examples. Copy static JSX text exactly from the source in English. fence 1: keep JSX text "animate me" (changed to "anime-me")',
				},
			],
			strings,
			source,
			translated,
		);

		expect(markdown).toContain("<details>");
		expect(markdown).toContain("### fenceJsxStaticText");
		expect(markdown).toContain("> Inside fenced code blocks");
		expect(markdown).toContain("#### `fenceJsxStaticText` (1 violation)");
		expect(markdown).toContain("#### L");
		expect(markdown).toContain("```diff");
		expect(markdown).toContain("- animate me");
		expect(markdown).toContain("+ anime-me");
		expect(markdown).not.toContain("######");
		expect(markdown).not.toContain("\\n");
		expect(markdown).not.toContain("> [!WARNING]");
	});

	test("formats MDX spacing violations with line ranges and a violation tally", () => {
		const translated = "Use `hydrateRoot`permite mounting.\n";

		const markdown = buildReviewerWarningsMarkdown(
			[
				{
					guardId: "mdxSpacing",
					hint: "Preserve spaces around markdown links, inline code, and `{/*slug*/}` comments exactly as structural separators in prose.",
				},
			],
			strings,
			"# Source",
			translated,
		);

		expect(markdown).toContain("#### `mdxSpacing` (1 violation)");
		expect(markdown).toContain("#### L1");
		expect(markdown).toContain("missing space after inline code");
	});

	test("formats markdown link violations with line ranges", () => {
		const source = "Read [docs](/learn) for details.\n";
		const translated = "Read /learn for details.\n";

		const markdown = buildReviewerWarningsMarkdown(
			[
				{
					guardId: "markdownLinksPreserved",
					hint: 'Preserve every source markdown link as `[translated label](same-url)` with balanced brackets and parentheses. Problems found: Missing markdown link for URL "/learn" (1 → 0).',
				},
			],
			strings,
			source,
			translated,
		);

		expect(markdown).toContain("#### `markdownLinksPreserved`");
		expect(markdown).toContain("#### L1");
		expect(markdown).toContain('Missing markdown link for URL "/learn"');
	});
});
