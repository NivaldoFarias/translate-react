import { describe, expect, test } from "bun:test";

import type { InlineGroupSegment } from "@/app/services/translator/markdown/segments/inline-groups.util";

import {
	extractTranslatableBodySegments,
	filterTranslatableSegments,
} from "@/app/services/translator/markdown/segments/extract-segments.util";
import {
	groupInlineSegments,
	isInlineGroupSegment,
	restoreInlineGroup,
} from "@/app/services/translator/markdown/segments/inline-groups.util";
import { reinsertSegments } from "@/app/services/translator/markdown/segments/reinsert-segments.util";

import childrenMd from "@tests/fixtures/md/Children.md" with { type: "text" };
import hydrateRootMd from "@tests/fixtures/md/hydrateRoot.md" with { type: "text" };
import invalidHookCallMd from "@tests/fixtures/md/invalid-hook-call-warning.md" with { type: "text" };
import lazyMd from "@tests/fixtures/md/lazy.md" with { type: "text" };
import react19Md from "@tests/fixtures/md/react-19.md" with { type: "text" };
import useClientMd from "@tests/fixtures/md/use-client.md" with { type: "text" };

/**
 * Extracts and groups the segments of a markdown body.
 *
 * @param body Markdown body without frontmatter
 *
 * @returns Grouped segments in document order
 */
function groupBody(body: string) {
	const { segments } = extractTranslatableBodySegments(body);
	return groupInlineSegments(body, filterTranslatableSegments(segments, true));
}

/**
 * Returns the only inline group in a markdown body.
 *
 * @param body Markdown body expected to contain one group
 *
 * @returns The inline group
 */
function onlyGroup(body: string): InlineGroupSegment {
	const groups = groupBody(body).filter(isInlineGroupSegment);
	const [group] = groups;

	if (!group || groups.length !== 1) {
		throw new Error(`expected one group, got ${groups.length}`);
	}

	return group;
}

describe("groupInlineSegments", () => {
	test("tags inline code and keeps its text visible", () => {
		const group = onlyGroup("Do not call Hooks after a conditional `return` statement.");

		expect(group.sourceText).toBe(
			"Do not call Hooks after a conditional <c0>return</c0> statement.",
		);
	});

	test("tags links and nested code without exposing the URL", () => {
		const group = onlyGroup("The [`children` prop](/learn/props#jsx) and **bold** text.");

		expect(group.sourceText).toBe("The <s0><c1>children</c1> prop</s0> and <s2>bold</s2> text.");
	});

	test("leaves heading slugs outside the group", () => {
		const body = "### `load` function {/*load*/}";
		const group = onlyGroup(body);

		expect(group.sourceText).toBe("<c0>load</c0> function");
		expect(body.slice(group.end)).toBe(" {/*load*/}");
	});

	test("keeps plain paragraphs as they were", () => {
		const body = "Just prose here.";

		expect(groupBody(body)).toEqual(
			filterTranslatableSegments(extractTranslatableBodySegments(body).segments, true),
		);
	});

	test.each([
		["JSX text elements", "Pass <CodeStep step={1}>the `node`</CodeStep> first."],
		["MDX expressions inside prose", "Before {value} after `code` here."],
		["bare URLs", "See https://react.dev and `code` here."],
		["tag-like source text", "Write `x` as \\<c0> in prose."],
	])("does not group paragraphs with %s", (_name, body) => {
		expect(groupBody(body).some(isInlineGroupSegment)).toBe(false);
	});

	test("does not group code without prose", () => {
		expect(groupBody("### `lazy(load)` {/*lazy*/}").some(isInlineGroupSegment)).toBe(false);
	});

	test.each([
		["Children", childrenMd],
		["hydrateRoot", hydrateRootMd],
		["invalid-hook-call-warning", invalidHookCallMd],
		["lazy", lazyMd],
		["react-19", react19Md],
		["use-client", useClientMd],
	])("%s is byte-stable when every group echoes its source", (_name, source) => {
		const body = source.replace(/\r\n/g, "\n").replace(/^---\n[\s\S]*?\n---\n/, "");
		const groups = groupBody(body).filter(isInlineGroupSegment);
		const echoed = Object.fromEntries(
			groups.map((group) => [group.id, restoreInlineGroup(group.sourceText, group) ?? "REJECTED"]),
		);

		expect(groups.length).toBeGreaterThan(5);
		expect(reinsertSegments(body, echoed, groups)).toBe(body);
	});

	test("groups never overlap the segments left ungrouped", () => {
		const segments = [...groupBody(childrenMd)].sort((left, right) => left.start - right.start);
		const overlaps = segments.filter((segment, index) => {
			const next = segments[index + 1];
			return next !== undefined && next.start < segment.end;
		});

		expect(overlaps).toEqual([]);
	});
});

describe("restoreInlineGroup", () => {
	const codeGroup = onlyGroup("After a conditional `return` statement.");
	const linkGroup = onlyGroup("The [`children` prop](/learn/props) received here.");

	test("lets the model move code across words", () => {
		expect(restoreInlineGroup("Após uma instrução <c0>return</c0> condicional.", codeGroup)).toBe(
			"Após uma instrução `return` condicional.",
		);
	});

	test("restores link targets and nested code", () => {
		expect(restoreInlineGroup("A <s0>prop <c1>children</c1></s0> recebida aqui.", linkGroup)).toBe(
			"A [prop `children`](/learn/props) recebida aqui.",
		);
	});

	test("restores original code when the model translates it", () => {
		expect(restoreInlineGroup("Instrução <c0>retornar</c0> condicional.", codeGroup)).toBe(
			"Instrução `return` condicional.",
		);
	});

	test("rejects a translation that joins or adds source lines", () => {
		const group = onlyGroup("Call `a` first.\nCall `b` second.");

		expect(
			restoreInlineGroup("Chame <c0>a</c0> antes. Chame <c1>b</c1> depois.", group),
		).toBeNull();
		expect(
			restoreInlineGroup("Chame <c0>a</c0>\nantes.\nChame <c1>b</c1> depois.", group),
		).toBeNull();
		expect(restoreInlineGroup("Chame <c0>a</c0> antes.\nChame <c1>b</c1> depois.", group)).toBe(
			"Chame `a` antes.\nChame `b` depois.",
		);
	});

	test("restores code containing replacement patterns and markup verbatim", () => {
		const group = onlyGroup("Render `<App $& />` in the root.");

		expect(restoreInlineGroup(group.sourceText, group)).toBe("Render `<App $& />` in the root.");
	});

	test.each([
		["a missing tag", "Após uma instrução condicional."],
		["a repeated tag", "Instrução <c0>return</c0> e <c0>return</c0>."],
		["an unknown tag", "Instrução <c0>return</c0> <c7>x</c7>."],
		["an unclosed tag", "Instrução <c0>return condicional."],
		["a self-closing tag", "Instrução <c0/> condicional."],
		["echoed backticks", "Instrução <c0>return</c0> `return` condicional."],
		["added emphasis", "Instrução <c0>return</c0> **condicional**."],
		["an added link", "Instrução <c0>return</c0> [x](y)."],
		["text glued to a tag", "Instrução <c0>return</c0>condicional."],
	])("rejects %s", (_name, translated) => {
		expect(restoreInlineGroup(translated, codeGroup)).toBeNull();
	});

	test.each([
		["code moved out of its link", "A <c1>children</c1> <s0>prop</s0> recebida."],
		["an empty link label", "A <s0></s0> <c1>children</c1> recebida."],
		["crossed tags", "A <s0><c1>children</s0></c1> recebida."],
		["whitespace inside a link label", "A <s0> prop <c1>children</c1> </s0> recebida."],
	])("rejects %s", (_name, translated) => {
		expect(restoreInlineGroup(translated, linkGroup)).toBeNull();
	});
});
