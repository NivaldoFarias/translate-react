import { MARKDOWN_REGEXES } from "@/app/services/translator/markdown/markdown.regexes";

/**
 * Returns markdown with fenced blocks and inline code removed for prose terminology checks.
 *
 * @param markdown Full markdown document
 *
 * @returns Prose-only text (headings and paragraphs retained)
 */
export function stripMarkdownForTerminologyProse(markdown: string) {
	let prose = markdown.replace(MARKDOWN_REGEXES.codeBlock, " ");
	prose = prose.replace(MARKDOWN_REGEXES.frontmatter, " ");
	prose = prose.replace(new RegExp(/`[^`\n]+`/g), " ");
	prose = prose.replace(new RegExp(/!\[[^\]]*]\([^)]*\)/g), " ");
	prose = prose.replace(new RegExp(/\[[^\]]*]\([^)]*\)/g), " ");
	return prose;
}
