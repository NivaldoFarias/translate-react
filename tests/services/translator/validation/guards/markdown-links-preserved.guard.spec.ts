import { describe, expect, test } from "bun:test";

import { markdownLinksPreservedGuard } from "@/app/services/translator/validation/guards/markdown-links-preserved.guard";

describe("markdownLinksPreservedGuard", () => {
	test("returns null when link labels change but URLs stay in markdown links", () => {
		const source = "Read [the React docs](/learn) for more.\n";
		const translated = "Leia [a documentação do React](/learn) para saber mais.\n";

		expect(markdownLinksPreservedGuard(source, translated)).toBeNull();
	});

	test("surfaces broken bracket escaping in message and retry hint", () => {
		const source = "See [`errorInfo.componentStack`](/learn/owner-stack) for stack details.\n";
		const translated =
			"Veja \\`errorInfo.componentStack\\`](/learn/owner-stack) para detalhes da pilha.\n";

		const issue = markdownLinksPreservedGuard(source, translated);

		expect(issue?.guardId).toBe("markdownLinksPreserved");
		expect(issue?.message).toContain("Markdown links:");
		expect(issue?.retryHint).toContain("Problems found:");
		expect(issue?.retryHint).toContain("markdown link");
	});

	test("surfaces bare URL regression for absolute links", () => {
		const source = "Use [react.dev](https://react.dev/warnings/react-dom-test-utils) here.";
		const translated = "Use https://react.dev/warnings/react-dom-test-utils here.";

		const issue = markdownLinksPreservedGuard(source, translated);

		expect(issue).not.toBeNull();
		expect(issue?.message).toContain("react-dom-test-utils");
		expect(issue?.retryHint).toContain("react-dom-test-utils");
	});

	test("message and retry hint list every reported violation", () => {
		const source = "[one](/a) [two](/b) [three](/c)";
		const translated = "/a /b /c";

		const issue = markdownLinksPreservedGuard(source, translated);

		expect(issue).not.toBeNull();
		expect(issue?.message.split(";").length).toBeGreaterThanOrEqual(2);
		expect(issue?.retryHint).toContain("/a");
		expect(issue?.retryHint).toContain("/b");
	});
});
