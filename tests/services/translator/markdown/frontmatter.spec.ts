import { describe, expect, test } from "bun:test";

import {
	buildFrontmatterBlock,
	collectTopLevelKeysFromInnerYaml,
	extractFrontmatterParts,
	extractTitleScalarFromInnerYaml,
	mergePreservedYamlFrontmatter,
	splitLeadingYamlFrontmatter,
} from "@/app/services/translator/markdown/frontmatter";

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

describe("extractTitleScalarFromInnerYaml", () => {
	test("returns title when value contains a colon inside double quotes", () => {
		expect(extractTitleScalarFromInnerYaml(`title: "a: b"\nother: 1`)).toBe("a: b");
	});

	test("returns undefined when title is not a string scalar", () => {
		expect(extractTitleScalarFromInnerYaml("title: [1, 2]\nother: x")).toBeUndefined();
	});

	test("returns title for block scalar title", () => {
		expect(extractTitleScalarFromInnerYaml("title: |\n  x")).toBe("x");
	});

	test("returns undefined when inner YAML has parse errors", () => {
		expect(extractTitleScalarFromInnerYaml("title:\n  bad: [")).toBeUndefined();
	});
});

describe("collectTopLevelKeysFromInnerYaml", () => {
	test("collects keys when values contain colons in quotes", () => {
		const keys = collectTopLevelKeysFromInnerYaml(`title: "x"\ndescription: "a: b"\n`);
		expect(keys).toEqual(new Set(["title", "description"]));
	});

	test("returns empty set for non-mapping root", () => {
		expect(collectTopLevelKeysFromInnerYaml("- item\n")).toEqual(new Set());
	});

	test("returns empty set on parse errors", () => {
		expect(collectTopLevelKeysFromInnerYaml("foo: [\n")).toEqual(new Set());
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

	test("preserves extra blank lines after frontmatter when source had more leading newlines than the model returned", () => {
		const preserved = "---\ntitle: Source\n---";
		const sourceRest = "\n\n# Heading\n";
		expect(mergePreservedYamlFrontmatter(preserved, "# Heading\n", sourceRest)).toBe(
			"---\ntitle: Source\n---\n\n# Heading\n",
		);
	});

	test("pads one missing newline when source had a single break before the heading", () => {
		const preserved = "---\ntitle: Source\n---";
		const sourceRest = "\n# Heading\n";
		expect(mergePreservedYamlFrontmatter(preserved, "# Heading\n", sourceRest)).toBe(
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
