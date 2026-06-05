import { describe, expect, test } from "bun:test";

import {
	buildFenceFunctionIdentifierRetryHint,
	collectFunctionDeclarationNames,
	extractFencedCodeBlockBodies,
	findFenceFunctionIdentifierMismatches,
	formatFenceFunctionMismatchSummary,
} from "@/app/services/translator/validation/analyzers/fence-code-identifier.analyzer";

describe("collectFunctionDeclarationNames", () => {
	test("returns unique function names in first-seen order", () => {
		const code = `
function Alpha() {}
function Beta() {}
function Alpha() {}
`;

		expect(collectFunctionDeclarationNames(code)).toEqual(["Alpha", "Beta"]);
	});

	test("ignores arrow functions and class declarations", () => {
		const code = `
const handler = () => {};
class Widget {}
function RealHook() {}
`;

		expect(collectFunctionDeclarationNames(code)).toEqual(["RealHook"]);
	});

	test("collects dollar-prefixed identifiers", () => {
		const code = "function $useCustomHook() {}";

		expect(collectFunctionDeclarationNames(code)).toEqual(["$useCustomHook"]);
	});
});

describe("extractFencedCodeBlockBodies", () => {
	test("returns inner content per fence in document order", () => {
		const markdown = `
\`\`\`js
function One() {}
\`\`\`

Text

\`\`\`ts
function Two() {}
\`\`\`
`;

		const bodies = extractFencedCodeBlockBodies(markdown);

		expect(bodies).toHaveLength(2);
		expect(bodies[0]).toContain("function One");
		expect(bodies[1]).toContain("function Two");
	});
});

describe("findFenceFunctionIdentifierMismatches", () => {
	test("detects a single renamed function in one fence", () => {
		const source = "```js\nfunction OptimizedList() {}\n```";
		const translated = "```js\nfunction ListaOtimizada() {}\n```";

		expect(findFenceFunctionIdentifierMismatches(source, translated)).toEqual([
			{ fenceIndex: 1, sourceName: "OptimizedList" },
		]);
	});

	test("detects multiple renamed functions in the same fence", () => {
		const source = "```js\nfunction Alpha() {}\nfunction Beta() {}\n```";
		const translated = "```js\nfunction Alfa() {}\nfunction BeTa() {}\n```";

		expect(findFenceFunctionIdentifierMismatches(source, translated)).toEqual([
			{ fenceIndex: 1, sourceName: "Alpha" },
			{ fenceIndex: 1, sourceName: "Beta" },
		]);
	});

	test("reports mismatches per fence index when only the second fence changes", () => {
		const source = ["```js\nfunction KeepMe() {}\n```", "```js\nfunction ChangeMe() {}\n```"].join(
			"\n",
		);
		const translated = [
			"```js\nfunction KeepMe() {}\n```",
			"```js\nfunction Alterado() {}\n```",
		].join("\n");

		expect(findFenceFunctionIdentifierMismatches(source, translated)).toEqual([
			{ fenceIndex: 2, sourceName: "ChangeMe" },
		]);
	});

	test("returns empty when every declared function name is preserved", () => {
		const source = "```js\nfunction ProductCard({ product }) {}\n```";
		const translated = "```js\nfunction ProductCard({ product }) {}\n```";

		expect(findFenceFunctionIdentifierMismatches(source, translated)).toEqual([]);
	});

	test("returns empty when fence counts differ (handled by other guards)", () => {
		const source = "```js\nfunction Only() {}\n```";
		const translated = "```js\nfunction Only() {}\n```\n```js\nfunction Extra() {}\n```";

		expect(findFenceFunctionIdentifierMismatches(source, translated)).toEqual([]);
	});

	test("detects intentional bad names used in eslint lint docs", () => {
		const source = "```js\nfunction creating() {}\nfunction reference() {}\n```";
		const translated = "```js\nfunction criando() {}\nfunction referencia() {}\n```";

		const mismatches = findFenceFunctionIdentifierMismatches(source, translated);

		expect(mismatches.map((m) => m.sourceName)).toEqual(["creating", "reference"]);
	});
});

describe("formatFenceFunctionMismatchSummary and buildFenceFunctionIdentifierRetryHint", () => {
	test("include every mismatch in summary and retry hint", () => {
		const mismatches = Array.from({ length: 8 }, (_, index) => ({
			fenceIndex: 1,
			sourceName: `Fn${index}`,
		}));

		const summary = formatFenceFunctionMismatchSummary(mismatches);
		const hint = buildFenceFunctionIdentifierRetryHint(mismatches);

		for (const { sourceName } of mismatches) {
			expect(summary).toContain(sourceName);
			expect(hint).toContain(sourceName);
		}

		expect(summary.split(";")).toHaveLength(8);
	});
});
