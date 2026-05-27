import { describe, expect, test } from "bun:test";

import { collectPostTranslationValidationIssues } from "@/app/services/translator/validation/guards";

describe("post-translation validation guards", () => {
	test("collectPostTranslationValidationIssues returns multiple guard hints", () => {
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

		expect(issues.length).toBeGreaterThanOrEqual(2);
		expect(issues.some((issue) => issue.guardId === "headingsPreserved")).toBe(true);
		expect(issues.some((issue) => issue.guardId === "fenceFunctionIdentifiers")).toBe(true);
		expect(issues.every((issue) => issue.retryHint.length > 0)).toBe(true);
	});

	test("collectPostTranslationValidationIssues returns empty when output is valid", () => {
		const source = "# Title\n\nParagraph.\n";
		const translated = "# Título\n\nParágrafo.\n";

		expect(collectPostTranslationValidationIssues(source, translated)).toEqual([]);
	});
});
