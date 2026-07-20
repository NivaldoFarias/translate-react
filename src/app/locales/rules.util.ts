/**
 * One section of locale-specific LLM prompt rules.
 *
 * Serialized as a markdown heading (when {@link LocalePromptRuleSection.heading} is set)
 * followed by `-` bullets for the translation prompt builder.
 */
export interface LocalePromptRuleSection {
	/** Optional markdown heading without leading `#` */
	readonly heading?: string;

	/** Rule bullets; each item is the text after `- ` */
	readonly bullets: readonly string[];
}

/** Shared segment-batch context copied into every locale's `segmentSpecific` rules */
export const segmentBatchContextSection: LocalePromptRuleSection = {
	heading: "SEGMENT BATCH CONTEXT",
	bullets: [
		"Each `source` string is an isolated prose fragment from a larger markdown document",
		"Link URLs and fenced code bodies are frozen outside this batch and reassembled after translation; when `source` is link label text, translate only the label words",
		"MDN locale URL rewrites are applied mechanically after reassembly, so full `https://developer.mozilla.org/...` URLs are not present in segment batches",
	],
};

/**
 * Formats one locale rule section as markdown prompt text.
 *
 * @param section Heading and bullets to serialize
 *
 * @returns Markdown fragment for a locale rules prompt
 */
export function formatLocalePromptRuleSection(section: LocalePromptRuleSection) {
	const lines = section.bullets.map((bullet) => `- ${bullet}`);

	if (!section.heading) {
		return lines.join("\n");
	}

	return [`# ${section.heading}`, ...lines].join("\n");
}

/**
 * Builds a locale-specific rules prompt from a document title and ordered sections.
 *
 * @param title Top-level markdown heading without leading `#`
 * @param sections Ordered rule sections appended under the title
 *
 * @returns Full locale rules string for `LocaleRulesConfig.specific` or `segmentSpecific`
 */
export function buildLocaleRulesPrompt(
	title: string,
	sections: readonly LocalePromptRuleSection[],
) {
	return [`# ${title}`, ...sections.map(formatLocalePromptRuleSection)].join("\n\n");
}
