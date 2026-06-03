import { describe, expect, test } from "bun:test";

import { ptBrHeadingSentenceCaseGuard } from "@/app/services/translator/validation/guards/pt-br-heading-sentence-case.guard";

describe("ptBrHeadingSentenceCaseGuard", () => {
	test("flags Title Case headings from maintainer review (pt-br #1189 pattern)", () => {
		const translated = "## Novos Recursos do React\n\nParágrafo.\n";

		const issue = ptBrHeadingSentenceCaseGuard("", translated);

		expect(issue).not.toBeNull();
		expect(issue?.guardId).toBe("ptBrHeadingSentenceCase");
		expect(issue?.message).toContain("Recursos");
		expect(issue?.retryHint).toContain("sentence case");
	});

	test("flags trailing words like Hoje (pt-br #1188 pattern)", () => {
		const translated = "## Use o React Compiler Hoje\n\nConteúdo.\n";

		const issue = ptBrHeadingSentenceCaseGuard("", translated);

		expect(issue).not.toBeNull();
		expect(issue?.message).toContain("Hoje");
	});

	test("returns null for sentence-case headings", () => {
		const translated = "## Novos recursos do React\n\nTexto.\n";

		expect(ptBrHeadingSentenceCaseGuard("", translated)).toBeNull();
	});
});
