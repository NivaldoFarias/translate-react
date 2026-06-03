import { describe, expect, test } from "bun:test";

import { parseGlossaryMarkdownEnforcementRules } from "@/app/services/translator/validation/analyzers/glossary-markdown.parser";

describe("glossary-markdown.parser", () => {
	test("parseGlossaryMarkdownEnforcementRules reads translation table rows", () => {
		const glossary = `
## Traduções Comuns

| Palavra/Termo original | Sugestão |
| ---------------------- | -------- |
| troubleshooting        | solução de problemas |
| render                 | renderizar (verb), renderizado (noun) |
`;

		const rules = parseGlossaryMarkdownEnforcementRules(glossary);

		expect(rules.some((rule) => rule.glossaryHint.includes("troubleshooting"))).toBe(true);
		expect(rules.some((rule) => rule.glossaryHint.includes("renderizar"))).toBe(true);
	});
});
