/** Matches a duplicated Russian lead-in before a comma after `'use client'` */
const DUPLICATED_RUSSIAN_USE_CLIENT_LEAD_IN = /(С помощью\s+`'use client'`)\s+С помощью\s*,/g;

/**
 * Matches a corrupted duplicated clause after a partial `_output_` emphasis repair failure.
 *
 * ```
 * , _ , а не его исходный код), будет отправлен ...
 * ```
 */
const CORRUPTED_OUTPUT_CLAUSE_DUPLICATE =
	/, _ , а не его исходный код\), будет отправлен в браузер при обращении из серверного компонента\. Как показано в предыдущем примере приложения Inspirations,/g;

/**
 * Matches a component reference followed by a dropped `_output_` emphasis marker.
 *
 * ```
 * `FancyText` вывод _ (а не
 * ```
 */
const DROPPED_OUTPUT_EMPHASIS_AFTER_COMPONENT = /(`\w+`)\s+вывод\s+_\s+\(/g;

/**
 * Collapses duplicated Russian `С помощью` lead-ins before a comma after `'use client'`.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with duplicated Russian lead-ins removed
 */
export function collapseDuplicatedRuUseClientLeadIn(content: string) {
	return content.replace(DUPLICATED_RUSSIAN_USE_CLIENT_LEAD_IN, "$1,");
}

/**
 * Repairs common Russian `_output_` emphasis corruption and removes duplicated trailing clauses.
 *
 * @param content Assembled translated markdown
 *
 * @returns Content with restored `HTML- _вывод_` emphasis and no duplicated output clause
 */
export function repairCorruptedRuOutputEmphasis(content: string) {
	return content
		.replace(DROPPED_OUTPUT_EMPHASIS_AFTER_COMPONENT, "$1 HTML- _вывод_ (")
		.replace(CORRUPTED_OUTPUT_CLAUSE_DUPLICATE, ",");
}

/**
 * Applies Russian locale mechanical repairs validated on production translation feedback.
 *
 * @param content Assembled translated markdown
 *
 * @returns Document with Russian-specific LLM glitch patterns repaired
 */
export function applyRuLocaleMechanicalRepairs(content: string) {
	let cleaned = collapseDuplicatedRuUseClientLeadIn(content);
	cleaned = repairCorruptedRuOutputEmphasis(cleaned);

	return cleaned;
}
