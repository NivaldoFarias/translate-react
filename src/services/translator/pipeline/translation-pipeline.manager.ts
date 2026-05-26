import type { TranslationFile } from "../translation-file";
import type { TranslationValidationIssue } from "../validation/validation.types";

import type { TranslationAttemptContext } from "./translation-attempt.context";

import type { ApplicationError } from "@/errors";

import { TRANSLATION_VALIDATION_MAX_ATTEMPTS } from "../validation/validation.constants";
import {
	emptyTranslationAttemptContext,
	translationAttemptContextFromHints,
} from "./translation-attempt.context";

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
}

/**
 * Orchestrates translate → assemble → validate → retry with accumulated guard hints.
 */
export class TranslationPipelineManager {
	/**
	 * @param maxAttempts Maximum full-document attempts including the first try
	 */
	constructor(
		private readonly maxAttempts: number = TRANSLATION_VALIDATION_MAX_ATTEMPTS,
	) {}

	/**
	 * Runs the validation retry loop until guards pass or attempts are exhausted.
	 *
	 * @param params Pipeline callbacks and the source file for logging
	 *
	 * @returns Assembled translated document that passed all guards
	 */
	public async translateWithValidationRetries(params: TranslationPipelineRunParams) {
		const { file, translateBody, finalizeTranslation, collectIssues, createFailedError } =
			params;

		let attemptContext = emptyTranslationAttemptContext();
		let translatedContent = "";

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

		return translatedContent;
	}
}
