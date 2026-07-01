/** Stable identifiers for post-translation validation guards */
export const POST_TRANSLATION_GUARD_IDS = {
	nonEmptyContent: "nonEmptyContent",
	contentRatio: "contentRatio",
	mdxSlugPreserved: "mdxSlugPreserved",
	headingCountPreserved: "headingCountPreserved",
	headingSyntax: "headingSyntax",
	headingsPreserved: "headingsPreserved",
	markdownLinksPreserved: "markdownLinksPreserved",
	frontmatterPreserved: "frontmatterPreserved",
	fenceFunctionIdentifiers: "fenceFunctionIdentifiers",
	fenceJsxStaticText: "fenceJsxStaticText",
	sentenceCaseHeadings: "sentenceCaseHeadings",
	mdxSpacing: "mdxSpacing",
	extraMarkdownLinks: "extraMarkdownLinks",
} as const;

/** Union of all {@link POST_TRANSLATION_GUARD_IDS} values */
export type PostTranslationGuardId =
	(typeof POST_TRANSLATION_GUARD_IDS)[keyof typeof POST_TRANSLATION_GUARD_IDS];

/** Common LLM response prefixes that should be removed from translated content */
export const TRANSLATION_PREFIXES = [
	"Here is the translation:",
	"Here's the translation:",
	"Translation:",
	"Translated content:",
	"Here is the translated content:",
	"Here's the translated content:",
] as const;

/** Ratios used for soft post-translation validation warnings */
export const VALIDATION_RATIOS = {
	/** Minimum acceptable link ratio for translated content */
	link: {
		/**
		 * Minimum acceptable link ratio for translated content
		 * (0.8 = 80% of original, i.e., >20% difference warns)
		 */
		min: 0.8,

		/**
		 * Maximum acceptable link ratio for translated content
		 * (1.2 = 120% of original)
		 */
		max: 1.2,
	},

	/** Minimum acceptable code block ratio for translated content */
	codeBlock: {
		/**
		 * Minimum acceptable code block ratio for translated content
		 * (0.8 = 80% of original, i.e., >20% difference warns)
		 */
		min: 0.8,

		/**
		 * Maximum acceptable code block ratio for translated content
		 * (1.2 = 120% of original)
		 */
		max: 1.2,
	},

	/** Minimum acceptable heading ratio for translated content */
	heading: {
		/**
		 * Minimum acceptable heading ratio for translated content
		 * (0.8 = 80% of original)
		 */
		min: 0.8,

		/**
		 * Maximum acceptable heading ratio for translated content
		 * (1.2 = 120% of original)
		 */
		max: 1.2,
	},

	/** Minimum acceptable size ratio for translated content */
	size: {
		/**
		 * Minimum acceptable size ratio for translated content
		 * (0.55 = 55% of original; catches abrupt truncation while allowing terse locales)
		 */
		min: 0.55,

		/**
		 * Maximum acceptable size ratio for translated content
		 * (2.0 = 200% of original)
		 */
		max: 2.0,
	},
} as const;
