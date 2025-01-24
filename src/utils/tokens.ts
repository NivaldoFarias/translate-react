import { encoding_for_model } from "tiktoken";

import type { TiktokenModel } from "tiktoken";

/**
 * Utility class for managing text tokens using tiktoken
 */
export class TokenManager {
	private static readonly MAX_TOKENS = 16000; // Leave some room for the prompt
	private static readonly OVERLAP_TOKENS = 100; // Tokens to overlap between chunks for context

	/**
	 * Splits content into chunks that respect the token limit
	 */
	public static splitContentIntoChunks(
		content: string,
		model = import.meta.env.OPENAI_MODEL as TiktokenModel,
	) {
		const encoder = encoding_for_model(model);
		const tokens = encoder.encode(content);

		if (tokens.length <= this.MAX_TOKENS) {
			encoder.free();
			return [content];
		}

		const chunks: string[] = [];
		let currentChunk = new Uint32Array();
		let currentLength = 0;

		for (let i = 0; i < tokens.length; i++) {
			if (currentLength >= this.MAX_TOKENS) {
				// Find a good breaking point (newline or period)
				const text = new TextDecoder().decode(encoder.decode(currentChunk));
				const breakPoint = this.findBreakPoint(text);

				chunks.push(text.slice(0, breakPoint));

				// Start new chunk with overlap
				const overlapStart = Math.max(0, breakPoint - this.OVERLAP_TOKENS);
				const overlapText = text.slice(overlapStart);
				currentChunk = encoder.encode(overlapText);
				currentLength = currentChunk.length;
			}

			const newChunk = new Uint32Array(currentChunk.length + 1);
			newChunk.set(currentChunk);
			newChunk[currentChunk.length] = tokens[i];
			currentChunk = newChunk;
			currentLength++;
		}

		if (currentChunk.length > 0) {
			const finalText = new TextDecoder().decode(encoder.decode(currentChunk));
			chunks.push(finalText);
		}

		encoder.free();
		return chunks;
	}

	/**
	 * Finds a suitable break point in text (prefers paragraph breaks, then sentences)
	 */
	private static findBreakPoint(text: string): number {
		// Try to break at a paragraph
		const lastParagraph = text.lastIndexOf("\n\n");
		if (lastParagraph > text.length * 0.5) {
			return lastParagraph;
		}

		// Try to break at a sentence
		const lastSentence = text.lastIndexOf(". ");
		if (lastSentence > text.length * 0.5) {
			return lastSentence + 1;
		}

		// Fallback to breaking at a space
		const lastSpace = text.lastIndexOf(" ");
		return lastSpace > 0 ? lastSpace : text.length;
	}

	/**
	 * Counts tokens in a string
	 */
	public static countTokens(text: string, model: TiktokenModel = "gpt-4"): number {
		const encoder = encoding_for_model(model);
		const count = encoder.encode(text).length;
		encoder.free();
		return count;
	}
}
