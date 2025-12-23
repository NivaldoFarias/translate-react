import type { TranslationErrorContext } from "./base-error";

import { ErrorCode, TranslationError } from "./base-error";

/** Thrown when the translation service fails to initialize */
export class InitializationError extends TranslationError {
	constructor(message: string, context?: TranslationErrorContext) {
		super(message, ErrorCode.InitializationError, context);
	}
}

/** Thrown when loading translation resources fails */
export class ResourceLoadError extends TranslationError {
	constructor(resource: string, context?: TranslationErrorContext) {
		super(
			`Failed to load translation resource "${resource}"`,
			ErrorCode.ResourceLoadError,
			context,
		);
	}
}

/** Thrown when content is empty or missing */
export class EmptyContentError extends TranslationError {
	constructor(filename: string, context?: TranslationErrorContext) {
		super(`File content is empty: ${filename}`, ErrorCode.NoContent, context);
	}
}

/** Thrown when translation produces empty or invalid output */
export class TranslationValidationError extends TranslationError {
	constructor(message: string, filename: string, context?: TranslationErrorContext) {
		super(
			`Translation validation failed for ${filename}: ${message}`,
			ErrorCode.FormatValidationFailed,
			context,
		);
	}
}

/** Thrown when chunk processing fails during translation */
export class ChunkProcessingError extends TranslationError {
	constructor(message: string, context?: TranslationErrorContext) {
		super(message, ErrorCode.ChunkProcessingFailed, context);
	}
}
