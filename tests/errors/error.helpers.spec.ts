import { describe, expect, mock, test } from "bun:test";
import { StatusCodes } from "http-status-codes";
import { AbortError } from "p-retry";

import {
	ApplicationError,
	ErrorCode,
	getSegmentBatchSplitReason,
	handleTopLevelError,
	isCompletionLengthTruncationError,
	isSegmentBatchIdMismatchError,
	isSegmentBatchSplittableError,
	isSegmentBatchStructuredOutputError,
	toSafeErrorLogFields,
} from "@/shared/errors/";

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

describe("isSegmentBatchIdMismatchError", () => {
	test("returns true for segment batch id mismatch ApplicationError", () => {
		const error = new ApplicationError(
			"Segment batch response ids do not match requested segments",
			ErrorCode.TranslationFailed,
			"TranslationLlmClient.callLanguageModelSegmentBatch",
		);

		expect(isSegmentBatchIdMismatchError(error)).toBe(true);
	});

	test("returns true when wrapped in AbortError", () => {
		const inner = new ApplicationError(
			"Segment batch response ids do not match requested segments",
			ErrorCode.TranslationFailed,
			"TranslationLlmClient.callLanguageModelSegmentBatch",
		);

		expect(isSegmentBatchIdMismatchError(new AbortError(inner))).toBe(true);
	});

	test("returns false for JSON parse failure", () => {
		const error = new ApplicationError(
			"Segment batch response was not valid JSON",
			ErrorCode.TranslationFailed,
			"TranslationLlmClient.callLanguageModelSegmentBatch",
		);

		expect(isSegmentBatchIdMismatchError(error)).toBe(false);
	});

	test("returns false for non-ApplicationError", () => {
		expect(isSegmentBatchIdMismatchError(new Error("random"))).toBe(false);
	});
});

describe("isCompletionLengthTruncationError", () => {
	test("returns true for truncated-output ApplicationError", () => {
		const error = new ApplicationError(
			"Language model response ended at max completion tokens (truncated output)",
			ErrorCode.TranslationFailed,
			"TranslationLlmClient.callLanguageModel",
		);

		expect(isCompletionLengthTruncationError(error)).toBe(true);
	});

	test("returns true when wrapped in AbortError", () => {
		const inner = new ApplicationError(
			"Language model response ended at max completion tokens (truncated output)",
			ErrorCode.TranslationFailed,
			"TranslationLlmClient.callLanguageModel",
		);

		expect(isCompletionLengthTruncationError(new AbortError(inner))).toBe(true);
	});

	test("returns false for id mismatch error", () => {
		const error = new ApplicationError(
			"Segment batch response ids do not match requested segments",
			ErrorCode.TranslationFailed,
			"TranslationLlmClient.callLanguageModelSegmentBatch",
		);

		expect(isCompletionLengthTruncationError(error)).toBe(false);
	});

	test("returns false for non-ApplicationError", () => {
		expect(isCompletionLengthTruncationError(new Error("generic failure"))).toBe(false);
	});

	test("returns false for null", () => {
		expect(isCompletionLengthTruncationError(null)).toBe(false);
	});
});

describe("isSegmentBatchStructuredOutputError", () => {
	test.each([
		"Segment batch response was not valid JSON",
		"Segment batch response failed schema validation",
	])("returns true for '%s'", (message) => {
		const error = new ApplicationError(
			message,
			ErrorCode.TranslationFailed,
			"TranslationLlmClient.callLanguageModelSegmentBatch",
		);

		expect(isSegmentBatchStructuredOutputError(error)).toBe(true);
	});

	test("returns true when wrapped in AbortError", () => {
		const inner = new ApplicationError(
			"Segment batch response was not valid JSON",
			ErrorCode.TranslationFailed,
			"TranslationLlmClient.callLanguageModelSegmentBatch",
		);

		expect(isSegmentBatchStructuredOutputError(new AbortError(inner))).toBe(true);
	});

	test("returns false for id mismatch error", () => {
		const error = new ApplicationError(
			"Segment batch response ids do not match requested segments",
			ErrorCode.TranslationFailed,
			"TranslationLlmClient.callLanguageModelSegmentBatch",
		);

		expect(isSegmentBatchStructuredOutputError(error)).toBe(false);
	});

	test("returns false for truncation error", () => {
		const error = new ApplicationError(
			"Language model response ended at max completion tokens (truncated output)",
			ErrorCode.TranslationFailed,
			"TranslationLlmClient.callLanguageModel",
		);

		expect(isSegmentBatchStructuredOutputError(error)).toBe(false);
	});

	test("returns false for non-TranslationFailed error code", () => {
		const error = new ApplicationError(
			"Segment batch response was not valid JSON",
			ErrorCode.NoContent,
			"TranslationLlmClient.callLanguageModelSegmentBatch",
		);

		expect(isSegmentBatchStructuredOutputError(error)).toBe(false);
	});

	test("returns false for non-ApplicationError", () => {
		expect(isSegmentBatchStructuredOutputError(new SyntaxError("bad json"))).toBe(false);
	});

	test("returns false for null", () => {
		expect(isSegmentBatchStructuredOutputError(null)).toBe(false);
	});
});

describe("isSegmentBatchSplittableError", () => {
	test("returns true for truncation, id mismatch, and structured output failures", () => {
		expect(
			isSegmentBatchSplittableError(
				new ApplicationError(
					"Model returned truncated output",
					ErrorCode.TranslationFailed,
					"TranslationLlmClient.callLanguageModelSegmentBatch",
				),
			),
		).toBe(true);
		expect(
			isSegmentBatchSplittableError(
				new ApplicationError(
					"Segment batch response ids do not match requested segments",
					ErrorCode.TranslationFailed,
					"TranslationLlmClient.callLanguageModelSegmentBatch",
				),
			),
		).toBe(true);
		expect(
			isSegmentBatchSplittableError(
				new ApplicationError(
					"Segment batch response was not valid JSON",
					ErrorCode.TranslationFailed,
					"TranslationLlmClient.callLanguageModelSegmentBatch",
				),
			),
		).toBe(true);
	});

	test("returns false for unrelated errors", () => {
		expect(isSegmentBatchSplittableError(new Error("network"))).toBe(false);
	});
});

describe("getSegmentBatchSplitReason", () => {
	test("maps splittable errors to log reasons", () => {
		expect(
			getSegmentBatchSplitReason(
				new ApplicationError(
					"Model returned truncated output",
					ErrorCode.TranslationFailed,
					"TranslationLlmClient.callLanguageModelSegmentBatch",
				),
			),
		).toBe("completion_token_limit");
		expect(
			getSegmentBatchSplitReason(
				new ApplicationError(
					"Segment batch response ids do not match requested segments",
					ErrorCode.TranslationFailed,
					"TranslationLlmClient.callLanguageModelSegmentBatch",
				),
			),
		).toBe("segment_batch_id_mismatch");
		expect(
			getSegmentBatchSplitReason(
				new ApplicationError(
					"Segment batch response failed schema validation",
					ErrorCode.TranslationFailed,
					"TranslationLlmClient.callLanguageModelSegmentBatch",
				),
			),
		).toBe("structured_output_error");
	});
});

describe("toSafeErrorLogFields", () => {
	test("returns code and message for ApplicationError", () => {
		const fields = toSafeErrorLogFields(
			new ApplicationError("Workflow failed", ErrorCode.TranslationFailed, "Test.operation"),
		);

		expect(fields).toEqual({
			message: "Workflow failed",
			name: "ApplicationError",
			code: ErrorCode.TranslationFailed,
		});
	});

	test("returns status and message for Octokit RequestError without request payload", () => {
		const fields = toSafeErrorLogFields(
			createOctokitRequestErrorFixture({
				status: StatusCodes.FORBIDDEN,
				message: "Forbidden",
			}),
		);

		expect(fields).toEqual({
			message: "Forbidden",
			name: "HttpError",
			status: StatusCodes.FORBIDDEN,
		});
		expect(fields).not.toHaveProperty("request");
	});
});
