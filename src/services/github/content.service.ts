import type { RestEndpointMethodTypes } from "@octokit/rest";

import { BaseGitHubService } from "@/services/github/base.service";
import { env } from "@/utils";

import { CommentBuilderService } from "../comment-builder.service";
import { ProcessedFileResult } from "../runner/base.service";
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
	public createCommentOnPullRequest(
		prNumber: number,
		comment: string,
	): Promise<RestEndpointMethodTypes["issues"]["createComment"]["response"]> {
		return this.octokit.issues.createComment({
			...this.upstream,
			issue_number: prNumber,
			body: comment,
		});
	}

	/**
	 * Lists all open pull requests.
	 *
	 * @returns A list of open pull requests
	 */
	public async listOpenPullRequests(): Promise<
		RestEndpointMethodTypes["pulls"]["list"]["response"]
	> {
		return await this.octokit.pulls.list({
			...this.upstream,
			state: "open",
		});
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
		return this.octokit.pulls.get({ ...this.upstream, pull_number: prNumber });
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
		const repoTreeResponse = await this.octokit.git.getTree({
			...this.fork,
			tree_sha: "main",
			recursive: "true",
		});

		if (!repoTreeResponse.data.tree) {
			throw new Error("Repository tree is empty");
		}

		const markdownFiles = this.filterMarkdownFiles(repoTreeResponse.data.tree);
		const filesToProcess = maxFiles ? markdownFiles.slice(0, maxFiles) : markdownFiles;

		const files: TranslationFile[] = [];

		for (const file of filesToProcess) {
			if (!file.path) continue;

			try {
				const response = await this.octokit.repos.getContent({
					...this.fork,
					path: file.path,
				});

				if (!("content" in response.data)) continue;

				files.push({
					path: file.path,
					content: Buffer.from(response.data.content, "base64").toString(),
					sha: response.data.sha,
					filename: file.path.split("/").pop()!,
				});
			} catch {
				continue;
			}
		}

		return files;
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
		return await this.octokit.repos.createOrUpdateFileContents({
			...this.fork,
			path: file.path,
			message,
			content: Buffer.from(content).toString("base64"),
			branch: branch.ref,
			sha: file.sha,
		});
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
		// Import env inside method to avoid circular dependencies
		const { env } = await import("@/utils/");

		// In dev mode, create PRs against the fork; in production, against upstream
		const targetRepo = env.DEV_MODE_FORK_PR ? this.fork : this.upstream;
		const headRef = env.DEV_MODE_FORK_PR ? branch : `${this.fork.owner}:${branch}`;

		const createPullRequestResponse = await this.octokit.pulls.create({
			...targetRepo,
			title,
			body,
			head: headRef,
			base: baseBranch,
			maintainer_can_modify: true,
		});

		return createPullRequestResponse.data;
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
		const blobSha = file.sha;

		if (!blobSha) throw new Error("Invalid blob URL");

		const response = await this.octokit.git.getBlob({
			...this.fork,
			file_sha: blobSha,
		});

		return Buffer.from(response.data.content, "base64").toString();
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
		const issueExistsResponse = await this.octokit.issues.get({
			...this.upstream,
			issue_number: this.issueNumber,
		});

		if (!issueExistsResponse.data) {
			throw new Error(`Issue ${this.issueNumber} not found`);
		}

		const listCommentsResponse = await this.octokit.issues.listComments({
			...this.upstream,
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
			const updateCommentResponse = await this.octokit.issues.updateComment({
				...this.upstream,
				issue_number: this.issueNumber,
				body: this.services.commentBuilder.concatComment(
					this.services.commentBuilder.buildComment(results, filesToTranslate),
				),
				comment_id: userComment.id,
			});

			return updateCommentResponse.data;
		}

		const createCommentResponse = await this.octokit.issues.createComment({
			...this.upstream,
			issue_number: this.issueNumber,
			body: this.services.commentBuilder.concatComment(
				this.services.commentBuilder.buildComment(results, filesToTranslate),
			),
		});

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
		const response = await this.octokit.pulls.list({
			...this.upstream,
			head: `${this.fork.owner}:${branchName}`,
		});

		return response.data[0];
	}

	/**
	 * Checks if a pull request is outdated or has merge conflicts.
	 *
	 * Determines if a PR needs to be updated by examining its mergeable status
	 * and checking for conflicts that prevent clean merging.
	 *
	 * @param prNumber Pull request number to check
	 *
	 * @returns A Promise resolving to an object with conflict status and mergeability info
	 *
	 * @example
	 * ```typescript
	 * const status = await contentService.checkPullRequestStatus(123);
	 * if (status.hasConflicts) {
	 *   console.log('PR has conflicts and needs updating');
	 * }
	 * ```
	 */
	public async checkPullRequestStatus(prNumber: number): Promise<{
		hasConflicts: boolean;
		mergeable: boolean | null;
		mergeableState: string;
		needsUpdate: boolean;
	}> {
		const prResponse = await this.octokit.pulls.get({
			...this.upstream,
			pull_number: prNumber,
		});

		const pr = prResponse.data;
		const hasConflicts = pr.mergeable === false && pr.mergeable_state === "dirty";
		const needsUpdate = hasConflicts || pr.mergeable_state === "behind";

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
		const response = await this.octokit.pulls.update({
			...this.upstream,
			pull_number: prNumber,
			state: "closed",
		});

		if (response.status !== 200) throw new Error(`Failed to close pull request ${prNumber}`);

		return response.data;
	}
}
