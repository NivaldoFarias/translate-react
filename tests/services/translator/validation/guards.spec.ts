import { describe, expect, test } from "bun:test";

import { collectPostTranslationValidationIssues } from "@/app/services/translator/validation/guards";
import { POST_TRANSLATION_VALIDATION_GUARDS } from "@/app/services/translator/validation/guards/index";

describe("POST_TRANSLATION_VALIDATION_GUARDS", () => {
	test("registers every guard in a stable order", () => {
		expect(POST_TRANSLATION_VALIDATION_GUARDS.map((guard) => guard.name)).toEqual([
			"nonEmptyContentGuard",
			"contentRatioGuard",
			"headingsPreservedGuard",
			"markdownLinksPreservedGuard",
			"frontmatterPreservedGuard",
			"fenceFunctionIdentifiersGuard",
			"fenceJsxStaticTextGuard",
		]);
	});
});

describe("collectPostTranslationValidationIssues", () => {
	test("returns empty when translation passes all guards", () => {
		const source = "# Title\n\nParagraph with [a link](/learn).\n";
		const translated = "# Título\n\nParágrafo com [um link](/learn).\n";

		expect(collectPostTranslationValidationIssues(source, translated)).toEqual([]);
	});

	test("always includes nonEmptyContent when output is blank and may add ratio or heading issues", () => {
		const issues = collectPostTranslationValidationIssues("# Title\n\nBody", "   \n");

		expect(issues.some((issue) => issue.guardId === "nonEmptyContent")).toBe(true);
		expect(issues.some((issue) => issue.guardId === "contentRatio")).toBe(true);
		expect(issues.some((issue) => issue.guardId === "headingsPreserved")).toBe(true);
	});

	test("returns contentRatio and markdownLinksPreserved together when both fail", () => {
		const source = "x".repeat(200) + " [docs](/learn) [more](/api)";
		const translated = "y".repeat(80) + " /learn";

		const issues = collectPostTranslationValidationIssues(source, translated);

		expect(issues.some((issue) => issue.guardId === "contentRatio")).toBe(true);
		expect(issues.some((issue) => issue.guardId === "markdownLinksPreserved")).toBe(true);
	});

	test("returns headingsPreserved and fenceFunctionIdentifiers for independent failures", () => {
		const source = `---
title: Example
---

# Title

\`\`\`js
function OptimizedList() {}
\`\`\`
`;

		const translated = `Just prose without headings.

\`\`\`js
function ListaOtimizada() {}
\`\`\`
`;

		const issues = collectPostTranslationValidationIssues(source, translated);

		expect(issues.some((issue) => issue.guardId === "headingsPreserved")).toBe(true);
		expect(issues.some((issue) => issue.guardId === "fenceFunctionIdentifiers")).toBe(true);
	});

	test("returns frontmatterPreserved when YAML block disappears", () => {
		const source = `---
title: Example
---

# Title
`;
		const translated = "# Título\n";

		const issues = collectPostTranslationValidationIssues(source, translated);

		expect(issues.some((issue) => issue.guardId === "frontmatterPreserved")).toBe(true);
	});

	test("every issue includes a non-empty retryHint", () => {
		const source = "# Title\n\n## Section\n\n```js\nfunction Foo() {}\n```";
		const translated = "Plain text\n\n```js\nfunction Bar() {}\n```";

		const issues = collectPostTranslationValidationIssues(source, translated);

		expect(issues.length).toBeGreaterThan(0);
		expect(issues.every((issue) => issue.retryHint.trim().length > 0)).toBe(true);
	});
});
