import type { TerminologyEnforcementRule } from "./terminology.types";

const GLOSSARY_TABLE_ROW = new RegExp(/^\|\s*(?<english>[^|]+?)\s*\|\s*(?<portuguese>[^|]+?)\s*\|/);

const GLOSSARY_TABLE_SEPARATOR = new RegExp(/^\|\s*[-:| ]+\s*\|/);

/**
 * Parses markdown glossary tables into enforcement rules for forbidden alternate renderings.
 *
 * @param glossaryMarkdown Raw `GLOSSARY.md` or equivalent guidelines text
 *
 * @returns Rules derived from `| English | Portuguese |` rows
 */
export function parseGlossaryMarkdownEnforcementRules(glossaryMarkdown: string) {
	const rules: TerminologyEnforcementRule[] = [];

	for (const line of glossaryMarkdown.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("|") || GLOSSARY_TABLE_SEPARATOR.test(trimmed)) continue;

		const match = GLOSSARY_TABLE_ROW.exec(trimmed);
		if (!match?.groups) continue;

		const english = match.groups["english"]?.trim() ?? "";
		const portuguese = match.groups["portuguese"]?.trim() ?? "";
		if (!english || !portuguese || /^palavra|termo|original|sugestão/i.test(english)) {
			continue;
		}

		const primaryPortuguese = portuguese.split(/[,(]/)[0]?.trim() ?? portuguese;
		if (primaryPortuguese.length < 2) continue;

		const englishPattern = buildEnglishGlossaryPattern(english);

		rules.push({
			sourcePattern: englishPattern,
			forbiddenInTranslation: [],
			preferredTranslation: primaryPortuguese,
			glossaryHint: `Glossary: "${english}" → "${primaryPortuguese}".`,
		});

		const alternatePortuguese = extractAlternatePortugueseForms(portuguese, primaryPortuguese);
		if (alternatePortuguese.length === 0) continue;

		const rule = rules.at(-1);
		if (!rule) continue;

		rules[rules.length - 1] = {
			...rule,
			forbiddenInTranslation: alternatePortuguese.map(
				(form) => new RegExp(`\\b${escapeRegExpLiteral(form)}\\b`, "i"),
			),
		};
	}

	return rules;
}

/**
 * Merges parsed glossary rules with static pt-br rules, deduplicating by English anchor text.
 *
 * @param glossaryMarkdown Upstream glossary file contents
 * @param staticRules Locale-specific enforcement rules
 *
 * @returns Combined rule list (static rules win on duplicate English keys)
 */
export function mergeTerminologyEnforcementRules(
	glossaryMarkdown: string | null | undefined,
	staticRules: readonly TerminologyEnforcementRule[],
) {
	const parsed = glossaryMarkdown ? parseGlossaryMarkdownEnforcementRules(glossaryMarkdown) : [];
	const byEnglishKey = new Map<string, TerminologyEnforcementRule>();

	for (const rule of parsed) {
		byEnglishKey.set(rule.glossaryHint, rule);
	}

	for (const rule of staticRules) {
		byEnglishKey.set(rule.glossaryHint, rule);
	}

	return [...byEnglishKey.values()];
}

/**
 * Builds a word-boundary RegExp for an English glossary row label
 *
 * @param english English glossary row label
 *
 * @returns RegExp pattern for the English glossary row label
 */
function buildEnglishGlossaryPattern(english: string) {
	const normalized = english.trim();
	return new RegExp(`\\b${escapeRegExpLiteral(normalized)}\\b`, "i");
}

/**
 * Pulls alternate Portuguese forms from parenthetical glossary hints
 *
 * @param portugueseCell Parenthetical glossary hints
 * @param primary Primary Portuguese form
 *
 * @returns Alternate Portuguese forms
 */
function extractAlternatePortugueseForms(portugueseCell: string, primary: string) {
	const parentheticalPattern = new RegExp(/\(([^)]+)\)/);
	const parenthetical = parentheticalPattern.exec(portugueseCell)?.[1];
	if (!parenthetical) return [];

	return parenthetical
		.split(/[/,]/)
		.map((part) => part.trim())
		.filter((part) => part.length > 1 && part.toLowerCase() !== primary.toLowerCase());
}

/**
 * Escapes a string for use inside a RegExp literal
 *
 * @param value Raw string to escape
 *
 * @returns Escaped string for `RegExp` construction
 */
function escapeRegExpLiteral(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
