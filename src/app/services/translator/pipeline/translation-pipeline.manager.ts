import type { ApplicationError } from "@/shared/errors";

import type { TranslationFile } from "../translation-file";
import type {
	TranslationRetryInfo,
	TranslationValidationIssue,
} from "../validation/validation.types";

import type { TranslationAttemptContext } from "./translation-attempt.context";

import { TRANSLATION_VALIDATION_MAX_ATTEMPTS } from "../validation/validation.constants";

import {
	emptyTranslationAttemptContext,
	translationAttemptContextFromHints,
} from "./translation-attempt.context";

/** Result from the translation pipeline with retry metadata */
export interface TranslationPipelineResult {
	/** The translated content that passed all validation guards */
	content: string;

	/** Retries that occurred during validation (empty if translation passed on first attempt) */
	retries: readonly TranslationRetryInfo[];
}

/** Dependencies for one validated translation pass with optional LLM retries */
export interface TranslationPipelineRunParams {
	/** Original file whose full document is validated after assembly */
	file: TranslationFile;

	/** Translates markdown body (single-shot or chunked) using attempt context hints */
	translateBody: (attemptContext: TranslationAttemptContext) => Promise<string>;

	/** Restores masks, strips artifacts, and merges frontmatter into the full document */
	finalizeTranslation: (bodyTranslation: string) => Promise<string>;

	/** Runs post-translation guards on the assembled document */
	collectIssues: (translatedContent: string) => TranslationValidationIssue[];

	/** Builds the error thrown after the final failed attempt */
	createFailedError: (
		translatedContent: string,
		issues: TranslationValidationIssue[],
	) => ApplicationError;

	/** Attempt context for the first translation try (e.g. maintainer feedback hints) */
	initialAttemptContext?: TranslationAttemptContext;
}

/**
 * Orchestrates translate → assemble → validate → retry with accumulated guard hints.
 */
export class TranslationPipelineManager {
	/**
	 * @param maxAttempts Maximum full-document attempts including the first try
	 */
	constructor(private readonly maxAttempts: number = TRANSLATION_VALIDATION_MAX_ATTEMPTS) {}

	/**
	 * Runs the validation retry loop until guards pass or attempts are exhausted.
	 *
	 * @param params Pipeline callbacks and the source file for logging
	 *
	 * @returns Result with translated content and retry metadata
	 */
	public async translateWithValidationRetries(
		params: TranslationPipelineRunParams,
	): Promise<TranslationPipelineResult> {
		const {
			file,
			translateBody,
			finalizeTranslation,
			collectIssues,
			createFailedError,
			initialAttemptContext = emptyTranslationAttemptContext(),
		} = params;

		let attemptContext = initialAttemptContext;
		let translatedContent = "";
		const retries: TranslationRetryInfo[] = [];

		for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
			const bodyTranslation = await translateBody(attemptContext);
			translatedContent = await finalizeTranslation(bodyTranslation);

			const validationIssues = collectIssues(translatedContent);

			if (validationIssues.length === 0) {
				break;
			}

			if (attempt >= this.maxAttempts) {
				throw createFailedError(translatedContent, validationIssues);
			}

			for (const issue of validationIssues) {
				retries.push({ guardId: issue.guardId, message: issue.message });
			}

			attemptContext = translationAttemptContextFromHints(
				validationIssues.map((issue) => issue.retryHint),
			);

			file.logger.warn(
				{
					attempt,
					maxAttempts: this.maxAttempts,
					guardIds: validationIssues.map((issue) => issue.guardId),
				},
				"Post-translation validation failed; retrying with guard hints",
			);
		}

		return { content: translatedContent, retries };
	}
}
