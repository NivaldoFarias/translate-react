import { Buffer } from "node:buffer";

import { RequestError } from "@octokit/request-error";

import type { components } from "@octokit/openapi-types";
import type { RestEndpointMethodTypes } from "@octokit/rest";

import type {
	PatchedRepositoryTreeItem,
	ProcessedFileResult,
	PullRequestStatus,
} from "@/app/services/github/types";
import type { CommentBuilderService } from "@/app/services/comment-builder/";

import type { SharedGitHubDependencies } from "./types";

import { selectProgressCommentPayload } from "@/app/services/comment-builder/progress-comment.util";
import { TranslationFile } from "@/app/services/translator/";
import { logger } from "@/app/utils/";
import { ApplicationError, ErrorCode } from "@/shared/errors/";

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

/** Max attempts to poll GitHub for a computed `mergeable` value before giving up */
const MERGEABLE_POLL_MAX_ATTEMPTS = 3;

/** Delay between `mergeable` polling attempts in milliseconds */
const MERGEABLE_POLL_DELAY_MS = 2_000;

/** Max attempts to fetch a pull request file list before failing the workflow */
const PR_FILES_FETCH_MAX_ATTEMPTS = 3;

/** Delay between pull request file list fetch retries in milliseconds */
const PR_FILES_FETCH_DELAY_MS = 0;

/**
 * Content and pull request operations module for GitHub API.
 *
 * Handles file content retrieval, translation commits, and PR management.
 */
export class GitHubContent {
	private readonly logger = logger.child({ component: GitHubContent.name });

	/** Cached upstream default branch ref for repeated `getFile` calls in one run */
	private upstreamDefaultBranchRef: string | undefined;

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
	 * Lists all open pull requests. uses `octokit.paginate` to fetch all PRs.
	 *
	 * @returns A list of open pull requests
	 */
	public async listOpenPullRequests(): Promise<
		RestEndpointMethodTypes["pulls"]["list"]["response"]["data"]
	> {
		const response = await this.deps.octokit.paginate("GET /repos/{owner}/{repo}/pulls", {
			...this.deps.repositories.upstream,
			state: "open",
			per_page: 100,
		});

		this.logger.debug({ count: response.length }, "Listed open pull requests");

		return response;
	}

	/**
	 * Retrieves the list of files changed in a pull request. uses `octokit.paginate` to fetch all files.
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
		let lastError: unknown;

		for (let attempt = 0; attempt < PR_FILES_FETCH_MAX_ATTEMPTS; attempt++) {
			try {
				const response = await this.deps.octokit.paginate(
					"GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
					{
						...this.deps.repositories.upstream,
						pull_number: prNumber,
						per_page: 100,
					},
				);

				this.logger.debug({ count: response.length, prNumber }, "Retrieved pull request files");

				return response.map((file) => file.filename);
			} catch (error) {
				lastError = error;
				const isLastAttempt = attempt >= PR_FILES_FETCH_MAX_ATTEMPTS - 1;

				if (isLastAttempt) {
					break;
				}

				this.logger.warn(
					{
						prNumber,
						attempt: attempt + 1,
						maxAttempts: PR_FILES_FETCH_MAX_ATTEMPTS,
						error,
					},
					"Failed to fetch pull request files, retrying",
				);

				await new Promise((resolve) => setTimeout(resolve, PR_FILES_FETCH_DELAY_MS));
			}
		}

		throw lastError;
	}

	/**
	 * Commits translated content to a branch.
	 *
	 * Updates an existing file or creates a new one. Resolves the blob `sha` on the
	 * target branch immediately before the commit so reused topic branches do not
	 * send a stale tree `sha` (GitHub returns HTTP 409 when the `sha` does not match).
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
		const blobShaOnBranch = await this.resolveBlobShaOnBranchForPath(branch.ref, file.path);

		const response = await this.deps.octokit.repos.createOrUpdateFileContents({
			...this.deps.repositories.fork,
			path: file.path,
			message,
			content: Buffer.from(content).toString("base64"),
			branch: branch.ref,
			...(blobShaOnBranch !== undefined ? { sha: blobShaOnBranch } : {}),
		});

		file.logger.info(
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
	 * Looks up the current file blob `sha` on the fork at `branchRef`, or `undefined`
	 * when the path is absent on that branch (create instead of update).
	 *
	 * @param branchRef Full ref such as `refs/heads/translate/foo`
	 * @param path Repository path of the file
	 */
	private async resolveBlobShaOnBranchForPath(branchRef: string, path: string) {
		try {
			const existing = await this.deps.octokit.repos.getContent({
				...this.deps.repositories.fork,
				path,
				ref: branchRef,
			});

			if (Array.isArray(existing.data)) {
				this.logger.warn(
					{ path, branchRef },
					"GitHub returned a directory listing for getContent; omitting sha for file update",
				);

				return undefined;
			}

			if ("sha" in existing.data) {
				return existing.data.sha;
			}

			return undefined;
		} catch (error) {
			if (error instanceof RequestError && error.status === 404) {
				return undefined;
			}

			throw error;
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
	 * Fetches source markdown from the upstream default branch at `file.path`.
	 *
	 * Uses `repos.getContent` on the upstream repository so discovery always reads
	 * source from `main` (or the upstream default), not bytes from a fork
	 * `translate/...` branch that may already contain a translation.
	 *
	 * @param file File reference from the upstream repository tree
	 *
	 * @returns A `TranslationFile` backed by upstream branch content and blob `sha`
	 */
	public async getFile(file: PatchedRepositoryTreeItem): Promise<TranslationFile> {
		const ref = await this.resolveUpstreamDefaultBranchRef();

		const response = await this.deps.octokit.repos.getContent({
			...this.deps.repositories.upstream,
			path: file.path,
			ref,
		});

		if (Array.isArray(response.data)) {
			throw new ApplicationError(
				`Expected file at path but received directory listing: ${file.path}`,
				ErrorCode.ResourceLoadError,
				`${GitHubContent.name}.${this.getFile.name}`,
				{ path: file.path, ref },
			);
		}

		if (!("content" in response.data) || !response.data.content) {
			throw new ApplicationError(
				`Upstream file has no content: ${file.path}`,
				ErrorCode.ResourceLoadError,
				`${GitHubContent.name}.${this.getFile.name}`,
				{ path: file.path, ref },
			);
		}

		const content = Buffer.from(response.data.content, "base64").toString();

		return new TranslationFile(content, file.filename, file.path, response.data.sha || file.sha);
	}

	/**
	 * Reads file content from the fork at a translation branch tip.
	 *
	 * @param path Repository path of the markdown file
	 * @param branchName Translation branch name without `refs/heads/` prefix
	 *
	 * @returns File body as UTF-8 text, or `undefined` when the path is missing on that branch
	 */
	public async getForkFileContentAtBranch(path: string, branchName: string) {
		const branchRef = `refs/heads/${branchName}`;

		try {
			const response = await this.deps.octokit.repos.getContent({
				...this.deps.repositories.fork,
				path,
				ref: branchRef,
			});

			if (Array.isArray(response.data)) {
				this.logger.warn(
					{ path, branchRef },
					"GitHub returned a directory listing for fork branch content lookup",
				);

				return undefined;
			}

			if (!("content" in response.data) || !response.data.content) {
				return undefined;
			}

			return Buffer.from(response.data.content, "base64").toString();
		} catch (error) {
			if (error instanceof RequestError && error.status === 404) {
				return undefined;
			}

			throw error;
		}
	}

	/**
	 * Resolves and caches the upstream repository default branch name.
	 */
	private async resolveUpstreamDefaultBranchRef() {
		if (this.upstreamDefaultBranchRef) {
			return this.upstreamDefaultBranchRef;
		}

		const response = await this.deps.octokit.repos.get(this.deps.repositories.upstream);
		this.upstreamDefaultBranchRef = response.data.default_branch;

		return this.upstreamDefaultBranchRef;
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
	 * 1. Returns early when there are no results, no candidate files, or no pull
	 *    requests were opened or updated (avoids posting on failure-only runs)
	 * 2. Resolves the translation progress issue on the upstream repository
	 * 3. Creates a new issue comment with the compiled summary
	 *
	 * @param results Translation results to report
	 * @param filesToTranslate Files that were translated
	 *
	 * @returns The comment created on the issue, or `undefined` when skipped or no issue
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

		const { reportableResults, reportableFiles } = selectProgressCommentPayload(
			results,
			filesToTranslate,
		);

		if (reportableResults.length === 0) {
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
			body: this.commentBuilder.buildReportableComment(reportableResults, reportableFiles),
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
	 * Polls GitHub when `mergeable` is `null` (async computation pending) to avoid
	 * false negatives. After exhausting retries, treats an undetermined state as
	 * conflicted to avoid silently skipping stale PRs.
	 *
	 * @param prNumber Pull request number to check
	 *
	 * @returns PR status with conflict and mergeability information
	 */
	public async checkPullRequestStatus(prNumber: number): Promise<PullRequestStatus> {
		let pr = await this.fetchPullRequest(prNumber);

		for (
			let attempt = 0;
			pr.mergeable === null && attempt < MERGEABLE_POLL_MAX_ATTEMPTS;
			attempt++
		) {
			this.logger.debug(
				{ prNumber, attempt: attempt + 1, maxAttempts: MERGEABLE_POLL_MAX_ATTEMPTS },
				"PR mergeable state not yet computed, polling",
			);
			await new Promise((resolve) => setTimeout(resolve, MERGEABLE_POLL_DELAY_MS));
			pr = await this.fetchPullRequest(prNumber);
		}

		if (pr.mergeable === null) {
			this.logger.warn(
				{ prNumber, mergeableState: pr.mergeable_state },
				"PR mergeable state still undetermined after polling, treating as conflicted",
			);
		}

		const hasConflicts =
			pr.mergeable === null ||
			(!pr.mergeable && (pr.mergeable_state === "dirty" || pr.mergeable_state === "unknown"));
		const needsUpdate = hasConflicts;

		return {
			hasConflicts,
			mergeable: pr.mergeable,
			mergeableState: pr.mergeable_state,
			needsUpdate,
			createdBy: pr.user.login,
		};
	}

	/** Fetches a single PR's data from GitHub */
	private async fetchPullRequest(prNumber: number) {
		const response = await this.deps.octokit.pulls.get({
			...this.deps.repositories.upstream,
			pull_number: prNumber,
		});

		return response.data;
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
