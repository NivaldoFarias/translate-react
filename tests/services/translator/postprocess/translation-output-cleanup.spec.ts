import { describe, expect, test } from "bun:test";

import {
	cleanupFullBodyTranslation,
	cleanupSegmentSnippet,
	isHeadingTextSegmentPath,
	normalizeInlineCodeBeforePunctuationSpacing,
	preserveSegmentBoundaryWhitespace,
	sanitizeSegmentTranslation,
	stripEchoedHeadingMarkers,
} from "@/app/services/translator/postprocess/translation-output-cleanup";
import { TranslationFile } from "@/app/services/translator/translation-file";

function createSnippetFile(content: string) {
	return new TranslationFile(content, "test.md#s1", "src/content/test.md", "sha", undefined, "en");
}

describe("cleanupSegmentSnippet", () => {
	test("preserves trailing space before a markdown link segment", () => {
		const file = createSnippetFile("por ");
		const cleaned = cleanupSegmentSnippet("por", "por ", file);

		expect(cleaned).toBe("por ");
	});

	test("preserves leading space after inline code in a segment", () => {
		const file = createSnippetFile(" pode ");
		const cleaned = cleanupSegmentSnippet("pode", " pode ", file);

		expect(cleaned).toBe(" pode ");
	});

	test("strips LLM prefix artifacts without removing boundary whitespace", () => {
		const file = createSnippetFile("por ");
		const cleaned = cleanupSegmentSnippet("Translation:por", "por ", file);

		expect(cleaned).toBe("por ");
	});
});

describe("cleanupFullBodyTranslation", () => {
	test("trims full-body translations", () => {
		const file = createSnippetFile("  translated body  ");
		const cleaned = cleanupFullBodyTranslation("  translated body  ", file);

		expect(cleaned).toBe("translated body");
	});

	test("removes spurious space before punctuation after inline code", () => {
		const file = createSnippetFile("x");
		const cleaned = cleanupFullBodyTranslation("No modo `annotation` , onde", file);

		expect(cleaned).toBe("No modo `annotation`, onde");
	});
});

describe("normalizeInlineCodeBeforePunctuationSpacing", () => {
	test("collapses space before comma after inline code", () => {
		expect(normalizeInlineCodeBeforePunctuationSpacing("chamar `root.unmount` , você")).toBe(
			"chamar `root.unmount`, você",
		);
	});
});

describe("preserveSegmentBoundaryWhitespace", () => {
	test("restores dropped trailing whitespace from the source segment", () => {
		expect(preserveSegmentBoundaryWhitespace("por", "por ")).toBe("por ");
	});

	test("restores dropped leading whitespace from the source segment", () => {
		expect(preserveSegmentBoundaryWhitespace("pode", " pode ")).toBe(" pode ");
	});

	test("leaves translation unchanged when boundary whitespace already matches", () => {
		expect(preserveSegmentBoundaryWhitespace("por ", "por ")).toBe("por ");
	});
});

describe("stripEchoedHeadingMarkers", () => {
	test("removes echoed markdown heading markers", () => {
		expect(stripEchoedHeadingMarkers("## Como migrar")).toBe("Como migrar");
	});

	test("leaves heading prose without echoed markers unchanged", () => {
		expect(stripEchoedHeadingMarkers("Como migrar")).toBe("Como migrar");
	});
});

describe("isHeadingTextSegmentPath", () => {
	test("matches heading text node paths", () => {
		expect(isHeadingTextSegmentPath("root/heading[2]/text[0]")).toBe(true);
		expect(isHeadingTextSegmentPath("root/paragraph[1]/text[0]")).toBe(false);
	});
});

describe("sanitizeSegmentTranslation", () => {
	test("strips echoed heading markers for heading text segments", () => {
		const file = createSnippetFile("x");
		const cleaned = sanitizeSegmentTranslation(
			"## Como migrar",
			"How to migrate",
			"root/heading[1]/text[0]",
			file,
		);

		expect(cleaned).toBe("Como migrar");
	});

	test("preserves spacing for non-heading segments", () => {
		const file = createSnippetFile("por ");
		const cleaned = sanitizeSegmentTranslation("por", "por ", "root/paragraph[1]/text[0]", file);

		expect(cleaned).toBe("por ");
	});
});
