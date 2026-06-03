import { describe, expect, test } from "bun:test";

import {
	applyMechanicalLineReplacements,
	parseMechanicalLineReplacements,
} from "@/app/services/runner/workflow/maintainer-mechanical-fix.util";

const PR_1227_COMMENT = `\
\`\`\`diff
-## Solução de problemas {/*troubleshooting*/}
+## Solução de Problemas {/*troubleshooting*/}
\`\`\``;

const PR_1238_COMMENT = `\
**Traduzido (com o bug):**
\`\`\`
### Otimizando para fora de uma animação {/*opting-out-of-an-animation*/}
Você pode usar a classe "none" para otimizar para fora de uma animação.
\`\`\`

Sugestão de correção:
\`\`\`
### Desativando uma animação {/*opting-out-of-an-animation*/}
Você pode usar a classe "none" para desativar uma animação.
\`\`\``;

describe("maintainer-mechanical-fix.util", () => {
	test("parses single-line diff hunks from maintainer comments", () => {
		const replacements = parseMechanicalLineReplacements([PR_1227_COMMENT]);

		expect(replacements).toEqual([
			{
				search: "## Solução de problemas {/*troubleshooting*/}",
				replace: "## Solução de Problemas {/*troubleshooting*/}",
			},
		]);
	});

	test("parses suggestion blocks that replace a buggy translated excerpt", () => {
		const replacements = parseMechanicalLineReplacements([PR_1238_COMMENT]);

		expect(replacements).toHaveLength(1);
		expect(replacements[0]?.search).toContain("Otimizando para fora");
		expect(replacements[0]?.replace).toContain("Desativando uma animação");
	});

	test("applies replacements only when the search string is unique", () => {
		const content = "## Solução de problemas {/*troubleshooting*/}\n\nTexto.";
		const replacements = parseMechanicalLineReplacements([PR_1227_COMMENT]);
		const result = applyMechanicalLineReplacements(content, replacements);

		expect(result.appliedCount).toBe(1);
		expect(result.content).toContain("## Solução de Problemas {/*troubleshooting*/}");
	});
});
