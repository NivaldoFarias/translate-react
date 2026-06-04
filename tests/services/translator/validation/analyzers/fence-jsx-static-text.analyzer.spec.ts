import { describe, expect, test } from "bun:test";

import {
	collectJsxStaticTextSegments,
	findFenceJsxStaticTextMismatches,
	formatFenceJsxStaticTextMismatchSummary,
} from "@/app/services/translator/validation/analyzers/fence-jsx-static-text.analyzer";

describe("collectJsxStaticTextSegments", () => {
	test("extracts static text around JSX expressions", () => {
		const code = "return <div>Count: {renderCount}</div>;";

		expect(collectJsxStaticTextSegments(code)).toEqual(["Count: "]);
	});

	test("extracts multiple static segments from one element", () => {
		const code = "return <button>Clicked: {clickCount} times</button>;";

		expect(collectJsxStaticTextSegments(code)).toEqual(["Clicked: ", " times"]);
	});

	test("returns empty for fences without JSX element text", () => {
		const code = "const value = 1;\nfunction Component() { return null; }";

		expect(collectJsxStaticTextSegments(code)).toEqual([]);
	});
});

describe("findFenceJsxStaticTextMismatches", () => {
	test("returns empty when JSX demo text is unchanged", () => {
		const source = "```js\nreturn <div>User: {userId}</div>;\n```";
		const translated = "```js\nreturn <div>User: {userId}</div>;\n```";

		expect(findFenceJsxStaticTextMismatches(source, translated)).toEqual([]);
	});

	test("detects translated JSX labels from globals-style examples", () => {
		const source = "```js\nreturn <div>Count: {renderCount}</div>;\n```";
		const translated = "```js\nreturn <div>Contagem: {renderCount}</div>;\n```";

		expect(findFenceJsxStaticTextMismatches(source, translated)).toEqual([
			{
				fenceIndex: 1,
				sourceText: "Count: ",
				translatedText: "Contagem: ",
			},
		]);
	});

	test("reports every changed segment in a multi-line button example", () => {
		const source = [
			"```js",
			"return (",
			"  <button onClick={handleClick}>",
			"    Clicked: {clickCount} times",
			"  </button>",
			");",
			"```",
		].join("\n");
		const translated = [
			"```js",
			"return (",
			"  <button onClick={handleClick}>",
			"    Clicado: {clickCount} vezes",
			"  </button>",
			");",
			"```",
		].join("\n");

		const mismatches = findFenceJsxStaticTextMismatches(source, translated);

		expect(mismatches).toEqual([
			{ fenceIndex: 1, sourceText: "Clicked: ", translatedText: "Clicado: " },
			{ fenceIndex: 1, sourceText: " times", translatedText: " vezes" },
		]);
	});

	test("flags missing translated segments when JSX text disappears", () => {
		const source = "```js\nreturn <div>Events: {events.length}</div>;\n```";
		const translated = "```js\nreturn <div>{events.length}</div>;\n```";

		expect(findFenceJsxStaticTextMismatches(source, translated)).toEqual([
			{
				fenceIndex: 1,
				sourceText: "Events: ",
				translatedText: null,
			},
		]);
	});

	test("ignores prose outside fenced blocks", () => {
		const source = "Intro\n\n```js\nreturn <div>Count: {n}</div>;\n```\n";
		const translated = "Intro traduzido\n\n```js\nreturn <div>Count: {n}</div>;\n```\n";

		expect(findFenceJsxStaticTextMismatches(source, translated)).toEqual([]);
	});

	test("returns empty when fence counts differ", () => {
		const source = "```js\nreturn <div>Count: {n}</div>;\n```";
		const translated = "Sem fence";

		expect(findFenceJsxStaticTextMismatches(source, translated)).toEqual([]);
	});
});

describe("formatFenceJsxStaticTextMismatchSummary", () => {
	test("quotes static text for readable guard messages", () => {
		const summary = formatFenceJsxStaticTextMismatchSummary([
			{ fenceIndex: 2, sourceText: "User: ", translatedText: "Usuário: " },
		]);

		expect(summary).toContain('fence 2: keep JSX text "User: "');
		expect(summary).toContain('"Usuário: "');
	});
});
