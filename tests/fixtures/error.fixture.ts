import { StatusCodes } from "http-status-codes";
import { APIError } from "openai";

/**
 * Creates a fixture for an API error
 *
 * @param overrides The overrides for the API error
 *
 * @returns The fixture for the API error
 */
export function createOpenAIApiErrorFixture<
	TStatus extends number | undefined = number | undefined,
	THeaders extends Headers | undefined = Headers | undefined,
	TError extends object | undefined = object | undefined,
>(overrides: {
	status?: TStatus;
	error?: TError;
	message?: string;
	headers?: THeaders;
}): APIError<TStatus, THeaders, TError> {
	return new APIError<TStatus, THeaders, TError>(
		overrides.status ?? (StatusCodes.INTERNAL_SERVER_ERROR as TStatus),
		overrides.error ?? ({ message: "Internal server error" } as TError),
		overrides.message ?? "Internal server error",
		new Headers(overrides.headers ?? {}) as THeaders,
	);
}
