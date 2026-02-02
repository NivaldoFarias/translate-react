import type { StatusCodes } from "http-status-codes";

/** Standardized error codes for the translation workflow */
export enum ErrorCode {
	// Domain Workflow Errors
	TranslationFailed = "TRANSLATION_FAILED",
	ChunkProcessingFailed = "CHUNK_PROCESSING_FAILED",
	NoFilesToTranslate = "NO_FILES_TO_TRANSLATE",
	BelowMinimumSuccessRate = "BELOW_MINIMUM_SUCCESS_RATE",
	NoContent = "NO_CONTENT",

	// Domain Validation Errors
	FormatValidationFailed = "FORMAT_VALIDATION_FAILED",
	LanguageCodeNotSupported = "LANGUAGE_CODE_NOT_SUPPORTED",
	InsufficientPermissions = "INSUFFICIENT_PERMISSIONS",

	// Domain Initialization Errors
	InitializationError = "INITIALIZATION_ERROR",
	ResourceLoadError = "RESOURCE_LOAD_ERROR",

	// External API Errors
	OpenAIApiError = "OPENAI_API_ERROR",
	OctokitRequestError = "OCTOKIT_REQUEST_ERROR",

	// Fallback
	UnknownError = "UNKNOWN_ERROR",
}

/**
 * Base error class for all translation-related errors.
 *
 * Provides standardized error handling with error codes and optional metadata.
 *
 * @template T Type of the metadata object
 */
export class ApplicationError<
	T extends Record<string, unknown> = Record<string, unknown>,
> extends Error {
	/** Standardized error code */
	public readonly code: ErrorCode;

	/** The operation that failed */
	public readonly operation: string;

	/** Additional metadata for debugging */
	public readonly metadata?: T;

	/** HTTP status code associated with the error */
	public readonly statusCode?: StatusCodes;

	/**
	 * Creates a new {@link ApplicationError} instance
	 *
	 * @param message Human-readable error message
	 * @param code Standardized error code
	 * @param operation The operation that failed
	 * @param metadata Additional metadata for debugging
	 * @param statusCode HTTP status code associated with the error
	 */
	constructor(
		message: string,
		code: ErrorCode = ErrorCode.UnknownError,
		operation?: string,
		metadata?: T,
		statusCode?: StatusCodes,
	) {
		super(message);
		this.name = this.constructor.name;
		this.code = code;
		this.operation = operation ?? "UnknownOperation";
		this.metadata = metadata;
		this.statusCode = statusCode;

		Object.setPrototypeOf(this, new.target.prototype);
	}

	/** Extracts a human-readable message from the error */
	public get displayMessage(): string {
		const operationSuffix = this.operation ? ` (in ${this.operation})` : "";

		return `${this.message}${operationSuffix}`;
	}
}

/**
 * Extracts a human-readable error message from various error types.
 *
 * @param error The error to extract a message from
 *
 * @returns Human-readable error message
 */
export function extractErrorMessage(error: unknown): string {
	if (error instanceof ApplicationError) return error.displayMessage;
	if (error instanceof Error) return error.message;

	return String(error);
}
