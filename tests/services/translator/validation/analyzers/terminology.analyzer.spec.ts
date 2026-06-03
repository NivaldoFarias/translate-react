import { describe, expect, test } from "bun:test";

import {
	findAllTerminologyViolations,
	findGlossaryTerminologyViolations,
	findProtectedTermViolations,
	findTerminologyConsistencyViolations,
} from "@/app/services/translator/validation/analyzers/terminology.analyzer";
import { glossaryTerminologyGuard } from "@/app/services/translator/validation/guards/glossary-terminology.guard";

describe("terminology.analyzer", () => {
	test("findGlossaryTerminologyViolations flags Solução de problemas heading (pt-br #1227)", () => {
		const source = `
## Troubleshooting {/*troubleshooting*/}

Fix common issues.
`;

		const translated = `
## Solução de problemas {/*troubleshooting*/}

Corrija problemas comuns.
`;

		const violations = findGlossaryTerminologyViolations(source, translated);

		expect(violations.some((violation) => violation.kind === "glossary")).toBe(true);
		expect(violations[0]?.glossaryHint).toContain("Solução de Problemas");
	});

	test("findGlossaryTerminologyViolations flags resetar when source uses reset (pt-br #1200)", () => {
		const source = `
You can reset state when the form unmounts.
`;

		const translated = `
Você pode resetar o estado quando o formulário desmonta.
`;

		const violations = findGlossaryTerminologyViolations(source, translated);

		expect(violations.some((violation) => violation.message.includes("resetar"))).toBe(true);
		expect(violations[0]?.glossaryHint).toContain("redefinir");
	});

	test("findProtectedTermViolations flags Flight translated as Voo (pt-br #1203)", () => {
		const source = `
React Flight streams UI to the client.
`;

		const translated = `
O Voo do React envia UI para o cliente.
`;

		const violations = findProtectedTermViolations(source, translated);

		expect(violations.some((violation) => violation.kind === "protected")).toBe(true);
		expect(violations[0]?.message).toContain("Voo");
	});

	test("findProtectedTermViolations flags translated React Server Components (pt-br #1194)", () => {
		const source = `
<BlogCard title="React Server Components" />
`;

		const translated = `
<BlogCard title="Componentes de Servidor React" />
`;

		const violations = findProtectedTermViolations(source, translated);

		expect(
			violations.some((violation) => violation.message.includes("React Server Components")),
		).toBe(true);
	});

	test("findTerminologyConsistencyViolations flags mixed wiring renderings (pt-br #1206)", () => {
		const source = `
## Wiring state

Later sections discuss wiring again.
`;

		const translated = `
## Lógica de estado

Mais adiante, a lógica de conexão aparece de novo.
`;

		const violations = findTerminologyConsistencyViolations(source, translated);

		expect(violations.some((violation) => violation.kind === "consistency")).toBe(true);
	});

	test("findProtectedTermViolations flags Evento de Efeito for Effect Event (pt-br #1208)", () => {
		const source = `
## Effect Event

Limitations of Effect Events.
`;

		const translated = `
## Evento de Effect

Limitações dos Eventos de Efeito.
`;

		const violations = findProtectedTermViolations(source, translated);

		expect(violations.some((violation) => violation.message.includes("Efeito"))).toBe(true);
	});

	test("findTerminologyConsistencyViolations flags Effect Event vs Evento de Efeito (pt-br #1208)", () => {
		const source = `
## Effect Event

Limitations of Effect Events.
`;

		const translated = `
## Evento de Effect

Limitações dos Eventos de Efeito.
`;

		const violations = findTerminologyConsistencyViolations(source, translated);

		expect(violations.length).toBeGreaterThan(0);
	});

	test("glossaryTerminologyGuard returns retry hint for opt-out mistranslation (pt-br #1238)", () => {
		const source = `
### Opting-out of View Transitions
`;

		const translated = `
### Otimizar para fora das View Transitions
`;

		const issue = glossaryTerminologyGuard(source, translated);

		expect(issue?.guardId).toBe("glossaryTerminology");
		expect(issue?.retryHint).toContain("desativar");
	});

	test("findAllTerminologyViolations passes when glossary terms are applied consistently", () => {
		const source = `
## Troubleshooting

Reset the form.
`;

		const translated = `
## Solução de Problemas

Redefina o formulário.
`;

		expect(findAllTerminologyViolations(source, translated)).toEqual([]);
	});
});
