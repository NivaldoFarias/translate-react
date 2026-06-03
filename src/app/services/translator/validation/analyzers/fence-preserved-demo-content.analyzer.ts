import { extractFencedCodeBlockBodies } from "./fence-code-identifier.analyzer";

/** One demo string or JSX text node removed or altered inside a paired fence */
export interface FencePreservedDemoContentMismatch {
	/** 1-based fence index in document order */
	fenceIndex: number;

	/** Source snippet that should have been copied verbatim */
	sourceSnippet: string;
}

/** React API terms that must stay in English inside `//` line comments in fenced code */
const PROTECTED_REACT_COMMENT_TERMS = [
	"state",
	"effect",
	"effects",
	"ref",
	"refs",
	"props",
	"reducer",
	"dispatch",
	"context",
	"memo",
	"callback",
	"suspense",
	"render",
	"hydration",
	"hook",
	"hooks",
] as const;

const QUOTED_STRING_LITERAL = new RegExp(/(['"])(?:\\.|(?!\1).)*?\1/g);

const JSX_TEXT_NODE = new RegExp(/>\s*([^<>{}]+?)\s*</g);

const JSX_ATTRIBUTE_STRING = new RegExp(/=\s*(['"])([^'"\\]|\\.)*\1/g);

const MDX_ELEMENT_TEXT = new RegExp(/<ConsoleLogLine[^>]*>\s*([^<]+?)\s*<\/ConsoleLogLine>/gi);

const LINE_COMMENT = new RegExp(/\/\/[^\n]*/g);

/**
 * Detects demo UI strings and JSX text in fenced blocks that were translated instead of copied.
 *
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 *
 * @returns Mismatches when a preserved snippet from the source fence is missing in the paired fence
 */
export function findFencePreservedDemoContentMismatches(
	sourceMarkdown: string,
	translatedMarkdown: string,
) {
	const sourceFences = extractFencedCodeBlockBodies(sourceMarkdown);
	const translatedFences = extractFencedCodeBlockBodies(translatedMarkdown);

	if (sourceFences.length !== translatedFences.length) {
		return [];
	}

	const mismatches: FencePreservedDemoContentMismatch[] = [];

	for (let index = 0; index < sourceFences.length; index++) {
		const sourceFence = sourceFences[index];
		const translatedFence = translatedFences[index];
		if (!sourceFence || translatedFence === undefined) continue;

		for (const snippet of collectPreservedDemoSnippets(sourceFence)) {
			if (!translatedFence.includes(snippet)) {
				mismatches.push({ fenceIndex: index + 1, sourceSnippet: snippet });
			}
		}
	}

	return mismatches;
}

/**
 * Detects React API terms dropped from `//` comments inside fenced code.
 *
 * @param sourceMarkdown Original markdown
 * @param translatedMarkdown Translated markdown
 *
 * @returns Mismatches when a protected term in a source line comment is absent from the translated fence
 */
export function findFenceReactCommentTermMismatches(
	sourceMarkdown: string,
	translatedMarkdown: string,
) {
	const sourceFences = extractFencedCodeBlockBodies(sourceMarkdown);
	const translatedFences = extractFencedCodeBlockBodies(translatedMarkdown);

	if (sourceFences.length !== translatedFences.length) {
		return [];
	}

	const mismatches: FencePreservedDemoContentMismatch[] = [];

	for (let index = 0; index < sourceFences.length; index++) {
		const sourceFence = sourceFences[index];
		const translatedFence = translatedFences[index];
		if (!sourceFence || translatedFence === undefined) continue;

		for (const comment of sourceFence.match(LINE_COMMENT) ?? []) {
			for (const term of PROTECTED_REACT_COMMENT_TERMS) {
				const termPattern = new RegExp(`\\b${term}\\b`);
				if (!termPattern.test(comment)) continue;
				if (termPattern.test(translatedFence)) continue;

				mismatches.push({
					fenceIndex: index + 1,
					sourceSnippet: term,
				});
			}
		}
	}

	return mismatches;
}

/**
 * Collects string literals and JSX text nodes that should remain in English inside a fence.
 *
 * @param fenceInner Fenced block inner text
 *
 * @returns Unique snippets in first-seen order
 */
export function collectPreservedDemoSnippets(fenceInner: string) {
	const snippets: string[] = [];
	const seen = new Set<string>();

	const addSnippet = (raw: string) => {
		const value = raw.trim();
		if (!value || seen.has(value) || !isPreservedDemoSnippet(value)) return;

		seen.add(value);
		snippets.push(value);
	};

	for (const match of fenceInner.matchAll(QUOTED_STRING_LITERAL)) {
		const quote = match[1];
		const literal = match[0];
		if (!quote || !literal) continue;

		addSnippet(literal.slice(1, -1).replace(/\\(.)/g, "$1"));
	}

	for (const match of fenceInner.matchAll(JSX_ATTRIBUTE_STRING)) {
		const literal = match[0];
		const quote = match[1];
		if (!quote || !literal) continue;

		addSnippet(literal.slice(literal.indexOf(quote) + 1, -1).replace(/\\(.)/g, "$1"));
	}

	for (const match of fenceInner.matchAll(JSX_TEXT_NODE)) {
		addSnippet(match[1] ?? "");
	}

	for (const match of fenceInner.matchAll(MDX_ELEMENT_TEXT)) {
		addSnippet(match[1] ?? "");
	}

	return snippets;
}

/**
 * Returns whether a fence snippet looks like demo UI copy that must stay in English for pt-br.
 *
 * @param value Unquoted string or JSX text
 *
 * @returns `true` when the snippet should be preserved verbatim
 */
export function isPreservedDemoSnippet(value: string) {
	const trimmed = value.trim();
	if (trimmed.length < 3 || !/[A-Za-z]/.test(trimmed)) return false;

	if (/^[@./]|https?:\/\//i.test(trimmed)) return false;
	if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) return false;
	if (/^(true|false|null|undefined|use[A-Z]\w*)$/i.test(trimmed)) return false;

	if (trimmed.includes(" ") || trimmed.endsWith(":")) return true;
	if (/[A-Z][a-z]+.*[A-Z]/.test(trimmed)) return true;

	return trimmed.length >= 10 && /[a-z]/.test(trimmed) && /[A-Z]/.test(trimmed);
}

/**
 * Builds a retry hint for preserved demo content inside fences.
 *
 * @param demoMismatches Demo string or JSX text mismatches
 * @param commentTermMismatches React API terms missing from translated comments
 *
 * @returns Hint string for the LLM system prompt
 */
export function buildFencePreservedContentRetryHint(
	demoMismatches: FencePreservedDemoContentMismatch[],
	commentTermMismatches: FencePreservedDemoContentMismatch[],
) {
	const parts: string[] = [
		"In fenced code blocks, keep demo UI strings and JSX text exactly as in the source (English).",
	];

	if (demoMismatches.length > 0) {
		const examples = demoMismatches
			.slice(0, 4)
			.map(({ sourceSnippet }) => `copy \`${sourceSnippet}\` verbatim`)
			.join("; ");
		parts.push(examples);
	}

	if (commentTermMismatches.length > 0) {
		const terms = [...new Set(commentTermMismatches.map(({ sourceSnippet }) => sourceSnippet))]
			.slice(0, 6)
			.map((term) => `\`${term}\``)
			.join(", ");
		parts.push(`Keep React API terms in \`//\` comments in English: ${terms}.`);
	}

	return parts.join(" ");
}
