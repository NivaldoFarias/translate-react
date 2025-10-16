import { RequestError } from "@octokit/request-error";

import { ErrorCode, ErrorSeverity, TranslationError } from "@/errors/";

export abstract class ErrorHelper {
	/**
	 * Maps {@link RequestError} to appropriate {@link TranslationError} with context.
	 *
	 * @param error The error to map
	 * @param context Additional context to include in the error
	 *
	 * @returns A {@link TranslationError} with appropriate code and context
	 */
	abstract mapError(
		error: unknown,
		context: {
			operation: string;
			metadata?: Record<string, unknown>;
		},
	): TranslationError;

	/**
	 * Determines the appropriate {@link ErrorCode} based on HTTP status code.
	 *
	 * @param error The {@link RequestError} from Octokit
	 *
	 * @returns The appropriate {@link ErrorCode}
	 */
	abstract getErrorCodeFromStatus(error: RequestError): ErrorCode;

	/**
	 * Maps {@link ErrorCode} to appropriate {@link ErrorSeverity} for operations
	 *
	 * @param code The error code to map
	 *
	 * @returns The appropriate {@link ErrorSeverity}
	 */
	abstract getSeverityFromCode(code: ErrorCode): ErrorSeverity;
}
