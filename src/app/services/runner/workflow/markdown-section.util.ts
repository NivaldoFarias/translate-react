/** A contiguous markdown section bounded by one heading and the next peer-or-higher heading */
export interface MarkdownSectionSlice {
	/** Document content before the section heading line */
	readonly prefix: string;

	/** Section from the heading line through the line before the next boundary */
	readonly section: string;

	/** Document content after the section */
	readonly suffix: string;
}

/**
 * Extracts a markdown section whose heading line contains slug comment.
 *
 * @param content Full markdown document
 * @param slug JSX slug comment value without braces (e.g. `opting-out-of-an-animation`)
 *
 * @returns Section slice, or `undefined` when the slug heading is not found
 */
export function extractMarkdownSectionBySlug(
	content: string,
	slug: string,
): MarkdownSectionSlice | undefined {
	const headingPattern = new RegExp(
		`^(#{1,6}\\s.+\\{\\/\\*${escapeRegExp(slug)}\\*\\/\\})\\s*$`,
		"m",
	);
	const headingMatch = headingPattern.exec(content);

	if (headingMatch?.index === undefined) {
		return undefined;
	}

	const headingLine = headingMatch[1];

	if (!headingLine) {
		return undefined;
	}

	const headingLevelMatch = /^(#+)/.exec(headingLine);
	const headingLevel = headingLevelMatch?.[1]?.length ?? 1;
	const sectionStart = headingMatch.index;
	const bodyStart = sectionStart + headingMatch[0].length;
	const boundaryPattern = new RegExp(`^#{1,${headingLevel}}\\s`, "m");
	const rest = content.slice(bodyStart);
	const boundaryMatch = boundaryPattern.exec(rest);
	const sectionEnd = boundaryMatch ? bodyStart + boundaryMatch.index : content.length;

	return {
		prefix: content.slice(0, sectionStart),
		section: content.slice(sectionStart, sectionEnd),
		suffix: content.slice(sectionEnd),
	};
}

/**
 * Replaces a markdown section identified by slug comment on its heading line.
 *
 * @param content Full markdown document
 * @param slug JSX slug comment value without braces
 * @param newSection Replacement section including its heading line
 *
 * @returns Updated document, or `undefined` when the slug heading is not found
 */
export function replaceMarkdownSectionBySlug(
	content: string,
	slug: string,
	newSection: string,
): string | undefined {
	const slice = extractMarkdownSectionBySlug(content, slug);

	if (!slice) {
		return undefined;
	}

	const normalizedSection = newSection.endsWith("\n") ? newSection : `${newSection}\n`;

	return `${slice.prefix}${normalizedSection}${slice.suffix}`;
}

/**
 * Returns the first slug comment value from text when present.
 *
 * @param text Maintainer comment or heading line
 *
 * @returns Slug string, or `undefined` when no slug comment is present
 */
export function extractFirstHeadingSlug(text: string): string | undefined {
	return /\{\/\*([^*]+)\*\/\}/.exec(text)?.[1];
}

/**
 * Escapes a string for safe use inside a `RegExp`.
 *
 * @param value Raw slug or path fragment
 *
 * @returns Escaped string for interpolation into a regex pattern
 */
function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
