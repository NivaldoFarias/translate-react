import { ApplicationError, ErrorCode } from "./base-error";

/**
 * Creates an error for service initialization failures.
 *
 * @param message Description of initialization failure
 * @param operation The operation that failed
 * @param metadata Additional debugging context
 */
export function createInitializationError(
	message: string,
	operation?: string,
	metadata?: Record<string, unknown>,
): ApplicationError {
	return new ApplicationError(message, ErrorCode.InitializationError, operation, metadata);
}

/**
 * Creates an error for resource loading failures.
 *
 * @param resource Name of the resource that failed to load
 * @param operation The operation that failed
 * @param metadata Additional debugging context
 */
export function createResourceLoadError(
	resource: string,
	operation?: string,
	metadata?: Record<string, unknown>,
): ApplicationError {
	return new ApplicationError(
		`Failed to load translation resource "${resource}"`,
		ErrorCode.ResourceLoadError,
		operation,
		metadata,
	);
}

/**
 * Creates an error for empty or missing file content.
 *
 * @param filename Name of the file with empty content
 * @param operation The operation that failed
 * @param metadata Additional debugging context
 */
export function createEmptyContentError(
	filename: string,
	operation?: string,
	metadata?: Record<string, unknown>,
): ApplicationError {
	return new ApplicationError(
		`File content is empty: ${filename}`,
		ErrorCode.NoContent,
		operation,
		metadata,
	);
}

/**
 * Creates an error for translation validation failures.
 *
 * @param message Description of the validation failure
 * @param filename Name of the file being validated
 * @param operation The operation that failed
 * @param metadata Additional debugging context
 */
export function createTranslationValidationError(
	message: string,
	filename: string,
	operation?: string,
	metadata?: Record<string, unknown>,
): ApplicationError {
	return new ApplicationError(
		`Translation validation failed for ${filename}: ${message}`,
		ErrorCode.FormatValidationFailed,
		operation,
		metadata,
	);
}

/**
 * Creates an error for chunk processing failures during translation.
 *
 * @param message Description of the chunk processing failure
 * @param operation The operation that failed
 * @param metadata Additional debugging context (e.g., chunkIndex, totalChunks)
 */
export function createChunkProcessingError(
	message: string,
	operation?: string,
	metadata?: Record<string, unknown>,
): ApplicationError {
	return new ApplicationError(message, ErrorCode.ChunkProcessingFailed, operation, metadata);
}
