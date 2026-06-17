import { MARKDOWN_REGEXES } from "../../markdown/markdown.regexes";

/** One MDX spacing regression with document location */
export interface MdxSpacingViolation {
	readonly label: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly excerpt: string;
}

/** One sentence-case heading regression with document location */
export interface SentenceCaseHeadingViolation {
	readonly lineNumber: number;
	readonly line: string;
}

/** One extra markdown link URL with document location */
export interface ExtraMarkdownLinkViolation {
	readonly url: string;
	readonly lineNumber: number;
}

const MDX_SPACING_PATTERNS: { label: string; regex: RegExp }[] = [
	{ label: "missing space before MDX slug comment", regex: /\S\{\/\*/g },
	{ label: "missing space before markdown link", regex: /\b(?:por|e|no)\[/gi },
	{ label: "missing space between adjacent links", regex: /\],\[/g },
];

/** Matches one non-empty inline code span (no nested backticks) */
const INLINE_CODE_SPAN = /`[^`\n]+`/g;

/**
 * Returns the 1-based line number at a UTF-16 offset in markdown.
 *
 * @param markdown Full markdown document
 * @param offset Character offset from the start of the document
 *
 * @returns 1-based line number
 */
function lineNumberAtOffset(markdown: string, offset: number) {
	if (offset <= 0) {
		return 1;
	}

	return markdown.slice(0, offset).split("\n").length;
}

/** Proper nouns and product names allowed in Title Case inside pt-br headings */
const PT_BR_HEADING_PROPER_NOUNS = new Set([
	"React",
	"JSX",
	"DOM",
	"API",
	"HTML",
	"CSS",
	"HTTP",
	"URL",
	"MDX",
	"npm",
	"yarn",
	"Node",
	"JavaScript",
	"TypeScript",
	"Next.js",
	"Vite",
	"Webpack",
	"Canary",
	"Sandpack",
]);

/** Common Portuguese words that should stay lowercase in sentence-case headings */
const PT_BR_SENTENCE_CASE_COMMON_WORDS = new Set([
	"recursos",
	"funcionalidades",
	"notáveis",
	"notavel",
	"migrar",
	"migração",
	"limitações",
	"limitacoes",
	"próxima",
	"proxima",
	"versão",
	"versao",
	"principal",
	"alterações",
	"alteracoes",
	"componentes",
	"servidor",
	"estático",
	"estatico",
	"melhorias",
	"mudanças",
	"mudancas",
]);

/**
 * Extracts markdown link URLs from a document.
 *
 * @param markdown Document text
 *
 * @returns Link URL targets in document order
 */
export function extractMarkdownLinkUrls(markdown: string) {
	const urls: string[] = [];

	for (const match of markdown.matchAll(MARKDOWN_REGEXES.markdownLink)) {
		urls.push(match.groups?.["url"] ?? "");
	}

	return urls;
}

/**
 * Finds link URLs present in the translation but absent from the source.
 *
 * @param source Original markdown
 * @param translated Translated markdown
 *
 * @returns Extra URL targets introduced during translation
 */
export function findExtraMarkdownLinks(source: string, translated: string) {
	const sourceUrls = new Set(extractMarkdownLinkUrls(source));
	return extractMarkdownLinkUrls(translated).filter((url) => !sourceUrls.has(url));
}

/**
 * Flags inline code spans immediately followed by prose letters (no whitespace separator).
 *
 * Uses minimal `` `[^`]+` `` spans so nested backticks inside markdown link labels do not
 * produce false positives across long prose runs.
 *
 * @param translated Translated markdown
 * @param maxMatches Maximum violations to collect
 *
 * @returns Located inline-code spacing violations in document order
 */
export function findInlineCodeGluedToProseViolations(translated: string, maxMatches = 5) {
	const violations: MdxSpacingViolation[] = [];
	INLINE_CODE_SPAN.lastIndex = 0;
	let match = INLINE_CODE_SPAN.exec(translated);

	while (match && violations.length < maxMatches) {
		const afterIndex = match.index + match[0].length;
		const afterChar = translated[afterIndex];

		if (afterChar !== undefined && /[A-Za-zÀ-ÿ]/.test(afterChar)) {
			const start = Math.max(0, match.index - 12);
			const end = Math.min(translated.length, afterIndex + 12);

			violations.push({
				label: "missing space after inline code",
				startLine: lineNumberAtOffset(translated, match.index),
				endLine: lineNumberAtOffset(translated, afterIndex),
				excerpt: translated.slice(start, end).replace(/\n/g, " "),
			});
		}

		match = INLINE_CODE_SPAN.exec(translated);
	}

	return violations;
}

/**
 * Finds MDX spacing regressions with line ranges for maintainer review.
 *
 * @param translated Translated markdown
 * @param maxPerPattern Maximum matches to collect per pattern
 *
 * @returns Located spacing violations in document order
 */
export function findMdxSpacingViolationDetails(translated: string, maxPerPattern = 5) {
	const violations: MdxSpacingViolation[] = [
		...findInlineCodeGluedToProseViolations(translated, maxPerPattern),
	];

	for (const { label, regex } of MDX_SPACING_PATTERNS) {
		regex.lastIndex = 0;
		let match = regex.exec(translated);
		let collected = 0;

		while (match && collected < maxPerPattern) {
			const start = Math.max(0, match.index - 12);
			const end = Math.min(translated.length, match.index + match[0].length + 12);
			const matchStart = match.index;
			const matchEnd = match.index + match[0].length;

			violations.push({
				label,
				startLine: lineNumberAtOffset(translated, matchStart),
				endLine: lineNumberAtOffset(translated, matchEnd),
				excerpt: translated.slice(start, end).replace(/\n/g, " "),
			});

			collected += 1;
			match = regex.exec(translated);
		}
	}

	return violations;
}

/**
 * Finds mechanical MDX spacing regressions introduced during segment reinsertion.
 *
 * @param translated Translated markdown
 *
 * @returns Human-readable violation samples
 */
export function findMdxSpacingViolations(translated: string) {
	return findMdxSpacingViolationDetails(translated, 1).map(
		(violation) => `${violation.label}: …${violation.excerpt}…`,
	);
}

/**
 * Finds sentence-case heading regressions with line numbers for maintainer review.
 *
 * @param translated Translated markdown
 *
 * @returns Located heading violations in document order
 */
export function findSentenceCaseHeadingViolationDetails(translated: string) {
	const violations: SentenceCaseHeadingViolation[] = [];
	const lines = translated.split("\n");

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex] ?? "";
		if (!/^#{1,6}\s/.test(line)) {
			continue;
		}

		const visible = line.replace(/\{\/\*[^*]+\*\/\}/g, "").replace(/^#{1,6}\s+/, "");
		const words = visible.split(/\s+/).filter((word) => word.length > 0);

		for (let index = 1; index < words.length; index++) {
			const word = words[index]?.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "") ?? "";
			if (word.length === 0) {
				continue;
			}

			if (PT_BR_HEADING_PROPER_NOUNS.has(word)) {
				continue;
			}

			const normalized = word.toLocaleLowerCase("pt-BR");
			if (!PT_BR_SENTENCE_CASE_COMMON_WORDS.has(normalized)) {
				continue;
			}

			if (word.startsWith(word.charAt(0).toLocaleUpperCase("pt-BR"))) {
				violations.push({ lineNumber: lineIndex + 1, line: line.trim() });
				break;
			}
		}
	}

	return violations;
}

/**
 * Detects likely Title Case violations in markdown headings for pt-br sentence case policy.
 *
 * @param translated Translated markdown
 *
 * @returns Heading lines that appear to use English Title Case on common words
 */
export function findSentenceCaseHeadingViolations(translated: string) {
	return findSentenceCaseHeadingViolationDetails(translated).map((violation) => violation.line);
}

/**
 * Finds extra markdown link URLs with the line where each first appears.
 *
 * @param source Original markdown
 * @param translated Translated markdown
 *
 * @returns Extra URLs with line numbers in the translation
 */
export function findExtraMarkdownLinkViolationDetails(source: string, translated: string) {
	return findExtraMarkdownLinks(source, translated).map((url) => {
		const offset = translated.indexOf(url);

		return {
			url,
			lineNumber: offset < 0 ? 1 : lineNumberAtOffset(translated, offset),
		} satisfies ExtraMarkdownLinkViolation;
	});
}
