import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { PullRequestStatus } from "@/app/domain/workflow/";

import type { RunnerServiceDependencies } from "../runner.types";

import { getTranslationBranchNameFromPath, logger } from "@/app/utils/";

/** Why an open translation pull request is not treated as workflow-complete */
export type TranslationPullRequestInvalidReason = "no_open_pr" | "out_of_sync" | "not_translated";

/** Outcome of evaluating an open translation pull request for a repository path */
export interface TranslationPullRequestValidity {
	/** Whether the runner should skip translation for this path */
	readonly isValid: boolean;

	/** Open pull request on the translation branch, when one exists */
	readonly pullRequest?: RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number];

	/** Present when {@link TranslationPullRequestValidity.isValid} is `false` */
	readonly invalidReason?: TranslationPullRequestInvalidReason;

	/** Mergeability snapshot used for sync checks */
	readonly pullRequestStatus?: PullRequestStatus;
}

/**
 * Decides whether an open translation PR already satisfies the workflow for a path.
 *
 * Valid when there is an open PR on the `translate/…` branch, fork content is in the
 * target language, and the PR is in sync with its base (no merge conflicts).
 */
export class TranslationPullRequestValidityManager {
	private readonly logger = logger.child({
		component: TranslationPullRequestValidityManager.name,
	});

	/**
	 * @param services GitHub and language-detector dependencies
	 */
	constructor(private readonly services: RunnerServiceDependencies) {}

	/**
	 * Evaluates whether translation work can be skipped for `filePath`.
	 *
	 * @param filePath Repository path under `src/content/`
	 *
	 * @returns Validity outcome for discovery and per-file processing
	 */
	public async evaluate(filePath: string): Promise<TranslationPullRequestValidity> {
		const branchName = getTranslationBranchNameFromPath(filePath);
		const openPullRequest = await this.services.github.findPullRequestByBranch(branchName);

		if (!openPullRequest) {
			this.logger.debug({ filePath, branchName }, "No open translation pull request for path");

			return { isValid: false, invalidReason: "no_open_pr" };
		}

		const pullRequestStatus = await this.services.github.checkPullRequestStatus(
			openPullRequest.number,
		);

		if (pullRequestStatus.needsUpdate) {
			this.logger.debug(
				{
					filePath,
					prNumber: openPullRequest.number,
					mergeableState: pullRequestStatus.mergeableState,
				},
				"Translation pull request is out of sync with base",
			);

			return {
				isValid: false,
				pullRequest: openPullRequest,
				invalidReason: "out_of_sync",
				pullRequestStatus,
			};
		}

		const forkContent = await this.services.github.getForkFileContentAtBranch(filePath, branchName);

		if (!forkContent?.trim()) {
			this.logger.debug(
				{ filePath, branchName, prNumber: openPullRequest.number },
				"Translation branch has no file content at path",
			);

			return {
				isValid: false,
				pullRequest: openPullRequest,
				invalidReason: "not_translated",
				pullRequestStatus,
			};
		}

		const filename = filePath.split("/").pop() ?? filePath;
		const analysis = await this.services.languageDetector.analyzeLanguage(filename, forkContent);

		if (!analysis.isTranslated) {
			this.logger.debug(
				{
					filePath,
					prNumber: openPullRequest.number,
					detectedLanguage: analysis.detectedLanguage,
					ratio: analysis.ratio,
				},
				"Fork branch content is not detected as translated",
			);

			return {
				isValid: false,
				pullRequest: openPullRequest,
				invalidReason: "not_translated",
				pullRequestStatus,
			};
		}

		this.logger.debug(
			{
				filePath,
				prNumber: openPullRequest.number,
				mergeableState: pullRequestStatus.mergeableState,
			},
			"Open translation pull request is valid",
		);

		return {
			isValid: true,
			pullRequest: openPullRequest,
			pullRequestStatus,
		};
	}
}
