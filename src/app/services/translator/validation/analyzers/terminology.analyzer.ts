import type { TerminologyViolation } from "./terminology.types";

import {
	PT_BR_PROTECTED_ENGLISH_TERMS,
	PT_BR_TERMINOLOGY_CONSISTENCY_RULES,
	PT_BR_TERMINOLOGY_ENFORCEMENT_RULES,
} from "@/app/constants/pt-br-terminology.constants";

import { mergeTerminologyEnforcementRules } from "./glossary-markdown.parser";
import { stripMarkdownForTerminologyProse } from "./markdown-prose.util";

/**
 * Finds glossary and locale terminology violations in translated prose.
 *
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 * @param glossaryMarkdown Optional upstream glossary text
 *
 * @returns Violations with retry hints
 */
export function findGlossaryTerminologyViolations(
	sourceMarkdown: string,
	translatedMarkdown: string,
	glossaryMarkdown?: string | null,
) {
	const sourceProse = stripMarkdownForTerminologyProse(sourceMarkdown);
	const translatedProse = stripMarkdownForTerminologyProse(translatedMarkdown);
	const rules = mergeTerminologyEnforcementRules(
		glossaryMarkdown,
		PT_BR_TERMINOLOGY_ENFORCEMENT_RULES,
	);

	const violations: TerminologyViolation[] = [];

	for (const rule of rules) {
		if (!rule.sourcePattern.test(sourceProse)) continue;

		for (const forbidden of rule.forbiddenInTranslation) {
			if (!forbidden.test(translatedProse)) continue;

			const match = translatedProse.match(forbidden)?.[0] ?? "forbidden term";
			violations.push({
				kind: "glossary",
				message: `Forbidden terminology "${match}"`,
				glossaryHint:
					rule.preferredTranslation ?
						`${rule.glossaryHint} Prefer "${rule.preferredTranslation}".`
					:	rule.glossaryHint,
			});
			break;
		}
	}

	return violations;
}

/**
 * Flags literal translations of official React product names that must stay in English.
 *
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 *
 * @returns Violations when protected names were translated or mistranslated
 */
export function findProtectedTermViolations(sourceMarkdown: string, translatedMarkdown: string) {
	const sourceProse = stripMarkdownForTerminologyProse(sourceMarkdown);
	const translatedProse = stripMarkdownForTerminologyProse(translatedMarkdown);
	const violations: TerminologyViolation[] = [];

	for (const rule of PT_BR_PROTECTED_ENGLISH_TERMS) {
		if (!rule.sourcePattern.test(sourceProse)) continue;

		const requireEnglish = rule.requireVerbatimEnglish !== false;

		if (requireEnglish && !translatedProse.includes(rule.term)) {
			violations.push({
				kind: "protected",
				message: `Protected term "${rule.term}" must stay in English`,
				glossaryHint: `Keep "${rule.term}" in English; do not translate product or API names.`,
			});
			continue;
		}

		for (const forbidden of rule.forbiddenLiteralTranslations ?? []) {
			if (!forbidden.test(translatedProse)) continue;

			const match = translatedProse.match(forbidden)?.[0] ?? "forbidden translation";
			violations.push({
				kind: "protected",
				message: `Literal translation "${match}" for protected term "${rule.term}"`,
				glossaryHint: `Keep "${rule.term}" in English; do not use "${match}".`,
			});
			break;
		}
	}

	return violations;
}

/**
 * Detects multiple Portuguese renderings for the same repeated English anchor in one file.
 *
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 *
 * @returns Violations when chunk boundaries likely caused terminology drift
 */
export function findTerminologyConsistencyViolations(
	sourceMarkdown: string,
	translatedMarkdown: string,
) {
	const sourceProse = stripMarkdownForTerminologyProse(sourceMarkdown);
	const translatedProse = stripMarkdownForTerminologyProse(translatedMarkdown);
	const violations: TerminologyViolation[] = [];

	for (const rule of PT_BR_TERMINOLOGY_CONSISTENCY_RULES) {
		const sourceMatches = sourceProse.match(new RegExp(rule.sourcePattern, "gi")) ?? [];
		if (sourceMatches.length < 2) continue;

		const formsPresent = rule.conflictingForms.filter((form) =>
			translatedProse.toLowerCase().includes(form.toLowerCase()),
		);

		if (formsPresent.length < 2) continue;

		violations.push({
			kind: "consistency",
			message: `Inconsistent renderings for the same concept: ${formsPresent.join(" vs ")}`,
			glossaryHint: rule.glossaryHint,
		});
	}

	return violations;
}

/**
 * Builds a combined retry hint from terminology violations.
 *
 * @param violations Issues from glossary, protected-term, and consistency analyzers
 *
 * @returns Hint string for the LLM system prompt
 */
export function buildTerminologyRetryHint(violations: readonly TerminologyViolation[]) {
	const hints = [...new Set(violations.map((violation) => violation.glossaryHint))];
	return hints.slice(0, 4).join(" ");
}

/**
 * Runs all pt-br terminology analyzers.
 *
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 * @param glossaryMarkdown Optional upstream glossary
 *
 * @returns Combined violations
 */
export function findAllTerminologyViolations(
	sourceMarkdown: string,
	translatedMarkdown: string,
	glossaryMarkdown?: string | null,
) {
	return [
		...findGlossaryTerminologyViolations(sourceMarkdown, translatedMarkdown, glossaryMarkdown),
		...findProtectedTermViolations(sourceMarkdown, translatedMarkdown),
		...findTerminologyConsistencyViolations(sourceMarkdown, translatedMarkdown),
	];
}
