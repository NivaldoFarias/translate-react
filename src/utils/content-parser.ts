/**
 * # Content Parser Module
 *
 * Provides utilities for parsing and reconstructing content with special handling for code blocks.
 * Helps in managing repeated content and maintaining content structure during translation.
 */

import type { ParsedContent } from "../types";

/**
 * # Content Parser
 *
 * Parses file content to identify and extract repeated code blocks.
 *
 * ## Workflow
 * 1. Identifies markdown code blocks using regex
 * 2. Replaces repeated blocks with unique placeholders
 * 3. Stores unique blocks in a map
 * 4. Creates a formatted string of unique blocks for translation
 *
 * ## Example
 * ```markdown
 * Original:
 * Here's some code:
 * ```js
 * console.log("hello");
 * ```
 * And here's the same code again:
 * ```js
 * console.log("hello");
 * ```
 *
 * Becomes:
 * Here's some code: {{BLOCK_0}}
 * And here's the same code again: {{BLOCK_0}}
 * ```
 *
 * @param content - Raw file content to parse
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
 * # Content Reconstructor
 *
 * Reconstructs the original content by replacing placeholders with their corresponding blocks.
 *
 * ## Workflow
 * 1. Takes parsed content with placeholders
 * 2. Iterates through stored blocks
 * 3. Replaces each placeholder with its original content
 * 4. Returns fully reconstructed content
 *
 * @param parsedContent - Parsed content object containing placeholders and block mappings
 */
export function reconstructContent(parsedContent: ParsedContent) {
	let content = parsedContent.content;

	for (const [blockId, blockContent] of parsedContent.blocks.entries()) {
		content = content.replace(new RegExp(`{{BLOCK_${blockId}}}`, "g"), blockContent);
	}

	return content;
}
