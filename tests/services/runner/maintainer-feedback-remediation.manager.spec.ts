import { describe, expect, mock, test } from "bun:test";

import { MaintainerFeedbackRemediationManager } from "@/app/services/runner/workflow/maintainer-feedback-remediation.manager";

import { createTranslationFileFixture } from "@tests/fixtures";

const PR_1227_COMMENT = `\
\`\`\`diff
-## Solução de problemas {/*troubleshooting*/}
+## Solução de Problemas {/*troubleshooting*/}
\`\`\``;

describe("MaintainerFeedbackRemediationManager", () => {
	test("applies mechanical remediation without calling the translator", async () => {
		const translateContent = mock(() =>
			Promise.resolve({ content: "should not run", retries: [] }),
		);
		const manager = new MaintainerFeedbackRemediationManager({
			translateContent,
		} as never);
		const file = createTranslationFileFixture();
		const forkContent = "## Solução de problemas {/*troubleshooting*/}\n\nCorpo.";

		const result = await manager.tryRemediate(forkContent, file.content, [PR_1227_COMMENT], file);

		expect(result?.kind).toBe("mechanical");
		expect(result?.content).toContain("Solução de Problemas");
		expect(translateContent).not.toHaveBeenCalled();
	});

	test("uses section-scoped translation when mechanical fixes do not apply", async () => {
		const translateContent = mock(() =>
			Promise.resolve({
				content: "### Desativando uma animação {/*opting-out-of-an-animation*/}\nNovo.\n",
				retries: [],
			}),
		);
		const manager = new MaintainerFeedbackRemediationManager({
			translateContent,
		} as never);
		const file = createTranslationFileFixture({
			content: `\
# Doc

### Opting-out of an animation {/*opting-out-of-an-animation*/}
You can use the class "none" to opt-out.
`,
		});
		const forkContent = `\
# Doc

### Otimizando para fora de uma animação {/*opting-out-of-an-animation*/}
Você pode usar a classe "none" para otimizar para fora de uma animação.
`;
		const comment = "Corrija `{/*opting-out-of-an-animation*/}` nesta seção.";

		const result = await manager.tryRemediate(forkContent, file.content, [comment], file);

		expect(result?.kind).toBe("section");
		expect(translateContent).toHaveBeenCalled();
		expect(result?.content).toContain("Desativando uma animação");
	});
});
