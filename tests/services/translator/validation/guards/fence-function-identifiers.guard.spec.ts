import { describe, expect, test } from "bun:test";

import { fenceFunctionIdentifiersGuard } from "@/app/services/translator/validation/guards/fence-function-identifiers.guard";

describe("fenceFunctionIdentifiersGuard", () => {
	test("returns null when fenced function names are unchanged", () => {
		const source = "```js\nfunction useState() {}\n```";
		const translated = "```js\nfunction useState() {}\n```";

		expect(fenceFunctionIdentifiersGuard(source, translated)).toBeNull();
	});

	test("returns issue with every renamed identifier in message and retry hint", () => {
		const source = "```js\nfunction Alpha() {}\nfunction Beta() {}\n```";
		const translated = "```js\nfunction Alfa() {}\nfunction BeTa() {}\n```";

		const issue = fenceFunctionIdentifiersGuard(source, translated);

		expect(issue?.guardId).toBe("fenceFunctionIdentifiers");
		expect(issue?.message).toContain("Alpha");
		expect(issue?.message).toContain("Beta");
		expect(issue?.retryHint).toContain("Alpha");
		expect(issue?.retryHint).toContain("Beta");
		expect(issue?.message).toContain("fence 1:");
	});

	test.each([
		[
			"line",
			"// NEW: return a cleanup function to reset",
			"// NOVO: retorne uma função de limpeza",
		],
		["block", "/* call the function to reset */", "/* chame a função */"],
	])("ignores the word `function` in %s comments", (_name, sourceComment, translatedComment) => {
		const source = `\`\`\`js\n${sourceComment}\nfunction useState() {}\n\`\`\``;
		const translated = `\`\`\`js\n${translatedComment}\nfunction useState() {}\n\`\`\``;

		expect(fenceFunctionIdentifiersGuard(source, translated)).toBeNull();
	});

	test("still reports a renamed function next to a comment that keeps the old name", () => {
		const source = "```js\n// function Alpha\nfunction Alpha() {}\n```";
		const translated = "```js\n// function Alpha\nfunction Alfa() {}\n```";

		expect(fenceFunctionIdentifiersGuard(source, translated)?.message).toContain("Alpha");
	});

	test("lists mismatches from multiple fences", () => {
		const source = ["```js\nfunction One() {}\n```", "```js\nfunction Two() {}\n```"].join("\n");
		const translated = ["```js\nfunction Um() {}\n```", "```js\nfunction Two() {}\n```"].join("\n");

		const issue = fenceFunctionIdentifiersGuard(source, translated);

		expect(issue?.message).toContain("One");
		expect(issue?.message).toContain("fence 1:");
		expect(issue?.message).not.toContain("Two");
	});
});
