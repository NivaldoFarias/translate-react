import type { ProcessedFileResult } from "@/services/runner/runner.types";
import type { PullRequestDescriptionMetadata } from "@/services/runner/translation-batch.manager";
import type { TranslationFile } from "@/services/translator.service";

import type { LocaleDefinition } from "./types";

import { formatElapsedTime } from "@/utils/common.util";

/**
 * Brazilian Portuguese locale definition.
 *
 * Contains all Portuguese (Brazil) specific user-facing texts
 * and LLM translation rules for the `pt-br.react.dev` documentation.
 */
export const ptBrLocale: LocaleDefinition = {
	comment: {
		prefix: "As seguintes páginas foram traduzidas e PRs foram criados:",
		suffix: `###### Observações

- As traduções foram geradas por uma LLM e requerem revisão humana para garantir precisão técnica e fluência.
- Alguns arquivos podem ter PRs de tradução existentes em análise. Verifiquei duplicações, mas recomendo conferir.
- Esta implementação é um trabalho em progresso e pode apresentar inconsistências em conteúdos técnicos complexos ou formatação específica.`,
	},
	rules: {
		specific: `
# PORTUGUESE (BRAZIL) SPECIFIC RULES
- ALWAYS translate 'deprecated' and related terms (deprecation, deprecating, deprecates) to 'descontinuado(a)', 'descontinuada', 'obsoleto(a)' or 'obsoleta' in ALL contexts (documentation text, comments, headings, lists, etc.)
	- Exception: Do NOT translate 'deprecated' in HTML comment IDs like {/*deprecated-something*/} - keep these exactly as-is
	- Exception: Do NOT translate 'deprecated' in URLs, anchor links, or code variable names
- When a MDN document is referenced, update the language slug to the Brazilian Portuguese version ('https://developer.mozilla.org/<slug>/*' => 'https://developer.mozilla.org/pt-BR/*')`,
	},
	pullRequest: {
		title: (file: TranslationFile) => `Tradução de \`${file.filename}\` para Português (Brasil)`,
		body: (
			file: TranslationFile,
			processingResult: ProcessedFileResult,
			metadata: PullRequestDescriptionMetadata,
		) => {
			const processingTime = metadata.timestamps.now - metadata.timestamps.workflowStart;
			const conflictNotice =
				metadata.invalidFilePR ?
					`
> [!WARNING]
> **PR existente detectado**: Este arquivo já possui um PR aberto (#${metadata.invalidFilePR.prNumber}) com conflitos de merge ou status não mesclável (\`${metadata.invalidFilePR.status.mergeableState}\`).
>
> Este novo PR foi criado automaticamente com uma tradução atualizada. A decisão sobre qual PR mesclar deve ser feita pelos mantenedores do repositório com base na qualidade da tradução e nos requisitos técnicos.

`
				:	"";

			return `Este PR contém uma tradução automatizada da página referenciada para **${metadata.languageName}**.
${conflictNotice}

> [!IMPORTANT]
> Esta tradução foi gerada usando LLMs e **requer revisão humana** para garantir precisão, contexto cultural e terminologia técnica.

<details>
<summary>Detalhes</summary>

### Estatísticas de Processamento

| Métrica | Valor |
|--------|-------|
| **Tamanho do Arquivo Fonte** | ${metadata.content.source} |
| **Tamanho da Tradução** | ${metadata.content.translation} |
| **Razão de Conteúdo** | ${metadata.content.compressionRatio}x |
| **Caminho do Arquivo** | \`${file.path}\` |
| **Tempo de Processamento** | ~${formatElapsedTime(processingTime, "pt-BR")} |

> [!NOTE] 
> - "Razão de Conteúdo" indica como o comprimento da tradução se compara à fonte (~1.0x: mesmo comprimento, >1.0x: tradução é mais longa). Diferentes idiomas naturalmente têm níveis variados de verbosidade. 
> - "Tempo de Processamento" baseia-se no cálculo do tempo total desde o início do fluxo até a conclusão da tradução deste arquivo específico.

### Informações Técnicas

- **Data de Geração**: ${new Date(metadata.timestamps.now).toISOString().split("T")[0] ?? "unknown"}
- **Branch**: \`${processingResult.branch?.ref ?? "unknown"}\`

</details>`;
		},
	},
};
