import type { ParsedContent } from "../types";

/**
 * Parses file content to identify and extract repeated code blocks.
 * This function looks for markdown code blocks (```...```) and other repeated content,
 * replacing them with placeholders and storing the unique blocks separately.
 *
 * @param content The raw file content to parse
 * @returns An object containing the parsed content and the unique blocks
 */
export function parseContent(content: string) {
	const blocks = new Map<string, string>();
	const codeBlockRegex = /```[\s\S]*?```/g;
	const seenBlocks = new Map<string, string>();
	let parsedContent = content;
	let blockCounter = 0;

	// Find all code blocks and replace them with placeholders
	parsedContent = parsedContent.replace(codeBlockRegex, (match) => {
		// Check if we've seen this block before
		const existingId = seenBlocks.get(match);
		if (existingId) {
			return `{{BLOCK_${existingId}}}`;
		}

		// Create new block ID
		const blockId = `${blockCounter++}`;
		seenBlocks.set(match, blockId);
		blocks.set(blockId, match);
		return `{{BLOCK_${blockId}}}`;
	});

	// Create a list of unique blocks for translation
	const uniqueBlocksForTranslation = Array.from(blocks.entries())
		.map(([id, content]) => `BLOCK ${id}:\n${content}`)
		.join("\n\n");

	return {
		content: parsedContent,
		blocks,
		uniqueBlocksForTranslation,
	} satisfies ParsedContent;
}

/**
 * Reconstructs the original content from a parsed content object
 * by replacing placeholders with their corresponding blocks.
 *
 * @param parsedContent The parsed content object to reconstruct
 * @returns The original content
 */
export function reconstructContent(parsedContent: ParsedContent) {
	let content = parsedContent.content;

	for (const [blockId, blockContent] of parsedContent.blocks.entries()) {
		content = content.replace(new RegExp(`{{BLOCK_${blockId}}}`, "g"), blockContent);
	}

	return content;
}
