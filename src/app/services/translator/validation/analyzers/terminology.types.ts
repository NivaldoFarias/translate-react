/** One glossary or locale terminology enforcement rule */
export interface TerminologyEnforcementRule {
	/** English anchor in source; rule skipped when this does not match prose */
	readonly sourcePattern: RegExp;

	/** Portuguese substrings that must not appear in translation when the source matches */
	readonly forbiddenInTranslation: readonly RegExp[];

	/** Portuguese form that should appear instead (for retry hints only) */
	readonly preferredTranslation?: string;

	/** Short citation for LLM retry hints (glossary line or locale rule) */
	readonly glossaryHint: string;
}

/** English term that must remain untranslated when present in source prose */
export interface ProtectedEnglishTermRule {
	/** Literal English product or API name */
	readonly term: string;

	/** Word-boundary pattern to detect the term in source prose */
	readonly sourcePattern: RegExp;

	/**
	 * When `true`, translation must still contain {@link ProtectedEnglishTermRule.term} verbatim.
	 * When `false`, only {@link ProtectedEnglishTermRule.forbiddenLiteralTranslations} are checked.
	 */
	readonly requireVerbatimEnglish?: boolean;

	/** Literal Portuguese mistranslations to reject (e.g. Flight → Voo) */
	readonly forbiddenLiteralTranslations?: readonly RegExp[];
}

/** Flags when multiple allowed renderings for one English anchor appear in the same file */
export interface TerminologyConsistencyRule {
	/** English anchor that must appear at least twice in source prose */
	readonly sourcePattern: RegExp;

	/** Distinct Portuguese renderings; violation when two or more appear in translation */
	readonly conflictingForms: readonly string[];

	/** Hint text for LLM retry */
	readonly glossaryHint: string;
}

/** One terminology violation surfaced by an analyzer */
export interface TerminologyViolation {
	readonly kind: "glossary" | "protected" | "consistency";
	readonly message: string;
	readonly glossaryHint: string;
}
