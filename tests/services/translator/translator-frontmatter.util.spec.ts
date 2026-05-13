import { describe, expect, test } from "bun:test";

import {
	buildFrontmatterBlock,
	extractFrontmatterParts,
	mergePreservedYamlFrontmatter,
	splitLeadingYamlFrontmatter,
} from "@/services/translator/translator-frontmatter.util";

describe("extractFrontmatterParts", () => {
	test("returns null when string has no leading frontmatter", () => {
		expect(extractFrontmatterParts("# Hi")).toBeNull();
	});

	test("returns BOM and inner YAML for a valid block", () => {
		const block = "---\ntitle: A\n---";
		expect(extractFrontmatterParts(block)).toEqual({ bom: "", inner: "title: A" });
	});

	test("preserves BOM in bom field", () => {
		const block = "\uFEFF---\ntitle: A\n---";
		expect(extractFrontmatterParts(block)).toEqual({ bom: "\uFEFF", inner: "title: A" });
	});
});

describe("buildFrontmatterBlock", () => {
	test("wraps inner YAML with fences", () => {
		expect(buildFrontmatterBlock("", "title: X")).toBe("---\ntitle: X\n---");
	});

	test("normalizes CRLF in inner YAML", () => {
		expect(buildFrontmatterBlock("", "title: X\r\nversion: 1")).toBe(
			"---\ntitle: X\nversion: 1\n---",
		);
	});
});

describe("splitLeadingYamlFrontmatter", () => {
	test("returns empty block when source has no leading frontmatter", () => {
		const source = "# Title\n\nBody\n";
		expect(splitLeadingYamlFrontmatter(source)).toEqual({ block: "", rest: source });
	});

	test("returns empty block when frontmatter is not at document start", () => {
		const source = "Intro\n---\ntitle: x\n---\n";
		expect(splitLeadingYamlFrontmatter(source)).toEqual({ block: "", rest: source });
	});

	test("splits leading block and keeps remainder", () => {
		const source = '---\ntitle: "React"\n---\n\n# Heading\n';
		const { block, rest } = splitLeadingYamlFrontmatter(source);
		expect(block).toBe('---\ntitle: "React"\n---');
		expect(rest).toBe("\n\n# Heading\n");
	});

	test("does not split when only a frontmatter-sized prefix exists with no body", () => {
		const source = "---\ntitle: only\n---";
		expect(splitLeadingYamlFrontmatter(source)).toEqual({ block: "", rest: source });
	});

	test("treats UTF-8 BOM before opening fence as part of the block", () => {
		const source = "\uFEFF---\ntitle: Doc\n---\n\n# Hi\n";
		const { block, rest } = splitLeadingYamlFrontmatter(source);
		expect(block.startsWith("\uFEFF---")).toBe(true);
		expect(rest).toBe("\n\n# Hi\n");
	});
});

describe("mergePreservedYamlFrontmatter", () => {
	test("returns translated unchanged when preserved block is empty", () => {
		expect(mergePreservedYamlFrontmatter("", "# A")).toBe("# A");
	});

	test("prepends preserved block when model returns body only", () => {
		const preserved = "---\ntitle: Source\n---";
		const translated = "\n# Heading\n";
		expect(mergePreservedYamlFrontmatter(preserved, translated)).toBe(
			"---\ntitle: Source\n---\n# Heading\n",
		);
	});

	test("inserts a newline before body when the model returns a heading without a leading blank line", () => {
		const preserved = "---\ntitle: Source\n---";
		expect(mergePreservedYamlFrontmatter(preserved, "# Heading\n")).toBe(
			"---\ntitle: Source\n---\n# Heading\n",
		);
	});

	test("strips duplicate leading YAML from model output before prepending", () => {
		const preserved = "---\ntitle: Source\n---";
		const translated = "---\ntitle: Wrong\n---\n\n# Heading\n";
		expect(mergePreservedYamlFrontmatter(preserved, translated)).toBe(
			"---\ntitle: Source\n---\n\n# Heading\n",
		);
	});
});
