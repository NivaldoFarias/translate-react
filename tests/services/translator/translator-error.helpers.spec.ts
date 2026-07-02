import { describe, expect, test } from "bun:test";
import { StatusCodes } from "http-status-codes";
import { AbortError } from "p-retry";

import { isSegmentTranslationLegacyFallbackEligible } from "@/app/services/translator/translator-error.helpers";
import { ApplicationError, ErrorCode } from "@/shared/errors/";

import { createOpenAIApiErrorFixture } from "@tests/fixtures";

describe("isSegmentTranslationLegacyFallbackEligible", () => {
	test("returns false for auth and quota API errors", () => {
		expect(
			isSegmentTranslationLegacyFallbackEligible(
				createOpenAIApiErrorFixture({
					status: StatusCodes.UNAUTHORIZED,
					message: "Invalid API key",
				}),
			),
		).toBe(false);
		expect(
			isSegmentTranslationLegacyFallbackEligible(
				createOpenAIApiErrorFixture({
					status: StatusCodes.BAD_REQUEST,
					message: "Bad request",
				}),
			),
		).toBe(false);
	});

	test("returns false for non-splittable ApplicationError", () => {
		const error = new ApplicationError(
			"File content is empty",
			ErrorCode.NoContent,
			"TranslatorService.translateContent",
		);

		expect(isSegmentTranslationLegacyFallbackEligible(error)).toBe(false);
	});

	test("returns true for splittable segment batch ApplicationError", () => {
		const error = new ApplicationError(
			"Segment batch response was not valid JSON",
			ErrorCode.TranslationFailed,
			"TranslationLlmClient.callLanguageModelSegmentBatch",
		);

		expect(isSegmentTranslationLegacyFallbackEligible(error)).toBe(true);
	});

	test("returns true for transient API errors", () => {
		expect(
			isSegmentTranslationLegacyFallbackEligible(
				createOpenAIApiErrorFixture({
					status: StatusCodes.TOO_MANY_REQUESTS,
					message: "Rate limit exceeded",
				}),
			),
		).toBe(true);
	});

	test("unwraps AbortError wrappers", () => {
		const inner = createOpenAIApiErrorFixture({
			status: StatusCodes.UNAUTHORIZED,
			message: "Invalid API key",
		});

		expect(isSegmentTranslationLegacyFallbackEligible(new AbortError(inner))).toBe(false);
	});
});
