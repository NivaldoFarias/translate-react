import type {
	LocaleMechanicalRepairPass,
	LocaleMechanicalRepairs,
	LocaleMechanicalRepairScope,
	LocaleMechanicalRepairsDefinition,
	LocalePhraseGroupPassOptions,
	LocaleRegexRepairPassOptions,
	LocaleServerClientTermsPassOptions,
	LocaleYoSpellingPassOptions,
} from "./types";

import {
	mapMarkdownProseRegions,
	mapOutsideFencedCodeBlocks,
} from "@/app/utils/markdown-verbatim-fences.util";

import {
	applyCuratedYoSpellings,
	applyLocaleRegexRepairs,
	applyPhraseReplacements,
	applyReplacementsInMarkdownLinkLabels,
	getPhraseReplacements,
	selectLocaleRegexRepairs,
} from "./repairs.util";

/**
 * Applies a region transform for the requested markdown scope.
 *
 * @param scope Document, outside-fence, or prose-only scope
 * @param content Markdown input for the pass
 * @param transform Mapper invoked on each scoped region
 *
 * @returns Content with the transform applied only inside the scope
 */
function applyWithScope(
	scope: LocaleMechanicalRepairScope,
	content: string,
	transform: (region: string) => string,
) {
	switch (scope) {
		case "document":
			return transform(content);
		case "outside-fences":
			return mapOutsideFencedCodeBlocks(content, transform);
		case "prose-regions":
			return mapMarkdownProseRegions(content, transform);
	}
}

/**
 * Builds a pass that applies one or more regex repairs inside a markdown scope.
 *
 * @param options Pass metadata and repair ids to resolve from the locale catalog
 *
 * @returns Configured regex repair pass
 */
export function createRegexRepairPass(
	options: LocaleRegexRepairPassOptions,
): LocaleMechanicalRepairPass {
	const repairs = selectLocaleRegexRepairs(options.regexRepairs, options.repairIds);
	const scope = options.scope ?? repairs[0]?.scope ?? "document";

	return {
		id: options.id,
		description: options.description,
		apply: (content) =>
			applyWithScope(scope, content, (region) => applyLocaleRegexRepairs(region, repairs)),
	};
}

/**
 * Builds a pass that applies one phrase replacement group inside a markdown scope.
 *
 * @param options Pass metadata and phrase group id
 *
 * @returns Configured phrase-group repair pass
 */
export function createPhraseGroupPass(
	options: LocalePhraseGroupPassOptions,
): LocaleMechanicalRepairPass {
	return {
		id: options.id,
		description: options.description,
		apply: (content) =>
			applyWithScope(options.scope, content, (region) => {
				const prelude = options.beforeApply ? options.beforeApply(region) : region;
				const replacements = getPhraseReplacements(options.phraseGroups, options.groupId);

				return applyPhraseReplacements(prelude, replacements);
			}),
	};
}

/**
 * Builds a pass that restores curated ё spellings in prose regions.
 *
 * @param options Pass metadata and yo spelling group id
 *
 * @returns Configured yo-spelling repair pass
 */
export function createYoSpellingPass(
	options: LocaleYoSpellingPassOptions,
): LocaleMechanicalRepairPass {
	return {
		id: options.id,
		description: options.description,
		apply: (content) =>
			mapMarkdownProseRegions(content, (prose) =>
				applyCuratedYoSpellings(
					prose,
					getPhraseReplacements(options.phraseGroups, options.groupId),
				),
			),
	};
}

/**
 * Builds a pass that localizes Server/Client Component terms in prose and link labels.
 *
 * @param options Pass metadata and replacement tables
 *
 * @returns Configured Server/Client terminology repair pass
 */
export function createServerClientTermsPass(
	options: LocaleServerClientTermsPassOptions,
): LocaleMechanicalRepairPass {
	return {
		id: options.id,
		description: options.description,
		apply: (content) =>
			mapMarkdownProseRegions(content, (prose) => {
				let cleaned = applyReplacementsInMarkdownLinkLabels(
					prose,
					options.linkLabelRegexReplacements,
				);

				cleaned = applyPhraseReplacements(
					cleaned,
					getPhraseReplacements(options.phraseGroups, options.phraseGroupIds.beforeRegex),
				);

				for (const [pattern, replacement] of options.proseRegexReplacements) {
					cleaned = cleaned.replace(pattern, replacement);
				}

				cleaned = applyPhraseReplacements(
					cleaned,
					getPhraseReplacements(options.phraseGroups, options.phraseGroupIds.afterRegex),
				);

				return cleaned;
			}),
	};
}

/**
 * Creates a locale mechanical repair handle from a declarative definition.
 *
 * @param definition Locale phrase tables, regex catalog, and ordered passes
 *
 * @returns Handle exposing `apply`, `applyPass`, and table lookups
 */
export function createLocaleMechanicalRepairs(
	definition: LocaleMechanicalRepairsDefinition,
): LocaleMechanicalRepairs {
	const passById = new Map(definition.passes.map((pass) => [pass.id, pass]));

	return {
		definition,
		apply(content) {
			return definition.passes.reduce((cleaned, pass) => pass.apply(cleaned), content);
		},
		applyPass(passId, content) {
			const pass = passById.get(passId);

			if (!pass) {
				throw new Error(`Missing locale mechanical repair pass: ${passId}`);
			}

			return pass.apply(content);
		},
		getPhraseReplacements(groupId) {
			return getPhraseReplacements(definition.phraseGroups, groupId);
		},
		getRegexRepairs(repairIds) {
			return selectLocaleRegexRepairs(definition.regexRepairs, repairIds);
		},
	};
}
