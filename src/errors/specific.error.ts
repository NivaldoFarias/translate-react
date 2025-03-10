import type { ErrorContext } from "./base.error";

import { ErrorCodes, TranslateError } from "./base.error";

/** Thrown when the translation service fails to initialize */
export class InitializationError extends TranslateError {
	/**
	 * Creates a new InitializationError instance
	 *
	 * @param message The error message
	 * @param context The error context
	 */
	constructor(message: string, context?: Partial<ErrorContext>) {
		super(message, ErrorCodes.INITIALIZATION_ERROR, context);
	}
}

/** Thrown when a required translation key is missing */
export class MissingKeyError extends TranslateError {
	/**
	 * Creates a new MissingKeyError instance
	 *
	 * @param key The missing translation key
	 * @param context The error context
	 */
	constructor(key: string, context?: Partial<ErrorContext>) {
		super(`Translation key "${key}" not found`, ErrorCodes.MISSING_KEY, context);
	}
}

/** Thrown when an unsupported language is requested */
export class UnsupportedLanguageError extends TranslateError {
	/**
	 * Creates a new UnsupportedLanguageError instance
	 *
	 * @param language The unsupported language
	 * @param context The error context
	 */
	constructor(language: string, context?: Partial<ErrorContext>) {
		super(`Language "${language}" is not supported`, ErrorCodes.UNSUPPORTED_LANG, context);
	}
}

/** Thrown when loading translation resources fails */
export class ResourceLoadError extends TranslateError {
	/**
	 * Creates a new ResourceLoadError instance
	 *
	 * @param resource The failed resource
	 * @param context The error context
	 */
	constructor(resource: string, context?: Partial<ErrorContext>) {
		super(
			`Failed to load translation resource "${resource}"`,
			ErrorCodes.RESOURCE_LOAD_ERROR,
			context,
		);
	}
}

/** Thrown when API requests fail */
export class APIError extends TranslateError {
	/**
	 * Creates a new APIError instance
	 *
	 * @param endpoint The failed API endpoint
	 * @param statusCode The HTTP status code
	 * @param context The error context
	 */
	constructor(endpoint: string, statusCode: number, context?: Partial<ErrorContext>) {
		super(
			`API request to "${endpoint}" failed with status ${statusCode}`,
			ErrorCodes.API_ERROR,
			context,
		);
	}
}

/** Thrown when validation fails */
export class ValidationError extends TranslateError {
	/**
	 * Creates a new ValidationError instance
	 *
	 * @param message The error message
	 * @param context The error context
	 */
	constructor(message: string, context?: Partial<ErrorContext>) {
		super(message, ErrorCodes.VALIDATION_ERROR, context);
	}
}
