import { Buffer } from "node:buffer";

import type { components } from "@octokit/openapi-types";
import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { CommentBuilderService } from "@/services/comment-builder/";
import type {
	PatchedRepositoryTreeItem,
	ProcessedFileResult,
	PullRequestStatus,
} from "@/services/runner/";

import type { SharedGitHubDependencies } from "./github.types";

import { TranslationFile } from "@/services/translator/";
import { logger } from "@/utils/";

/** Pull request options */
export interface PullRequestOptions {
	/** Source branch name */
	branch: string;

	/** Pull request title */
	title: string;

	/** Pull request description */
	body: string;

	/** Target branch for PR */
	baseBranch?: string;
}

/** Options for committing translation changes */
export interface CommitTranslationOptions {
	/** Target branch reference */
	branch: RestEndpointMethodTypes["git"]["getRef"]["response"]["data"];

	/** File being translated */
	file: TranslationFile;

	/** Translated content */
	content: string;

	/** Commit message */
	message: string;
}

/**
 * Content and pull request operations module for GitHub API.
 *
 * Handles file content retrieval, translation commits, and PR management.
 */
export class GitHubContent {
	private readonly logger = logger.child({ component: GitHubContent.name });

	constructor(
		private readonly deps: SharedGitHubDependencies,
		private readonly commentBuilder: CommentBuilderService,
	) {}

	/**
	 * Creates a comment on a pull request.
	 *
	 * @param prNumber Pull request number
	 * @param comment Comment to create
	 *
	 * @returns The response from the GitHub API
	 */
	public async createCommentOnPullRequest(
		prNumber: number,
		comment: string,
	): Promise<RestEndpointMethodTypes["issues"]["createComment"]["response"]> {
		const response = await this.deps.octokit.issues.createComment({
			...this.deps.repositories.upstream,
			issue_number: prNumber,
			body: comment,
		});

		this.logger.info({ prNumber, commentId: response.data.id }, "Comment created on pull request");

		return response;
	}

	/**
	 * Lists all open pull requests.
	 *
	 * @returns A list of open pull requests
	 */
	public async listOpenPullRequests(): Promise<
		RestEndpointMethodTypes["pulls"]["list"]["response"]["data"]
	> {
		const response = await this.deps.octokit.pulls.list({
			...this.deps.repositories.upstream,
			state: "open",
		});

		return response.data;
	}

	/**
	 * Retrieves the list of files changed in a pull request.
	 *
	 * @param prNumber Pull request number to fetch changed files from
	 *
	 * @returns A `Promise` resolving to an array of file paths changed in the PR
	 *
	 * @example
	 * ```typescript
	 * const files = await content.getPullRequestFiles(123);
	 * console.log(files);
	 * // ^? ['src/content/learn/state-management.md', 'src/content/learn/hooks.md']
	 * ```
	 */
	public async getPullRequestFiles(prNumber: number): Promise<string[]> {
		const response = await this.deps.octokit.pulls.listFiles({
			...this.deps.repositories.upstream,
			pull_number: prNumber,
		});

		return response.data.map((file) => file.filename);
	}

	/**
	 * Commits translated content to a branch.
	 *
	 * Updates existing file or creates new one.
	 *
	 * @param options Commit options
	 *
	 * @example
	 * ```typescript
	 * const options = {
	 *   branch: branchRef,
	 *   file: {
	 *     path: 'src/content/homepage.md',
	 *     content: translatedContent,
	 *     sha: '1234567890',
	 *     filename: 'homepage.md',
	 *   },
	 *   content: translatedContent,
	 *   message: 'feat(i18n): translate homepage'
	 * };
	 *
	 * await content.commitTranslation(options);
	 * ```
	 */
	public async commitTranslation({
		branch,
		file,
		content,
		message,
	}: CommitTranslationOptions): Promise<
		RestEndpointMethodTypes["repos"]["createOrUpdateFileContents"]["response"]
	> {
		const response = await this.deps.octokit.repos.createOrUpdateFileContents({
			...this.deps.repositories.fork,
			path: file.path,
			message,
			content: Buffer.from(content).toString("base64"),
			branch: branch.ref,
			sha: file.sha,
		});

		this.logger.info(
			{
				filePath: file.path,
				branch: branch.ref,
				commitSha: response.data.commit.sha,
			},
			"Translation committed successfully",
		);

		return response;
	}

	/**
	 * Creates a pull request.
	 *
	 * @param options Pull request options
	 *
	 * @example
	 * ```typescript
	 * const options = {
	 *   branch: 'translate/homepage',
	 *   title: 'feat(i18n): translate homepage',
	 *   body: 'Translates homepage content to Portuguese',
	 *   baseBranch: 'main',
	 * };
	 *
	 * const pr = await content.createPullRequest(options);
	 * ```
	 */
	public async createPullRequest({
		branch,
		title,
		body,
		baseBranch = "main",
	}: PullRequestOptions): Promise<RestEndpointMethodTypes["pulls"]["create"]["response"]["data"]> {
		const targetRepo = this.deps.repositories.upstream;
		const headRef = `${this.deps.repositories.fork.owner}:${branch}`;

		const createPullRequestResponse = await this.deps.octokit.pulls.create({
			...targetRepo,
			title,
			body,
			head: headRef,
			base: baseBranch,
			maintainer_can_modify: true,
		});

		this.logger.info(
			{
				prNumber: createPullRequestResponse.data.number,
				title,
				targetRepo: targetRepo.owner,
				headRef,
				baseBranch,
			},
			"Pull request created successfully",
		);

		return createPullRequestResponse.data;
	}

	/**
	 * Fetches raw content of a file from GitHub.
	 *
	 * @param file File reference to fetch
	 */
	public async getFile(file: PatchedRepositoryTreeItem): Promise<TranslationFile> {
		const response = await this.deps.octokit.git.getBlob({
			...this.deps.repositories.fork,
			file_sha: file.sha,
		});

		const content = Buffer.from(response.data.content, "base64").toString();

		return new TranslationFile(content, file.filename, file.path, file.sha);
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

	/**
	 * Posts translation results as comments on GitHub issues.
	 *
	 * ### Workflow
	 *
	 * 1. Checks if the issue exists
	 * 2. Lists comments on the issue
	 * 3. Finds the user's comment with the correct prefix
	 * 4. Updates the comment with new results
	 * 5. Creates a new comment if the user's comment is not found
	 *
	 * @param results Translation results to report
	 * @param filesToTranslate Files that were translated
	 *
	 * @throws {Error} If the issue is not found
	 *
	 * @returns The comment created on the issue
	 *
	 * @example
	 * ```typescript
	 * const comment = await content.commentCompiledResultsOnIssue(results, filesToTranslate);
	 * ```
	 */
	public async commentCompiledResultsOnIssue(
		results: ProcessedFileResult[],
		filesToTranslate: TranslationFile[],
	): Promise<RestEndpointMethodTypes["issues"]["createComment"]["response"]["data"] | undefined> {
		if (results.length === 0 || filesToTranslate.length === 0) {
			this.logger.warn("No results or files to translate. Skipping issue comment update");
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
			body: this.commentBuilder.buildComment(results, filesToTranslate),
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
	 * Retrieves a pull request by branch name.
	 *
	 * @param branchName Source branch name
	 *
	 * @returns The first matching pull request or undefined if none found
	 */
	public async findPullRequestByBranch(
		branchName: string,
	): Promise<RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number] | undefined> {
		const response = await this.deps.octokit.pulls.list({
			...this.deps.repositories.upstream,
			head: `${this.deps.repositories.fork.owner}:${branchName}`,
		});

		return response.data[0];
	}

	/**
	 * Checks if a pull request has merge conflicts that require closing and recreating.
	 *
	 * Determines if a PR needs to be closed and recreated by examining its mergeable status.
	 * The `needsUpdate` flag is only set to `true` when there are actual merge conflicts
	 * (indicated by `mergeable === false` and `mergeable_state === "dirty"`). PRs that are
	 * simply "behind" the base branch remain valid and can be updated via rebase without
	 * requiring closure.
	 *
	 * @param prNumber Pull request number to check
	 *
	 * @returns A Promise resolving to an object containing PR status information
	 * @example
	 * ```typescript
	 * const status = await content.checkPullRequestStatus(123);
	 * if (status.needsUpdate) {
	 *   console.log('PR has conflicts and needs recreating');
	 * } else if (status.mergeableState === 'behind') {
	 *   console.log('PR is behind but can be rebased');
	 * }
	 * ```
	 */
	public async checkPullRequestStatus(prNumber: number): Promise<PullRequestStatus> {
		const prResponse = await this.deps.octokit.pulls.get({
			...this.deps.repositories.upstream,
			pull_number: prNumber,
		});

		const pr = prResponse.data;
		const hasConflicts = pr.mergeable === false && pr.mergeable_state === "dirty";
		const needsUpdate = hasConflicts;

		return {
			hasConflicts,
			mergeable: pr.mergeable,
			mergeableState: pr.mergeable_state,
			needsUpdate,
		};
	}

	/**
	 * Closes a pull request by number.
	 *
	 * @param prNumber Pull request number
	 *
	 * @throws {Error} If pull request closure fails
	 */
	public async closePullRequest(
		prNumber: number,
	): Promise<RestEndpointMethodTypes["pulls"]["update"]["response"]["data"]> {
		const response = await this.deps.octokit.pulls.update({
			...this.deps.repositories.upstream,
			pull_number: prNumber,
			state: "closed",
		});

		this.logger.info({ prNumber }, "Pull request closed successfully");

		return response.data;
	}
}
