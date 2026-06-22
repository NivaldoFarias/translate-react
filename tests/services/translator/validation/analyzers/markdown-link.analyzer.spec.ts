import { describe, expect, test } from "bun:test";

import {
	buildMarkdownLinkRetryHint,
	extractMarkdownLinkSpans,
	findMarkdownLinkViolations,
	formatMarkdownLinkViolationSummary,
} from "@/app/services/translator/validation/analyzers/markdown-link.analyzer";

describe("extractMarkdownLinkSpans", () => {
	test("parses relative path links", () => {
		const spans = extractMarkdownLinkSpans("[label](/path)");

		expect(spans).toHaveLength(1);
		expect(spans[0]).toMatchObject({ text: "label", url: "/path" });
	});

	test("parses absolute https links", () => {
		const spans = extractMarkdownLinkSpans(
			"[Testing Library](https://testing-library.com/docs/react-native-testing-library/intro)",
		);

		expect(spans[0]?.url).toBe(
			"https://testing-library.com/docs/react-native-testing-library/intro",
		);
	});

	test("parses links with optional title in parentheses", () => {
		const spans = extractMarkdownLinkSpans('[docs](/learn "React docs")');

		expect(spans[0]?.url).toBe("/learn");
	});

	test("records start and end indices for each span", () => {
		const markdown = "See [a](/a) and [b](/b).";
		const spans = extractMarkdownLinkSpans(markdown);

		expect(spans).toHaveLength(2);
		expect(spans[0]?.start).toBe(4);
		expect(spans[1]?.start).toBeGreaterThan(spans[0]?.end ?? 0);
	});
});

describe("findMarkdownLinkViolations", () => {
	test("returns empty when the source has no markdown links", () => {
		expect(findMarkdownLinkViolations("Plain paragraph.", "Parágrafo simples.")).toEqual([]);
	});

	test("returns empty when labels are translated but URLs are preserved", () => {
		const source = "Read [the React docs](/learn) for more.\n";
		const translated = "Leia [a documentação do React](/learn) para saber mais.\n";

		expect(findMarkdownLinkViolations(source, translated)).toEqual([]);
	});

	test("flags overall link count regression", () => {
		const source = "[one](/a) [two](/b)";
		const translated = "[um](/a)";

		const violations = findMarkdownLinkViolations(source, translated);

		expect(
			violations.some((violation) => violation.message.includes("Markdown link count dropped")),
		).toBe(true);
	});

	test("flags a missing occurrence when the same URL appeared twice in the source", () => {
		const source = "[first](/learn) and [second](/learn)";
		const translated = "[primeiro](/learn)";

		const violations = findMarkdownLinkViolations(source, translated);

		expect(
			violations.some((violation) =>
				violation.message.includes('Missing markdown link for URL "/learn"'),
			),
		).toBe(true);
	});

	test("flags broken closing when backticks break the opening bracket (pt-br #1241 pattern)", () => {
		const source = "See [`errorInfo.componentStack`](/learn/owner-stack) for details.\n";
		const translated = "Veja \\`errorInfo.componentStack\\`](/learn/owner-stack) para detalhes.\n";

		const violations = findMarkdownLinkViolations(source, translated);

		expect(violations.length).toBeGreaterThan(0);
		expect(violations.some((violation) => violation.url === "/learn/owner-stack")).toBe(true);
	});

	test("flags bare URL occurrences outside parsed link spans", () => {
		const source = "Visit [ESM](https://esm.sh/) today.";
		const translated = "Visite https://esm.sh/ hoje.";

		const violations = findMarkdownLinkViolations(source, translated);

		expect(
			violations.some((violation) =>
				violation.message.includes('URL "https://esm.sh/" appears outside a markdown link'),
			),
		).toBe(true);
	});

	test("deduplicates identical violation messages", () => {
		const source = "[docs](/learn)";
		const translated = "\\`docs\\`](/learn)";

		const violations = findMarkdownLinkViolations(source, translated);
		const messages = violations.map((violation) => violation.message);

		expect(new Set(messages).size).toBe(messages.length);
	});

	test("can report several distinct problems in one document", () => {
		const source = [
			"[one](https://a.example/one)",
			"[two](https://b.example/two)",
			"[three](https://c.example/three)",
		].join(" ");
		const translated = [
			"https://a.example/one",
			"https://b.example/two",
			"only plain text for three",
		].join(" ");

		const violations = findMarkdownLinkViolations(source, translated);

		expect(violations.length).toBeGreaterThanOrEqual(2);
		expect(violations.some((violation) => violation.url === "https://a.example/one")).toBe(true);
		expect(violations.some((violation) => violation.url === "https://b.example/two")).toBe(true);
	});
});

describe("formatMarkdownLinkViolationSummary and buildMarkdownLinkRetryHint", () => {
	test("include every violation message without truncation", () => {
		const source = [
			"[one](https://a.example/one)",
			"[two](https://b.example/two)",
			"[three](https://c.example/three)",
			"[four](https://d.example/four)",
			"[five](https://e.example/five)",
		].join(" ");
		const translated = [
			"https://a.example/one",
			"https://b.example/two",
			"https://c.example/three",
			"https://d.example/four",
			"https://e.example/five",
		].join(" ");

		const violations = findMarkdownLinkViolations(source, translated);
		const summary = formatMarkdownLinkViolationSummary(violations);
		const hint = buildMarkdownLinkRetryHint(violations);

		expect(violations.length).toBeGreaterThanOrEqual(5);

		for (const violation of violations) {
			expect(summary).toContain(violation.message);
			expect(hint).toContain(violation.message);
		}
	});

	test("retry hint always includes preservation instructions", () => {
		const hint = buildMarkdownLinkRetryHint([
			{ message: 'URL "/x" appears outside a markdown link', url: "/x", startLine: 1, endLine: 1 },
		]);

		expect(hint).toContain("[translated label](same-url)");
		expect(hint).toContain("Problems found:");
	});
});
