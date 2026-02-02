import { RequestError } from "@octokit/request-error";
import { StatusCodes } from "http-status-codes";
import { APIError } from "openai";

import type { RequestErrorOptions } from "node_modules/@octokit/request-error/dist-types/types";
import type { PartialDeep } from "type-fest";

/**
 * Creates a fixture for an {@link APIError} from OpenAI
 *
 * @param overrides The overrides for the APIError
 *
 * @returns The fixture for the APIError
 */
export function createOpenAIApiErrorFixture<
	TStatus extends number | undefined = number | undefined,
	THeaders extends Headers | undefined = Headers | undefined,
	TError extends object | undefined = object | undefined,
>(overrides?: {
	status?: TStatus;
	error?: TError;
	message?: string;
	headers?: THeaders;
}): APIError<TStatus, THeaders, TError> {
	return new APIError<TStatus, THeaders, TError>(
		overrides?.status ?? (StatusCodes.INTERNAL_SERVER_ERROR as TStatus),
		overrides?.error ?? ({ message: "Internal server error" } as TError),
		overrides?.message ?? "Internal server error",
		overrides?.headers ?? (new Headers() as THeaders),
	);
}

/**
 * Creates a fixture for an Octokit's {@link RequestError}
 *
 * Defaults to a `500` Internal Server Error.
 *
 * @param overrides The overrides for the Octokit RequestError
 *
 * @returns The fixture for the Octokit RequestError
 */
export function createOctokitRequestErrorFixture(overrides?: {
	status?: number;
	message?: string;
	options?: PartialDeep<RequestErrorOptions>;
}): RequestError {
	return new RequestError(
		overrides?.message ?? "Internal server error",
		overrides?.status ?? StatusCodes.INTERNAL_SERVER_ERROR,
		{
			request: {
				method: overrides?.options?.request?.method ?? "GET",
				url: overrides?.options?.request?.url ?? "https://api.github.com/repos/test/test",
				headers: overrides?.options?.request?.headers ?? {},
			},
			response: {
				status: overrides?.options?.response?.status ?? StatusCodes.INTERNAL_SERVER_ERROR,
				url: overrides?.options?.response?.url ?? "https://api.github.com/repos/test/test",
				headers: overrides?.options?.response?.headers ?? {},
				data: overrides?.options?.response?.data ?? {},
			},
			cause: overrides?.options?.cause ?? new Error("Internal server error").cause,
		} as RequestErrorOptions,
	);
}
