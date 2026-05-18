import { describe, expect, test } from "bun:test";

import { stripSpuriousOuterMarkdownFencesWhenSourceHadNoFences } from "@/services/translator/translator-markdown-artifacts.util";

describe("stripSpuriousOuterMarkdownFencesWhenSourceHadNoFences", () => {
	test("returns unchanged when the source already has fenced code blocks", () => {
		const source = "# Hi\n\n```js\nx\n```\n";
		const translated = "# Olá\n\n```js\nx\n```\n";

		expect(stripSpuriousOuterMarkdownFencesWhenSourceHadNoFences(source, translated)).toBe(
			translated,
		);
	});

	test("strips a single spurious opening fence line after leading blank lines", () => {
		const source = "\n\n<Intro>\n\nText\n</Intro>\n";
		const translated = "\n\n```html\n<Intro>\n\nText\n</Intro>\n";

		expect(stripSpuriousOuterMarkdownFencesWhenSourceHadNoFences(source, translated)).toBe(source);
	});

	test("strips wrapping fences and restores leading newline depth", () => {
		const source = "\n\nAlpha";
		const translated = "\n\n```\nAlpha\n```";

		expect(stripSpuriousOuterMarkdownFencesWhenSourceHadNoFences(source, translated)).toBe(source);
	});

	test("strips JSX comment wrapped in fences (index-style body)", () => {
		const source = "\n{/* See HomeContent.js */}";
		const translated = "\n```\n{/* See HomeContent.js */}\n```";

		expect(stripSpuriousOuterMarkdownFencesWhenSourceHadNoFences(source, translated)).toBe(source);
	});

	test("does not strip when inner fenced blocks exist in the source", () => {
		const source = "Intro\n\n```js\n1\n```\n";
		const translated = "Intro PT\n\n```js\n1\n```\n";

		expect(stripSpuriousOuterMarkdownFencesWhenSourceHadNoFences(source, translated)).toBe(
			translated,
		);
	});
});
