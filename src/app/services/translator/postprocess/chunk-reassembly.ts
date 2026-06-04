import type { ChunksToReassemble } from "../chunking/chunks.manager";
import type { TranslationFile } from "../translation-file";

import { ApplicationError, ErrorCode } from "@/shared/errors";

import { MARKDOWN_REGEXES } from "../markdown/markdown.regexes";

/**
 * Validates that all chunks were successfully translated and reassembles them.
 *
 * @param file Original file containing content to validate
 * @param chunks Chunking result containing original and translated chunks along with separators
 *
 * @returns Reassembled translated content
 *
 * @throws {ApplicationError} with {@link ErrorCode.ChunkProcessingFailed} when chunk counts differ
 */
export function validateAndReassembleChunks(file: TranslationFile, chunks: ChunksToReassemble) {
	if (chunks.translated.length !== chunks.original.length) {
		throw new ApplicationError(
			`Chunk count mismatch`,
			ErrorCode.ChunkProcessingFailed,
			`validateAndReassembleChunks`,
			{
				expectedChunks: chunks.original.length,
				actualChunks: chunks.translated.length,
				missingChunks: chunks.original.length - chunks.translated.length,
				contentLength: file.content.length,
				chunkSizes: chunks.original.map((chunk) => chunk.length),
			},
		);
	}

	let reassembledContent = chunks.translated.reduce((accumulator, chunk, index) => {
		return accumulator + chunk + (chunks.separators[index] ?? "");
	}, "");

	const originalEndsWithNewline = file.content.endsWith("\n");
	const translatedEndsWithNewline = reassembledContent.endsWith("\n");

	if (originalEndsWithNewline && !translatedEndsWithNewline) {
		const originalMatch = MARKDOWN_REGEXES.trailingNewlines.exec(file.content);
		const originalTrailingNewlines = originalMatch?.[0] ?? "";
		reassembledContent += originalTrailingNewlines;

		file.logger.debug(
			{ addedTrailingNewlines: originalTrailingNewlines.length },
			"Restored trailing newlines from original content",
		);
	}

	file.logger.debug(
		{
			originalLength: file.content.length,
			reassembledLength: reassembledContent.length,
			compressionRatio: (reassembledContent.length / file.content.length).toFixed(2),
		},
		"Content reassembly completed",
	);

	return reassembledContent;
}
