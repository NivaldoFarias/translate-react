import { version } from "@package";

import type { InvalidFilePullRequest, PullRequestDescriptionMetadata } from "@/app/locales/types";
import type { ProcessedFileResult } from "@/app/services/github/types";

import type { RunnerServiceDependencies } from "../runner.types";

import type { TranslationPullRequestValidity } from "./translation-pull-request-validity.manager";

import { PullRequestProgressAction } from "@/app/services/github/types";
import { TranslationFile } from "@/app/services/translator/";
import { env, getTranslationBranchNameFromPath, logger } from "@/app/utils/";

/**
 * Returns the hostname of the configured LLM API base URL for PR metadata.
 *
 * @param baseUrl LLM API base URL from environment
 *
 * @returns Parsed hostname, or the original string when URL parsing fails
 */
function resolveLlmApiHost(baseUrl: string) {
	try {
		return new URL(baseUrl).host;
	} catch {
		return baseUrl;
	}
}

/**
 * Pull request open, reuse, refresh, and description policy for translated files.
 */
export class TranslationPullRequestLifecycleManager {
	private readonly logger = logger.child({
		component: TranslationPullRequestLifecycleManager.name,
	});

	/**
	 * @param services GitHub, locale, and language-detector dependencies
	 * @param invalidPRsByFile Open out-of-sync pull requests keyed by file path
	 */
	constructor(
		private readonly services: RunnerServiceDependencies,
		private readonly invalidPRsByFile: Map<string, InvalidFilePullRequest>,
	) {}

	/**
	 * Opens a new upstream pull request for a freshly reset translation branch.
	 *
	 * @param file Translation file being processed
	 * @param processingResult Processing metadata including translation and timing
	 * @param validity Pull request validity evaluated at the start of file processing
	 *
	 * @returns Pull request metadata for progress reporting
	 */
	public async openTranslationPullRequest(
		file: TranslationFile,
		processingResult: ProcessedFileResult,
		validity: TranslationPullRequestValidity,
	): Promise<{
		pullRequest: NonNullable<ProcessedFileResult["pullRequest"]>;
		progress: PullRequestProgressAction;
	}> {
		if (validity.pullRequest && validity.invalidReason === "out_of_sync") {
			const languageName = this.services.languageDetector.getLanguageName(
				this.services.languageDetector.languages.target,
			);
			const body = this.createPullRequestDescription(file, processingResult, languageName);

			await this.services.github.updatePullRequestBody(validity.pullRequest.number, body);

			this.logger.info(
				{
					path: file.path,
					prNumber: validity.pullRequest.number,
					advisoryGuardCount: processingResult.reviewerNotices.length,
				},
				"Refreshed open translation pull request after upstream sync",
			);

			return {
				pullRequest: validity.pullRequest,
				progress: PullRequestProgressAction.Reused,
			};
		}

		const branchName = getTranslationBranchNameFromPath(file.path);
		const languageName = this.services.languageDetector.getLanguageName(
			this.services.languageDetector.languages.target,
		);
		const pullRequestOptions = {
			title: this.services.locale.definitions.pullRequest.title(file),
			body: this.createPullRequestDescription(file, processingResult, languageName),
			baseBranch: "main",
		};

		this.logger.info(
			{ branchName, title: pullRequestOptions.title },
			"Opening pull request for refreshed translation branch",
		);

		const strayPullRequest = await this.services.github.findPullRequestByBranch(branchName);

		if (strayPullRequest) {
			const body = this.createPullRequestDescription(file, processingResult, languageName);

			await this.services.github.updatePullRequestBody(strayPullRequest.number, body);

			this.logger.info(
				{
					path: file.path,
					prNumber: strayPullRequest.number,
					invalidReason: validity.invalidReason ?? null,
				},
				"Reused open translation pull request after branch refresh",
			);

			return {
				pullRequest: strayPullRequest,
				progress: PullRequestProgressAction.Reused,
			};
		}

		const pullRequest = await this.services.github.createPullRequest({
			branch: branchName,
			...pullRequestOptions,
		});

		return {
			pullRequest,
			progress: PullRequestProgressAction.Created,
		};
	}

	/**
	 * Creates a pull request description for translated content.
	 *
	 * Generates a PR body with a human-review notice, maintainer wiki tip, optional conflict
	 * notices, and advisory validation details when guards report issues.
	 * When a file has an existing invalid PR (with merge conflicts), includes a GitHub Flavored Markdown
	 * alert to inform maintainers about the duplicate PR situation.
	 *
	 * @param file Translation file being processed with original content
	 * @param processingResult Processing metadata
	 * @param languageName Human-readable name of the target translation language
	 *
	 * @returns Markdown-formatted PR description with all components
	 */
	public createPullRequestDescription(
		file: TranslationFile,
		processingResult: ProcessedFileResult,
		languageName: string,
	): string {
		this.logger.info(
			{ file: file.path, language: languageName },
			"Creating pull request description",
		);

		const contentRatio =
			file.content.length > 0 ?
				((processingResult.translation?.length ?? 0) / file.content.length).toFixed(2)
			:	"unknown";

		this.logger.debug(
			{
				path: file.path,
				runnerVersion: `v${version}`,
				translationModel: env.LLM_MODEL,
				llmApiHost: resolveLlmApiHost(env.LLM_API_BASE_URL),
				nodeEnv: env.NODE_ENV,
				maskVerbatimLargeFences: env.MASK_VERBATIM_LARGE_FENCES,
				contentRatio,
				sourceBytes: file.content.length,
				translationBytes: processingResult.translation?.length ?? 0,
				reviewerNotices: processingResult.reviewerNotices,
			},
			"Pull request description operator metadata",
		);

		const pullRequestDescriptionMetadata: PullRequestDescriptionMetadata = {
			languageName,
			invalidFilePR: this.invalidPRsByFile.get(file.path),
			reviewerNotices: processingResult.reviewerNotices,
		};
		return this.services.locale.definitions.pullRequest.body(
			file,
			processingResult,
			pullRequestDescriptionMetadata,
		);
	}
}
