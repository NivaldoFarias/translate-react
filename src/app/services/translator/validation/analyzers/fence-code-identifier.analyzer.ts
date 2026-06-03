import { MARKDOWN_REGEXES } from "../../markdown/markdown.regexes";

/** Matches `function` declarations and captures the identifier name */
const FUNCTION_DECLARATION = new RegExp(/\bfunction\s+(?<name>[A-Za-z_$][\w$]*)/g);

/** One function identifier renamed between paired fenced blocks */
export interface FenceFunctionIdentifierMismatch {
	/** 1-based fence index in document order */
	fenceIndex: number;

	/** Function name present in the source fence */
	sourceName: string;
}

/**
 * Lists inner text of each fenced code block in document order.
 *
 * @param markdown Markdown body to scan
 *
 * @returns Fence inner contents (includes optional language tag line)
 */
export function extractFencedCodeBlockBodies(markdown: string) {
	return [...markdown.matchAll(MARKDOWN_REGEXES.codeBlock)].map((match) => match[1] ?? "");
}

/**
 * Collects function declaration names from a code snippet.
 *
 * @param code Fence inner text
 *
 * @returns Unique function names in first-seen order
 */
export function collectFunctionDeclarationNames(code: string) {
	const names: string[] = [];
	const seen = new Set<string>();

	for (const match of code.matchAll(FUNCTION_DECLARATION)) {
		const name = match.groups?.["name"];
		if (!name || seen.has(name)) continue;

		seen.add(name);
		names.push(name);
	}

	return names;
}

/**
 * Detects function identifiers in fenced blocks that were renamed during translation.
 *
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 *
 * @returns Mismatches when a source `function` name is missing from the paired translated fence
 */
export function findFenceFunctionIdentifierMismatches(
	sourceMarkdown: string,
	translatedMarkdown: string,
) {
	const sourceFences = extractFencedCodeBlockBodies(sourceMarkdown);
	const translatedFences = extractFencedCodeBlockBodies(translatedMarkdown);

	if (sourceFences.length !== translatedFences.length) {
		return [];
	}

	const mismatches: FenceFunctionIdentifierMismatch[] = [];

	for (let index = 0; index < sourceFences.length; index++) {
		const sourceFence = sourceFences[index];
		const translatedFence = translatedFences[index];
		if (!sourceFence || translatedFence === undefined) continue;

		for (const sourceName of collectFunctionDeclarationNames(sourceFence)) {
			const preservedPattern = new RegExp(`\\bfunction\\s+${escapeRegExp(sourceName)}\\b`);
			if (!preservedPattern.test(translatedFence)) {
				mismatches.push({ fenceIndex: index + 1, sourceName });
			}
		}
	}

	return mismatches;
}

/**
 * Builds a retry hint listing renamed function identifiers.
 *
 * @param mismatches Detected fence function mismatches
 *
 * @returns Hint string for the LLM system prompt
 */
export function buildFenceFunctionIdentifierRetryHint(
	mismatches: FenceFunctionIdentifierMismatch[],
) {
	const examples = mismatches
		.slice(0, 6)
		.map(({ sourceName }) => `keep \`${sourceName}\` exactly as in the source`)
		.join("; ");

	return `In fenced code blocks, do not translate or rename programming identifiers (function, class, variable, hook, and prop names as written in code). ${examples}.`;
}

/**
 * Escapes special characters in a string for safe use inside a `RegExp`.
 *
 * @param value Raw substring to embed in a regex pattern
 *
 * @returns Literal-safe string for `RegExp` construction
 */
function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
