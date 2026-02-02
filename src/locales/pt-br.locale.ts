import type { ProcessedFileResult } from "@/services/runner/runner.types";
import type { PullRequestDescriptionMetadata } from "@/services/runner/translation-batch.manager";
import type { TranslationFile } from "@/services/translator.service";

import type { LocaleDefinition } from "./types";

import { formatElapsedTime } from "@/utils/common.util";

/**
 * Builds the conflict notice section for PR body when a stale PR was closed.
 *
 * When an existing translation PR has merge conflicts with the upstream branch,
 * the workflow closes it and creates a fresh translation. This notice explains
 * what happened to reviewers.
 *
 * @param invalidFilePR Metadata about the closed stale PR
 *
 * @returns Markdown-formatted notice or empty string if no stale PR existed
 */
function buildConflictNotice(invalidFilePR: PullRequestDescriptionMetadata["invalidFilePR"]) {
	if (!invalidFilePR) {
		return "";
	}

	return `> [!IMPORTANT]
> **PR anterior fechado**: O PR #${invalidFilePR.prNumber} foi **fechado automaticamente** devido a conflitos de merge com a branch principal (\`mergeable_state: ${invalidFilePR.status.mergeableState}\`).
>
> Esta é uma **tradução completamente nova** baseada na versão mais atual do arquivo fonte. A abordagem de reescrita completa (ao invés de resolução de conflitos baseada em diff) garante consistência e qualidade da tradução.`;
}

/**
 * Formats the generation date from timestamp.
 *
 * @param timestamp Unix timestamp in milliseconds
 *
 * @returns ISO date string (YYYY-MM-DD) or "unknown"
 */
function formatGenerationDate(timestamp: number): string {
	const dateString = new Date(timestamp).toISOString().split("T")[0];
	return dateString ?? "unknown";
}

/**
 * Builds the pull request body template for Brazilian Portuguese locale.
 *
 * Generates a comprehensive PR description including translation metadata,
 * processing statistics, conflict notices, and technical information.
 *
 * @param file Translation file being processed
 * @param processingResult Result of processing the file
 * @param metadata Metadata about the pull request description
 *
 * @returns Formatted PR body string in markdown
 */
export function buildPullRequestBody(
	file: TranslationFile,
	processingResult: ProcessedFileResult,
	metadata: PullRequestDescriptionMetadata,
): string {
	const processingTime = metadata.timestamps.now - metadata.timestamps.workflowStart;
	const conflictNotice = buildConflictNotice(metadata.invalidFilePR);
	const generationDate = formatGenerationDate(metadata.timestamps.now);
	const branchRef = processingResult.branch?.ref ?? "unknown";

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

- **Data de Geração**: ${generationDate}
- **Branch**: \`${branchRef}\`

</details>`;
}

/**
 * Brazilian Portuguese locale definition.
 *
 * Contains all Portuguese (Brazil) specific user-facing texts
 * and LLM translation rules for the `pt-br.react.dev` documentation.
 */
export const ptBrLocale: LocaleDefinition = {
	comment: {
		prefix: "As seguintes páginas foram traduzidas e PRs foram criados:",
		suffix: `> [!IMPORTANT]
>
> As traduções foram geradas por uma LLM e requerem revisão humana para garantir precisão técnica e fluência.
> Esta implementação é um trabalho em progresso e pode apresentar inconsistências em conteúdos técnicos complexos ou formatação específica.`,
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
		title: (file: TranslationFile) =>
			`Tradução de ${file.title ? `**${file.title}**` : `\`${file.filename}\``} para Português (Brasil)`,
		body: buildPullRequestBody,
	},
};
