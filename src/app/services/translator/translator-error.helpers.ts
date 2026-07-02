import { StatusCodes } from "http-status-codes";
import { APIError } from "openai/error";
import { AbortError } from "p-retry";

import { isOpenRouterDailyFreeModelQuotaError } from "@/app/utils/llm-rate-limit.util";
import { ApplicationError, isSegmentBatchSplittableError } from "@/shared/errors/";

/**
 * Returns whether a segment translation failure should fall back to legacy full-body translation.
 *
 * Auth, quota, and non-splittable {@link ApplicationError} failures propagate instead of retrying
 * via the legacy path.
 *
 * @param error Caught rejection from segment batch translation
 *
 * @returns `true` when legacy full-body or chunked translation may recover
 */
export function isSegmentTranslationLegacyFallbackEligible(error: unknown) {
	if (error instanceof AbortError) {
		return isSegmentTranslationLegacyFallbackEligible(error.originalError);
	}

	if (error instanceof APIError) {
		if (
			error.status === StatusCodes.UNAUTHORIZED ||
			error.status === StatusCodes.BAD_REQUEST ||
			isOpenRouterDailyFreeModelQuotaError(error)
		) {
			return false;
		}
	}

	if (error instanceof ApplicationError) {
		return isSegmentBatchSplittableError(error);
	}

	return true;
}
