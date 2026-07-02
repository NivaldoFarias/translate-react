import type { components } from "@octokit/openapi-types";
import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { CommentBuilderService } from "@/app/services/comment-builder/";
import type { ProcessedFileResult, TranslationProgressFileRef } from "@/app/services/github/types";

import type { SharedGitHubDependencies } from "./types";

import {
	hasReportableProgressComment,
	selectProgressCommentPayload,
} from "@/app/services/comment-builder/progress-comment.util";
import { logger } from "@/app/utils/";

/**
 * Translation progress issue search and comment posting on the upstream repository.
 */
export class GitHubProgressIssue {
	private readonly logger = logger.child({ component: GitHubProgressIssue.name });

	/**
	 * @param deps Shared Octokit client and repository coordinates
	 * @param commentBuilder Progress comment markdown builder
	 */
	constructor(
		private readonly deps: SharedGitHubDependencies,
		private readonly commentBuilder: CommentBuilderService,
	) {}

	/**
	 * Posts translation results as comments on GitHub issues.
	 *
	 * ### Workflow
	 *
	 * 1. Returns early when there are no results, no candidate files, or no pull
	 *    requests were opened or updated (avoids posting on failure-only runs)
	 * 2. Resolves the translation progress issue on the upstream repository
	 * 3. Creates a new issue comment with the compiled summary
	 *
	 * @param results Translation results to report
	 * @param filesToTranslate Files that were translated
	 *
	 * @returns The comment created on the issue, or `undefined` when skipped or no issue
	 */
	public async commentCompiledResultsOnIssue(
		results: ProcessedFileResult[],
		filesToTranslate: readonly TranslationProgressFileRef[],
	): Promise<RestEndpointMethodTypes["issues"]["createComment"]["response"]["data"] | undefined> {
		if (results.length === 0 || filesToTranslate.length === 0) {
			this.logger.warn("No results or files to translate. Skipping issue comment update");
			return;
		}

		const payload = selectProgressCommentPayload(results, filesToTranslate);

		if (!hasReportableProgressComment(payload)) {
			this.logger.info(
				{ resultCount: results.length },
				"No pull requests were opened or updated in this run; skipping translation progress issue comment",
			);

			return;
		}

		const translationProgressIssue = await this.findTranslationProgressIssue();

		if (!translationProgressIssue) {
			this.logger.warn("Translation progress issue not found");
			return;
		}

		const createCommentResponse = await this.deps.octokit.issues.createComment({
			...this.deps.repositories.upstream,
			issue_number: translationProgressIssue.number,
			body: this.commentBuilder.buildProgressComment(payload),
		});

		this.logger.info(
			{
				issueNumber: translationProgressIssue.number,
				commentId: createCommentResponse.data.id,
			},
			"Created comment on issue with compiled results",
		);

		return createCommentResponse.data;
	}

	/**
	 * Finds the translation progress issue in the upstream repository.
	 *
	 * @returns The translation progress issue data or `undefined` if not found
	 */
	private async findTranslationProgressIssue(): Promise<
		components["schemas"]["issue-search-result-item"] | undefined
	> {
		const queryString = `repo:${this.deps.repositories.upstream.owner}/${this.deps.repositories.upstream.repo} in:title "Translation Progress" is:issue is:open`;

		const issueExistsResponse = await this.deps.octokit.rest.search.issuesAndPullRequests({
			q: queryString,
		});

		if (issueExistsResponse.data.items.length > 1) {
			this.logger.warn(
				{ count: issueExistsResponse.data.items.length },
				"Multiple translation progress issues found",
			);

			const correctIssue = issueExistsResponse.data.items.find((issue) => {
				const possibleAssociations: components["schemas"]["author-association"][] = [
					"OWNER",
					"CONTRIBUTOR",
					"COLLABORATOR",
					"MEMBER",
				];

				return possibleAssociations.includes(issue.author_association);
			});

			if (!correctIssue) {
				this.logger.error(
					"Could not determine the correct translation progress issue from multiple candidates",
				);

				return undefined;
			}

			return correctIssue;
		}

		const translationProgressIssue = issueExistsResponse.data.items[0];

		if (!translationProgressIssue) {
			this.logger.warn("No translation progress issue found");

			return undefined;
		}

		return translationProgressIssue;
	}
}
