/** Literal from/to pair for deterministic phrase repair */
export type LocalePhraseReplacement = readonly [from: string, to: string];

/** RegExp-based replacement applied in document order */
export type LocaleRegexReplacement = readonly [pattern: RegExp, replacement: string];

/** Markdown region a mechanical repair pass may touch */
export type LocaleMechanicalRepairScope = "document" | "outside-fences" | "prose-regions";

/**
 * Named group of literal phrase replacements.
 *
 * Group {@link LocalePhraseReplacementGroup.id} and {@link LocalePhraseReplacementGroup.description}
 * document why the replacements exist for locale maintainers.
 */
export interface LocalePhraseReplacementGroup {
	/** Stable identifier for tests and changelog references */
	readonly id: string;

	/** Maintainer-facing note on production feedback that motivated the group */
	readonly description: string;

	/** Ordered literal replacements; earlier entries win over later overlaps */
	readonly replacements: readonly LocalePhraseReplacement[];
}

/**
 * Single regex repair with metadata.
 *
 * Use for patterns that need word boundaries, capture groups, or non-literal matching.
 */
export interface LocaleRegexRepair {
	/** Stable identifier for tests and changelog references */
	readonly id: string;

	/** Maintainer-facing note on the glitch being repaired */
	readonly description: string;

	/** Whether the repair runs on the full document or only outside fenced code */
	readonly scope: LocaleMechanicalRepairScope;

	/** Pattern to match outside the repair function's scope guard */
	readonly pattern: RegExp;

	/** Replacement string or capture-group template */
	readonly replacement: string;
}

/** English Server/Client Component term patterns localized in Russian prose */
export type LocaleServerClientTermReplacement = readonly [pattern: RegExp, replacement: string];

/**
 * One deterministic repair step in a locale pipeline.
 *
 * Passes run in definition order when {@link LocaleMechanicalRepairs.apply} is called.
 */
export interface LocaleMechanicalRepairPass {
	/** Stable identifier used by tests and {@link LocaleMechanicalRepairs.applyPass} */
	readonly id: string;

	/** Maintainer-facing note on the glitch being repaired */
	readonly description: string;

	/**
	 * Applies this pass to assembled translated markdown.
	 *
	 * @param content Document or scoped region content
	 *
	 * @returns Content with this pass applied
	 */
	readonly apply: (content: string) => string;
}

/**
 * Declarative bundle of locale mechanical repair tables and ordered passes.
 *
 * Locales register one definition object and receive a {@link LocaleMechanicalRepairs}
 * handle from {@link createLocaleMechanicalRepairs}.
 */
export interface LocaleMechanicalRepairsDefinition {
	/** Target locale code (for example `ru`) */
	readonly localeId: string;

	/** Literal phrase replacement tables available to pass builders */
	readonly phraseGroups: readonly LocalePhraseReplacementGroup[];

	/** Regex repair catalog referenced by id from pass builders */
	readonly regexRepairs: readonly LocaleRegexRepair[];

	/** Ordered repair pipeline executed by {@link LocaleMechanicalRepairs.apply} */
	readonly passes: readonly LocaleMechanicalRepairPass[];
}

/**
 * Runtime handle for a locale mechanical repair definition.
 *
 * Use {@link LocaleMechanicalRepairs.apply} in the translation pipeline and
 * {@link LocaleMechanicalRepairs.applyPass} in focused unit tests.
 */
export interface LocaleMechanicalRepairs {
	/** Source definition used to build this handle */
	readonly definition: LocaleMechanicalRepairsDefinition;

	/**
	 * Runs every configured pass in pipeline order.
	 *
	 * @param content Assembled translated markdown
	 *
	 * @returns Document with locale-specific glitch patterns repaired
	 */
	apply(content: string): string;

	/**
	 * Runs a single pass by id.
	 *
	 * @param passId {@link LocaleMechanicalRepairPass.id} to execute
	 * @param content Assembled translated markdown
	 *
	 * @returns Content with only the requested pass applied
	 */
	applyPass(passId: string, content: string): string;

	/**
	 * Resolves one phrase replacement group from the locale definition.
	 *
	 * @param groupId {@link LocalePhraseReplacementGroup.id}
	 *
	 * @returns Literal replacements for the requested group
	 */
	getPhraseReplacements(groupId: string): readonly LocalePhraseReplacement[];

	/**
	 * Resolves regex repairs by stable id.
	 *
	 * @param repairIds {@link LocaleRegexRepair.id} values to include
	 *
	 * @returns Matching repairs in the same order as `repairIds`
	 */
	getRegexRepairs(repairIds: readonly string[]): readonly LocaleRegexRepair[];
}

/** Deterministic post-translation repair pass scoped to one target locale */
export type LocaleMechanicalRepairsFn = LocaleMechanicalRepairs["apply"];

/** Options for {@link createRegexRepairPass} */
export interface LocaleRegexRepairPassOptions {
	/** Stable pass identifier */
	readonly id: string;

	/** Maintainer-facing pass summary */
	readonly description: string;

	/** Regex repair ids to resolve from the locale catalog */
	readonly repairIds: readonly string[];

	/** Locale regex repair catalog */
	readonly regexRepairs: readonly LocaleRegexRepair[];

	/** Markdown scope override; defaults to the first repair's scope */
	readonly scope?: LocaleMechanicalRepairScope;
}

/** Options for {@link createPhraseGroupPass} */
export interface LocalePhraseGroupPassOptions {
	/** Stable pass identifier */
	readonly id: string;

	/** Maintainer-facing pass summary */
	readonly description: string;

	/** Phrase group id to resolve from the locale catalog */
	readonly groupId: string;

	/** Locale phrase replacement group catalog */
	readonly phraseGroups: readonly LocalePhraseReplacementGroup[];

	/** Markdown scope for the phrase replacements */
	readonly scope: LocaleMechanicalRepairScope;

	/** Optional region transform run before phrase replacements */
	readonly beforeApply?: (region: string) => string;
}

/** Options for {@link createYoSpellingPass} */
export interface LocaleYoSpellingPassOptions {
	/** Stable pass identifier */
	readonly id: string;

	/** Maintainer-facing pass summary */
	readonly description: string;

	/** Yo spelling group id to resolve from the locale catalog */
	readonly groupId: string;

	/** Locale phrase replacement group catalog */
	readonly phraseGroups: readonly LocalePhraseReplacementGroup[];
}

/** Options for {@link createServerClientTermsPass} */
export interface LocaleServerClientTermsPassOptions {
	/** Stable pass identifier */
	readonly id: string;

	/** Maintainer-facing pass summary */
	readonly description: string;

	/** Locale phrase replacement group catalog */
	readonly phraseGroups: readonly LocalePhraseReplacementGroup[];

	/** Phrase groups applied before and after regex replacements */
	readonly phraseGroupIds: {
		/** Phrase group applied before regex replacements */
		readonly beforeRegex: string;

		/** Phrase group applied after regex replacements */
		readonly afterRegex: string;
	};

	/** Regex replacements applied to prose outside link labels */
	readonly proseRegexReplacements: readonly (readonly [RegExp, string])[];

	/** Regex replacements applied inside markdown link labels */
	readonly linkLabelRegexReplacements: readonly (readonly [RegExp, string])[];
}
