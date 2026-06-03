import { describe, expect, test } from "bun:test";

import { markdownLinksPreservedGuard } from "@/app/services/translator/validation/guards/markdown-links-preserved.guard";

describe("markdownLinksPreservedGuard", () => {
	test("returns retryable issue when a markdown link was broken (pt-br #1241 pattern)", () => {
		const source = "See [`errorInfo.componentStack`](/learn/owner-stack) for stack details.\n";
		const translated =
			"Veja \\`errorInfo.componentStack\\`](/learn/owner-stack) para detalhes da pilha.\n";

		const issue = markdownLinksPreservedGuard(source, translated);

		expect(issue).not.toBeNull();
		expect(issue?.guardId).toBe("markdownLinksPreserved");
		expect(issue?.retryHint).toContain("markdown link");
	});

	test("returns null when links are preserved with translated labels", () => {
		const source = "Read [the React docs](/learn) for more.\n";
		const translated = "Leia [a documentação do React](/learn) para saber mais.\n";

		expect(markdownLinksPreservedGuard(source, translated)).toBeNull();
	});
});
