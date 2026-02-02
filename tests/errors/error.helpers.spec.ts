import { describe, expect, mock, test } from "bun:test";
import { StatusCodes } from "http-status-codes";

import { ApplicationError, ErrorCode, handleTopLevelError } from "@/errors/";

import { createOctokitRequestErrorFixture, createOpenAIApiErrorFixture } from "@tests/fixtures";

describe("handleTopLevelError", () => {
	test("logs ApplicationError with displayMessage", () => {
		const fatalMock = mock((): void => undefined);
		const logger = { fatal: fatalMock, child: () => ({ fatal: fatalMock }) };

		const error = new ApplicationError(
			"Workflow failed",
			ErrorCode.TranslationFailed,
			"Test.operation",
			{ key: "value" },
		);

		handleTopLevelError(error, logger as never);

		expect(fatalMock).toHaveBeenCalledTimes(1);
		expect(fatalMock).toHaveBeenCalledWith(
			expect.objectContaining({
				errorCode: ErrorCode.TranslationFailed,
				operation: "Test.operation",
				message: "Workflow failed",
				metadata: { key: "value" },
			}),
			expect.stringContaining("Workflow failed"),
		);
	});

	test("logs RequestError with GitHub context", () => {
		const fatalMock = mock((): void => undefined);
		const logger = { fatal: fatalMock, child: () => ({ fatal: fatalMock }) };

		const error = createOctokitRequestErrorFixture({
			message: "Not Found",
			status: StatusCodes.NOT_FOUND,
			options: {
				request: { url: "https://api.github.com/repos/x/y" },
				response: { headers: { "x-github-request-id": "req-123" } },
			},
		});

		handleTopLevelError(error, logger as never);

		expect(fatalMock).toHaveBeenCalledTimes(1);
		expect(fatalMock).toHaveBeenCalledWith(
			expect.objectContaining({
				errorType: ErrorCode.OctokitRequestError,
				statusCode: StatusCodes.NOT_FOUND,
				message: "Not Found",
			}),
			expect.stringContaining("Not Found"),
		);
	});

	test("logs APIError with LLM context", () => {
		const fatalMock = mock(() => {
			/* empty */
		});
		const logger = { fatal: fatalMock, child: () => ({ fatal: fatalMock }) };

		const error = createOpenAIApiErrorFixture({
			message: "Rate limit exceeded",
			error: { type: "rate_limit_error" },
			status: StatusCodes.TOO_MANY_REQUESTS,
			headers: new Headers({ "x-request-id": "req-llm-456" }),
		});

		handleTopLevelError(error, logger as never);

		expect(fatalMock).toHaveBeenCalledTimes(1);
		expect(fatalMock).toHaveBeenCalledWith(
			expect.objectContaining({
				errorType: ErrorCode.OpenAIApiError,
				statusCode: StatusCodes.TOO_MANY_REQUESTS,
			}),
			expect.stringContaining("LLM API error"),
		);
	});

	test("logs generic Error with stack", () => {
		const fatalMock = mock(() => {
			/* empty */
		});
		const logger = { fatal: fatalMock, child: () => ({ fatal: fatalMock }) };

		const error = new Error("Unexpected failure");

		handleTopLevelError(error, logger as never);

		expect(fatalMock).toHaveBeenCalledTimes(1);
		expect(fatalMock).toHaveBeenCalledWith(
			expect.objectContaining({
				errorType: ErrorCode.UnknownError,
				message: "Unexpected failure",
			}),
			expect.stringContaining("Unexpected failure"),
		);
	});

	test("logs non-Error with String(error)", () => {
		const fatalMock = mock(() => {
			/* empty */
		});
		const logger = { fatal: fatalMock, child: () => ({ fatal: fatalMock }) };

		handleTopLevelError("plain string error", logger as never);

		expect(fatalMock).toHaveBeenCalledTimes(1);
		expect(fatalMock).toHaveBeenCalledWith(
			expect.objectContaining({
				errorType: ErrorCode.UnknownError,
				error: "plain string error",
			}),
			expect.stringContaining("plain string error"),
		);
	});
});
