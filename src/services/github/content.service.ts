import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { ProcessedFileResult } from "@/services/runner/";

import { BaseGitHubService } from "@/services/github/";
import { env, logger } from "@/utils/";

import { CommentBuilderService } from "../comment-builder.service";
import { TranslationFile } from "../translator.service";

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
	private readonly issueNumber = Number(env.PROGRESS_ISSUE_NUMBER);
	private readonly services = {
		commentBuilder: new CommentBuilderService(),
	};

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
			const response = await this.octokit.issues.createComment({
				...this.repositories.upstream,
				issue_number: prNumber,
				body: comment,
			});

			logger.info({ prNumber, commentId: response.data.id }, "Comment created on pull request");

			return response;
		} catch (error) {
			throw this.helpers.github.mapError(error, {
				operation: "ContentService.createCommentOnPullRequest",
				metadata: { prNumber, upstream: this.repositories.upstream },
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
			const response = await this.octokit.pulls.list({
				...this.repositories.upstream,
				state: "open",
			});

			logger.debug({ count: response.data.length }, "Listed open pull requests");

			return response.data;
		} catch (error) {
			throw this.helpers.github.mapError(error, {
				operation: "ContentService.listOpenPullRequests",
				metadata: { upstream: this.repositories.upstream },
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
			const response = await this.octokit.pulls.get({
				...this.repositories.upstream,
				pull_number: prNumber,
			});

			logger.debug(
				{ prNumber, title: response.data.title, state: response.data.state },
				"Found pull request by number",
			);

			return response;
		} catch (error) {
			throw this.helpers.github.mapError(error, {
				operation: "ContentService.findPullRequestByNumber",
				metadata: { prNumber, upstream: this.repositories.upstream },
			});
		}
	}

	/**
	 * Retrieves markdown files that need translation.
	 *
	 * Filters and processes files based on content type.
	 *
	 * @param maxFiles Optional limit on number of files to retrieve
	 * @throws {Error} If repository tree is empty or retrieval fails
	 *
	 * @example
	 * ```typescript
	 * const files = await contentService.getUntranslatedFiles(5);
	 * ```
	 */
	public async getUntranslatedFiles(maxFiles?: number): Promise<TranslationFile[]> {
		try {
			const repoTreeResponse = await this.octokit.git.getTree({
				...this.repositories.fork,
				tree_sha: "main",
				recursive: "true",
			});

			if (!repoTreeResponse.data.tree) {
				logger.warn({ fork: this.repositories.fork }, "Repository tree is empty");
				throw this.helpers.github.mapError(new Error("Repository tree is empty"), {
					operation: "ContentService.getUntranslatedFiles",
					metadata: { fork: this.repositories.fork },
				});
			}

			const markdownFiles = this.filterMarkdownFiles(repoTreeResponse.data.tree);
			const filesToProcess = maxFiles ? markdownFiles.slice(0, maxFiles) : markdownFiles;

			logger.info(
				{
					totalMarkdownFiles: markdownFiles.length,
					filesToProcess: filesToProcess.length,
					maxFilesLimit: maxFiles,
				},
				"Processing markdown files for translation",
			);

			const files: TranslationFile[] = [];

			for (const file of filesToProcess) {
				if (!file.path) continue;

				try {
					const response = await this.octokit.repos.getContent({
						...this.repositories.fork,
						path: file.path,
					});

					if (!("content" in response.data)) continue;

					files.push({
						path: file.path,
						content: Buffer.from(response.data.content, "base64").toString(),
						sha: response.data.sha,
						filename: file.path.split("/").pop()!,
					});
				} catch (error) {
					logger.debug(
						{ filePath: file.path, error },
						"Skipping file - could not retrieve content",
					);
					continue;
				}
			}

			logger.info({ filesRetrieved: files.length }, "Successfully retrieved untranslated files");

			return files;
		} catch (error) {
			throw this.helpers.github.mapError(error, {
				operation: "ContentService.getUntranslatedFiles",
				metadata: { maxFiles, fork: this.repositories.fork },
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
			const response = await this.octokit.repos.createOrUpdateFileContents({
				...this.repositories.fork,
				path: file.path,
				message,
				content: Buffer.from(content).toString("base64"),
				branch: branch.ref,
				sha: file.sha,
			});

			logger.info(
				{
					filePath: file.path,
					branch: branch.ref,
					commitSha: response.data.commit.sha,
				},
				"Translation committed successfully",
			);

			return response;
		} catch (error) {
			throw this.helpers.github.mapError(error, {
				operation: "ContentService.commitTranslation",
				metadata: {
					filePath: file.path,
					branchRef: branch.ref,
					commitMessage: message,
				},
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
	/**
	 * Creates a pull request.
	 *
	 * @param options Pull request options
	 *
	 * @remarks
	 * In dev mode, creates PRs against the fork; in production, against upstream.
	 * Uses dynamic import for env to avoid circular dependencies.
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
		try {
			const { env } = await import("@/utils/");

			const targetRepo = env.DEV_MODE_FORK_PR ? this.repositories.fork : this.repositories.upstream;
			const headRef = env.DEV_MODE_FORK_PR ? branch : `${this.repositories.fork.owner}:${branch}`;

			const createPullRequestResponse = await this.octokit.pulls.create({
				...targetRepo,
				title,
				body,
				head: headRef,
				base: baseBranch,
				maintainer_can_modify: true,
			});

			logger.info(
				{
					prNumber: createPullRequestResponse.data.number,
					title,
					targetRepo: targetRepo.owner,
					headRef,
					baseBranch,
					devMode: env.DEV_MODE_FORK_PR,
				},
				"Pull request created successfully",
			);

			return createPullRequestResponse.data;
		} catch (error) {
			throw this.helpers.github.mapError(error, {
				operation: "ContentService.createPullRequest",
				metadata: { branch, title, baseBranch },
			});
		}
	}

	/**
	 * Filters repository tree for markdown files.
	 *
	 * @param tree Repository tree from GitHub API
	 */
	protected filterMarkdownFiles(
		tree: RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"],
	): RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"] {
		return tree.filter((item) => {
			if (!item.path?.endsWith(".md")) return false;
			if (!item.path.includes("src/")) return false;
			return true;
		});
	}

	/**
	 * Fetches raw content of a file from GitHub.
	 *
	 * @param file File reference to fetch
	 */
	public async getFileContent(
		file:
			| TranslationFile
			| RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"][number],
	): Promise<string> {
		try {
			const blobSha = file.sha;

			if (!blobSha) {
				logger.warn({ file }, "Invalid blob SHA - file missing SHA property");
				throw this.helpers.github.mapError(new Error("Invalid blob SHA"), {
					operation: "ContentService.getFileContent",
					metadata: { filePath: file.path },
				});
			}

			const response = await this.octokit.git.getBlob({
				...this.repositories.fork,
				file_sha: blobSha,
			});

			const content = Buffer.from(response.data.content, "base64").toString();

			logger.debug(
				{
					filePath: file.path,
					blobSha,
					contentLength: content.length,
				},
				"Retrieved file content",
			);

			return content;
		} catch (error) {
			throw this.helpers.github.mapError(error, {
				operation: "ContentService.getFileContent",
				metadata: { filePath: file.path, blobSha: file.sha },
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
	): Promise<RestEndpointMethodTypes["issues"]["createComment"]["response"]["data"]> {
		try {
			const issueExistsResponse = await this.octokit.issues.get({
				...this.repositories.upstream,
				issue_number: this.issueNumber,
			});

			if (!issueExistsResponse.data) {
				logger.warn({ issueNumber: this.issueNumber }, "Issue not found");
				throw this.helpers.github.mapError(new Error(`Issue ${this.issueNumber} not found`), {
					operation: "ContentService.commentCompiledResultsOnIssue",
					metadata: { issueNumber: this.issueNumber, upstream: this.repositories.upstream },
				});
			}

			const listCommentsResponse = await this.octokit.issues.listComments({
				...this.repositories.upstream,
				issue_number: this.issueNumber,
				since: "2025-01-20",
			});

			const userComment = listCommentsResponse.data.find((comment) => {
				return (
					comment.user?.login === env.REPO_FORK_OWNER &&
					comment.body?.includes(this.services.commentBuilder.comment.suffix)
				);
			});

			if (userComment) {
				logger.debug({ commentId: userComment.id }, "Updating existing comment on issue");

				const updateCommentResponse = await this.octokit.issues.updateComment({
					...this.repositories.upstream,
					issue_number: this.issueNumber,
					body: this.services.commentBuilder.concatComment(
						this.services.commentBuilder.buildComment(results, filesToTranslate),
					),
					comment_id: userComment.id,
				});

				logger.info(
					{
						issueNumber: this.issueNumber,
						commentId: updateCommentResponse.data.id,
					},
					"Updated comment on issue with compiled results",
				);

				return updateCommentResponse.data;
			}

			logger.debug("No existing comment found - creating new comment");

			const createCommentResponse = await this.octokit.issues.createComment({
				...this.repositories.upstream,
				issue_number: this.issueNumber,
				body: this.services.commentBuilder.concatComment(
					this.services.commentBuilder.buildComment(results, filesToTranslate),
				),
			});

			logger.info(
				{
					issueNumber: this.issueNumber,
					commentId: createCommentResponse.data.id,
				},
				"Created comment on issue with compiled results",
			);

			return createCommentResponse.data;
		} catch (error) {
			throw this.helpers.github.mapError(error, {
				operation: "ContentService.commentCompiledResultsOnIssue",
				metadata: {
					issueNumber: this.issueNumber,
					filesCount: filesToTranslate.length,
					resultsCount: results.length,
				},
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
			const response = await this.octokit.pulls.list({
				...this.repositories.upstream,
				head: `${this.repositories.fork.owner}:${branchName}`,
			});

			const pr = response.data[0];

			logger.debug(
				{ branchName, found: !!pr, prNumber: pr?.number },
				"Searched for pull request by branch",
			);

			return pr;
		} catch (error) {
			throw this.helpers.github.mapError(error, {
				operation: "ContentService.findPullRequestByBranch",
				metadata: { branchName, forkOwner: this.repositories.fork.owner },
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
	 *
	 * ### GitHub PR Mergeable States
	 *
	 * - `clean`: PR can be merged cleanly (no action needed)
	 * - `behind`: PR is behind base branch but has no conflicts (can be rebased safely)
	 * - `dirty`: PR has merge conflicts (requires closure and recreation)
	 * - `unstable`: PR has failing checks (not a merge conflict, no closure needed)
	 * - `blocked`: PR is blocked by review requirements (not a merge conflict)
	 *
	 * ### Implementation Details
	 *
	 * The method sets `needsUpdate = hasConflicts` where `hasConflicts` is determined by
	 * checking if `mergeable === false` AND `mergeable_state === "dirty"`. This ensures
	 * that PRs are only flagged for recreation when they have true merge conflicts, not
	 * when they're merely out of sync with the base branch.
	 *
	 * @param prNumber Pull request number to check
	 *
	 * @returns A Promise resolving to an object containing:
	 * - `hasConflicts`: `true` only when PR has actual merge conflicts
	 * - `mergeable`: GitHub's raw mergeable status (`true`/`false`/`null`)
	 * - `mergeableState`: GitHub's mergeable state string (e.g., "clean", "dirty", "behind")
	 * - `needsUpdate`: `true` only when PR has conflicts requiring closure
	 *
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
	public async checkPullRequestStatus(prNumber: number): Promise<{
		hasConflicts: boolean;
		mergeable: boolean | null;
		mergeableState: string;
		needsUpdate: boolean;
	}> {
		try {
			const prResponse = await this.octokit.pulls.get({
				...this.repositories.upstream,
				pull_number: prNumber,
			});

			const pr = prResponse.data;
			const hasConflicts = pr.mergeable === false && pr.mergeable_state === "dirty";
			const needsUpdate = hasConflicts;

			logger.info(
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
			throw this.helpers.github.mapError(error, {
				operation: "ContentService.checkPullRequestStatus",
				metadata: { prNumber, upstream: this.repositories.upstream },
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
			const response = await this.octokit.pulls.update({
				...this.repositories.upstream,
				pull_number: prNumber,
				state: "closed",
			});

			if (response.status !== 200) {
				logger.error({ prNumber, status: response.status }, "Failed to close pull request");
				throw this.helpers.github.mapError(new Error(`Failed to close pull request ${prNumber}`), {
					operation: "ContentService.closePullRequest",
					metadata: { prNumber, status: response.status },
				});
			}

			logger.info({ prNumber }, "Pull request closed successfully");

			return response.data;
		} catch (error) {
			throw this.helpers.github.mapError(error, {
				operation: "ContentService.closePullRequest",
				metadata: { prNumber, upstream: this.repositories.upstream },
			});
		}
	}
}
