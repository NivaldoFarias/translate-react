import { Buffer } from "node:buffer";

import type { RestEndpointMethodTypes } from "@octokit/rest";
import type { components } from "node_modules/@octokit/plugin-paginate-rest/node_modules/@octokit/types/node_modules/@octokit/openapi-types";
import type PQueue from "p-queue";

import type {
	PatchedRepositoryTreeItem,
	ProcessedFileResult,
	PullRequestStatus,
} from "./../runner";
import type { BaseGitHubServiceDependencies } from "./base.service";

import { githubQueue, octokit } from "@/clients/";
import { ApplicationError, mapError } from "@/errors/";
import { logger } from "@/utils/";

import { commentBuilderService, CommentBuilderService } from "./../comment-builder.service";
import { TranslationFile } from "./../translator.service";
import { BaseGitHubService } from "./base.service";
import { DEFAULT_REPOSITORIES } from "./repository.service";

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

export interface ContentServiceDependencies extends BaseGitHubServiceDependencies {
	commentBuilderService: CommentBuilderService;

	/** Rate limiting queue for Github API calls */
	queue: PQueue;
}

/**
 * Service responsible for managing repository content and translations.
 *
 * ### Responsibilities
 *
 * - File content retrieval and modification
 * - Translation content management
 * - Pull request creation and management
 * - Content filtering and validation
 */
export class ContentService extends BaseGitHubService {
	private readonly logger = logger.child({ component: ContentService.name });
	private readonly services: {
		commentBuilder: CommentBuilderService;
	};

	/** Rate limiting queue for Github API calls */
	private readonly queue: PQueue;

	constructor(dependencies: ContentServiceDependencies) {
		super(dependencies);

		this.services = { commentBuilder: dependencies.commentBuilderService };
		this.queue = dependencies.queue;
	}

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
		try {
			this.logger.info({ prNumber }, "Creating comment on pull request");

			const response = await this.octokit.issues.createComment({
				...this.repositories.upstream,
				issue_number: prNumber,
				body: comment,
			});

			this.logger.info(
				{ prNumber, commentId: response.data.id },
				"Comment created on pull request",
			);

			return response;
		} catch (error) {
			if (error instanceof ApplicationError) throw error;

			throw mapError(error, `${ContentService.name}.${this.createCommentOnPullRequest.name}`, {
				prNumber,
				upstream: this.repositories.upstream,
			});
		}
	}

	/**
	 * Lists all open pull requests.
	 *
	 * @returns A list of open pull requests
	 */
	public async listOpenPullRequests(): Promise<
		RestEndpointMethodTypes["pulls"]["list"]["response"]["data"]
	> {
		try {
			this.logger.info(
				{ repo: this.repositories.upstream, state: "open" },
				"Listing open pull requests",
			);

			const response = await this.octokit.pulls.list({
				...this.repositories.upstream,
				state: "open",
			});

			this.logger.info({ count: response.data.length }, "Listed open pull requests");

			return response.data;
		} catch (error) {
			if (error instanceof ApplicationError) throw error;

			throw mapError(error, `${ContentService.name}.${this.listOpenPullRequests.name}`, {
				upstream: this.repositories.upstream,
			});
		}
	}

	/**
	 * Retrieves a pull request by number.
	 *
	 * @param prNumber Pull request number
	 *
	 * @returns The pull request data
	 */
	public async findPullRequestByNumber(
		prNumber: number,
	): Promise<RestEndpointMethodTypes["pulls"]["get"]["response"]> {
		try {
			this.logger.info(
				{ repo: this.repositories.upstream, prNumber },
				"Searching for pull request by number",
			);

			const response = await this.octokit.pulls.get({
				...this.repositories.upstream,
				pull_number: prNumber,
			});

			this.logger.info(
				{ prNumber, title: response.data.title, state: response.data.state },
				"Found pull request by number",
			);

			return response;
		} catch (error) {
			if (error instanceof ApplicationError) throw error;

			throw mapError(error, `${ContentService.name}.${this.findPullRequestByNumber.name}`, {
				prNumber,
				upstream: this.repositories.upstream,
			});
		}
	}

	/**
	 * Retrieves the list of files changed in a pull request.
	 *
	 * Uses GitHub's PR files API to fetch the actual files modified in the PR,
	 * rather than relying on PR title parsing. This provides accurate file-based
	 * filtering for translation workflows by comparing actual changed file paths
	 * against candidate files needing translation.
	 *
	 * @param prNumber Pull request number to fetch changed files from
	 *
	 * @returns A `Promise` resolving to an array of file paths changed in the PR
	 *
	 * @example
	 * ```typescript
	 * const files = await contentService.getPullRequestFiles(123);
	 * console.log(files);
	 * // ^? ['src/content/learn/state-management.md', 'src/content/learn/hooks.md']
	 * ```
	 */
	public async getPullRequestFiles(prNumber: number): Promise<string[]> {
		try {
			this.logger.info(
				{ repo: this.repositories.upstream, prNumber },
				"Fetching pull request changed files",
			);

			const response = await this.octokit.pulls.listFiles({
				...this.repositories.upstream,
				pull_number: prNumber,
			});

			const filePaths = response.data.map((file) => file.filename);

			this.logger.info({ prNumber, fileCount: filePaths.length }, "Fetched PR changed files");

			return filePaths;
		} catch (error) {
			if (error instanceof ApplicationError) throw error;

			throw mapError(error, `${ContentService.name}.${this.getPullRequestFiles.name}`, {
				prNumber,
				upstream: this.repositories.upstream,
			});
		}
	}

	/**
	 * Commits translated content to a branch.
	 *
	 * Updates existing file or creates new one.
	 *
	 * @param options Commit options
	 *
	 * @throws {Error} If commit operation fails
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
	 * await contentService.commitTranslation(options);
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
		try {
			this.logger.info(
				{ filePath: file.path, branch: branch.ref, commitMessage: message },
				"Committing translated content",
			);

			const response = await this.octokit.repos.createOrUpdateFileContents({
				...this.repositories.fork,
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
		} catch (error) {
			if (error instanceof ApplicationError) throw error;

			throw mapError(error, `${ContentService.name}.${this.commitTranslation.name}`, {
				filePath: file.path,
				branchRef: branch.ref,
				commitMessage: message,
			});
		}
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
	 * const pr = await contentService.createPullRequest(options);
	 * ```
	 */
	public async createPullRequest({
		branch,
		title,
		body,
		baseBranch = "main",
	}: PullRequestOptions): Promise<RestEndpointMethodTypes["pulls"]["create"]["response"]["data"]> {
		const targetRepo = this.repositories.upstream;
		const headRef = `${this.repositories.fork.owner}:${branch}`;

		try {
			this.logger.info(
				{ targetRepo: targetRepo.owner, headRef, baseBranch, title },
				"Creating pull request",
			);

			const createPullRequestResponse = await this.octokit.pulls.create({
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
		} catch (error) {
			if (error instanceof ApplicationError) throw error;

			throw mapError(error, `${ContentService.name}.${this.createPullRequest.name}`, {
				branch,
				title,
				baseBranch,
			});
		}
	}

	/**
	 * Fetches raw content of a file from GitHub.
	 *
	 * @param file File reference to fetch
	 */
	public async getFile(file: PatchedRepositoryTreeItem): Promise<TranslationFile> {
		this.logger.info({ filePath: file.path }, "Fetching file content");

		try {
			const response = await this.octokit.git.getBlob({
				...this.repositories.fork,
				file_sha: file.sha,
			});

			const content = Buffer.from(response.data.content, "base64").toString();

			this.logger.debug(
				{ filePath: file.path, blobSha: file.sha, contentLength: content.length },
				"Retrieved file content",
			);

			return new TranslationFile(content, file.filename, file.path, file.sha);
		} catch (error) {
			if (error instanceof ApplicationError) throw error;

			throw mapError(error, `${ContentService.name}.${this.getFile.name}`, {
				filePath: file.path,
				blobSha: file.sha,
			});
		}
	}

	/**
	 * Finds the translation progress issue in the upstream repository.
	 *
	 * @returns The translation progress issue data or `undefined` if not found
	 */
	private async findTranslationProgressIssue(): Promise<
		components["schemas"]["issue-search-result-item"] | undefined
	> {
		const queryString = `repo:${this.repositories.upstream.owner}/${this.repositories.upstream.repo} in:title "Translation Progress" is:issue is:open`;

		try {
			this.logger.info({ queryString }, "Searching for translation progress issue");

			// eslint-disable-next-line @typescript-eslint/no-deprecated
			const issueExistsResponse = await this.octokit.rest.search.issuesAndPullRequests({
				q: queryString,
			});

			this.logger.debug(
				{
					totalCount: issueExistsResponse.data.total_count,
					incompleteResults: issueExistsResponse.data.incomplete_results,
				},
				"Search results for translation progress issue",
			);

			if (issueExistsResponse.data.items.length > 1) {
				this.logger.warn(
					{ count: issueExistsResponse.data.items.length },
					"Multiple translation progress issues found",
				);

				this.logger.debug(
					"Trying to pinpoint the correct issue by issue's `author_association` attribute",
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

				this.logger.info(
					{ issueNumber: correctIssue.number },
					"Identified correct translation progress issue",
				);

				return correctIssue;
			}

			const translationProgressIssue = issueExistsResponse.data.items[0];

			if (!translationProgressIssue) {
				this.logger.warn("No translation progress issue found");

				return undefined;
			}

			this.logger.info(
				{ issueNumber: translationProgressIssue.number },
				"Found translation progress issue",
			);

			return translationProgressIssue;
		} catch (error) {
			if (error instanceof ApplicationError) throw error;

			throw mapError(error, `${ContentService.name}.${this.findTranslationProgressIssue.name}`, {
				queryString,
			});
		}
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
	 * const comment = await contentService.commentCompiledResultsOnIssue(results, filesToTranslate);
	 * ```
	 */
	public async commentCompiledResultsOnIssue(
		results: ProcessedFileResult[],
		filesToTranslate: TranslationFile[],
	): Promise<RestEndpointMethodTypes["issues"]["createComment"]["response"]["data"] | undefined> {
		try {
			this.logger.info(
				{
					resultsCount: results.length,
					filesToTranslateCount: filesToTranslate.length,
				},
				"Commenting compiled translation results on issue",
			);

			if (results.length === 0 || filesToTranslate.length === 0) {
				this.logger.warn("No results or files to translate. Skipping issue comment update");
				return;
			}

			const translationProgressIssue = await this.findTranslationProgressIssue();

			if (!translationProgressIssue) {
				this.logger.warn("Translation progress issue not found");
				return;
			}

			this.logger.info(
				{ issueNumber: translationProgressIssue.number },
				"Preparing to comment on translation progress issue",
			);

			const createCommentResponse = await this.octokit.issues.createComment({
				...this.repositories.upstream,
				issue_number: translationProgressIssue.number,
				body: this.services.commentBuilder.buildComment(results, filesToTranslate),
			});

			this.logger.info(
				{
					issueNumber: translationProgressIssue.number,
					commentId: createCommentResponse.data.id,
				},
				"Created comment on issue with compiled results",
			);

			return createCommentResponse.data;
		} catch (error) {
			if (error instanceof ApplicationError) throw error;

			throw mapError(error, `${ContentService.name}.${this.commentCompiledResultsOnIssue.name}`, {
				filesCount: filesToTranslate.length,
				resultsCount: results.length,
			});
		}
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
		try {
			this.logger.info({ branchName }, "Searching for pull request by branch");

			const response = await this.octokit.pulls.list({
				...this.repositories.upstream,
				head: `${this.repositories.fork.owner}:${branchName}`,
			});

			const pr = response.data[0];

			this.logger.debug(
				{ branchName, found: !!pr, prNumber: pr?.number },
				"Searched for pull request by branch",
			);

			return pr;
		} catch (error) {
			if (error instanceof ApplicationError) throw error;

			throw mapError(error, `${ContentService.name}.${this.findPullRequestByBranch.name}`, {
				branchName,
				forkOwner: this.repositories.fork.owner,
			});
		}
	}

	/**
	 * Checks if a pull request has merge conflicts that require closing and recreating.
	 *
	 * Determines if a PR needs to be closed and recreated by examining its mergeable status.
	 * The `needsUpdate` flag is only set to `true` when there are actual merge conflicts
	 * (indicated by `mergeable === false` and `mergeable_state === "dirty"`). PRs that are
	 * simply "behind" the base branch remain valid and can be updated via rebase without
	 * requiring closure.
	 *	 *
	 * @param prNumber Pull request number to check
	 *
	 * @returns A Promise resolving to an object containing PR status information
	 * @example
	 * ```typescript
	 * const status = await contentService.checkPullRequestStatus(123);
	 * if (status.needsUpdate) {
	 *   console.log('PR has conflicts and needs recreating');
	 * } else if (status.mergeableState === 'behind') {
	 *   console.log('PR is behind but can be rebased');
	 * }
	 * ```
	 */
	public async checkPullRequestStatus(prNumber: number): Promise<PullRequestStatus> {
		try {
			this.logger.info({ prNumber }, "Checking pull request status");

			const prResponse = await this.octokit.pulls.get({
				...this.repositories.upstream,
				pull_number: prNumber,
			});

			const pr = prResponse.data;
			const hasConflicts = pr.mergeable === false && pr.mergeable_state === "dirty";
			const needsUpdate = hasConflicts;

			this.logger.info(
				{
					prNumber,
					hasConflicts,
					mergeable: pr.mergeable,
					mergeableState: pr.mergeable_state,
					needsUpdate,
				},
				"Checked pull request status",
			);

			return {
				hasConflicts,
				mergeable: pr.mergeable,
				mergeableState: pr.mergeable_state,
				needsUpdate,
			};
		} catch (error) {
			if (error instanceof ApplicationError) throw error;

			throw mapError(error, `${ContentService.name}.${this.checkPullRequestStatus.name}`, {
				prNumber,
				upstream: this.repositories.upstream,
			});
		}
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
		try {
			this.logger.info({ prNumber }, "Closing pull request");

			const response = await this.octokit.pulls.update({
				...this.repositories.upstream,
				pull_number: prNumber,
				state: "closed",
			});

			this.logger.info({ prNumber }, "Pull request closed successfully");

			return response.data;
		} catch (error) {
			if (error instanceof ApplicationError) throw error;

			throw mapError(error, `${ContentService.name}.${this.closePullRequest.name}`, {
				prNumber,
				upstream: this.repositories.upstream,
			});
		}
	}
}

export const contentService = new ContentService({
	octokit,
	repositories: DEFAULT_REPOSITORIES,
	commentBuilderService,
	queue: githubQueue,
});
