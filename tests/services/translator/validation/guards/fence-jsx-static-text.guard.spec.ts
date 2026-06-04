import { describe, expect, test } from "bun:test";

import { fenceJsxStaticTextGuard } from "@/app/services/translator/validation/guards/fence-jsx-static-text.guard";

describe("fenceJsxStaticTextGuard", () => {
	test("returns null when JSX demo text is unchanged", () => {
		const source = "```js\nreturn <div>User: {userId}</div>;\n```";
		const translated = "```js\nreturn <div>User: {userId}</div>;\n```";

		expect(fenceJsxStaticTextGuard(source, translated)).toBeNull();
	});

	test("returns issue listing every translated JSX label", () => {
		const source = [
			"```js",
			"function Component() {",
			"  return <div>Count: {renderCount}</div>;",
			"}",
			"```",
		].join("\n");
		const translated = [
			"```js",
			"function Component() {",
			"  return <div>Contagem: {renderCount}</div>;",
			"}",
			"```",
		].join("\n");

		const issue = fenceJsxStaticTextGuard(source, translated);

		expect(issue?.guardId).toBe("fenceJsxStaticText");
		expect(issue?.message).toContain("Count: ");
		expect(issue?.message).toContain("Contagem: ");
		expect(issue?.retryHint).toContain("Count: ");
	});
});
