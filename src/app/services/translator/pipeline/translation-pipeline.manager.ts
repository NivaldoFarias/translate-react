import type { ReviewerValidationNotice } from "@/app/services/github/types";
import type { ApplicationError } from "@/shared/errors";

import type { TranslationFile } from "../translation-file";
import type { TranslationValidationIssue } from "../validation/validation.types";

import type { TranslationAttemptContext } from "./translation-attempt.context";

import { partitionPostTranslationValidationIssues } from "../validation/validation-outcome.util";

import { emptyTranslationAttemptContext } from "./translation-attempt.context";

/** Result from a single validated translation pass */
export interface TranslationPipelineResult {
	/** The translated content after one LLM pass and assembly */
	content: string;

	/** Advisory guard hints for maintainers when mechanical checks failed (empty if clean) */
	reviewerNotices: readonly ReviewerValidationNotice[];
}

/** Dependencies for one validated translation pass (single LLM attempt) */
export interface TranslationPipelineRunParams {
	/** Original file whose full document is validated after assembly */
	file: TranslationFile;

	/** Translates markdown body (single-shot or chunked) using attempt context hints */
	translateBody: (attemptContext: TranslationAttemptContext) => Promise<string>;

	/** Restores masks, strips artifacts, and merges frontmatter into the full document */
	finalizeTranslation: (bodyTranslation: string) => Promise<string>;

	/** Runs post-translation guards on the assembled document */
	collectIssues: (translatedContent: string) => TranslationValidationIssue[];

	/** Builds the error thrown when blocking guards fail */
	createFailedError: (
		translatedContent: string,
		issues: TranslationValidationIssue[],
	) => ApplicationError;

	/** Attempt context for the translation try (e.g. maintainer feedback hints) */
	initialAttemptContext?: TranslationAttemptContext;
}

/**
 * Orchestrates translate → assemble → validate once; ships with advisory hints when only mechanical guards fail.
 */
export class TranslationPipelineManager {
	/**
	 * Runs a single translation attempt and partitions validation into blocking vs advisory outcomes.
	 *
	 * @param params Pipeline callbacks and the source file for logging
	 *
	 * @returns Result with translated content and optional reviewer notices
	 *
	 * @throws {ApplicationError} When blocking guards (`contentRatio`, `nonEmptyContent`) fail
	 */
	public async translateWithValidation(
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

		const bodyTranslation = await translateBody(initialAttemptContext);
		const translatedContent = await finalizeTranslation(bodyTranslation);
		const validationIssues = collectIssues(translatedContent);
		const { blocking, advisory } = partitionPostTranslationValidationIssues(validationIssues);

		file.logger.debug(
			{
				blockingGuardIds: blocking.map((issue) => issue.guardId),
				advisoryGuardIds: advisory.map((notice) => notice.guardId),
				validationIssues,
			},
			"Post-translation validation partitioned",
		);

		if (blocking.length > 0) {
			throw createFailedError(translatedContent, validationIssues);
		}

		if (advisory.length > 0) {
			file.logger.warn(
				{ guardIds: advisory.map((notice) => notice.guardId) },
				"Post-translation advisory guards failed; shipping with reviewer hints",
			);
		}

		return { content: translatedContent, reviewerNotices: advisory };
	}
}
