import { RequestError } from "@octokit/request-error";

import type { SetRequired } from "type-fest";

import type { ErrorContext } from "@/errors/";

import { ErrorCode, ErrorSeverity, TranslationError } from "@/errors/";

export type MapErrorHelperContext<T extends Record<string, unknown>> = SetRequired<
	Partial<ErrorContext<T>>,
	"operation"
>;

export abstract class ErrorHelper {
	/**
	 * Maps {@link RequestError} to appropriate {@link TranslationError} with context.
	 *
	 * @param error The error to map
	 * @param context Additional context to include in the error
	 *
	 * @returns A {@link TranslationError} with appropriate code and context
	 */
	abstract mapError<T extends Record<string, unknown> = Record<string, unknown>>(
		error: unknown,
		context: MapErrorHelperContext<T>,
	): TranslationError<T>;

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
