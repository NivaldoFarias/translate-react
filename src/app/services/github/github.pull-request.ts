import type { RestEndpointMethodTypes } from "@octokit/rest";

import type {
	PullRequestIssueCommentSnapshot,
	PullRequestReviewSnapshot,
	PullRequestStatus,
} from "@/app/services/github/types";

import type { SharedGitHubDependencies } from "./types";

import { withRetry } from "@/app/clients/";
import { logger } from "@/app/utils/";

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

/** Max attempts to poll GitHub for a computed `mergeable` value before giving up */
const MERGEABLE_POLL_MAX_ATTEMPTS = 3;

/** Delay between `mergeable` polling attempts in milliseconds */
const MERGEABLE_POLL_DELAY_MS = 2_000;

/** Max attempts to fetch a pull request file list before failing the workflow */
const PR_FILES_FETCH_MAX_ATTEMPTS = 3;

/**
 * Pull request lifecycle and review operations on the upstream translation repository.
 */
export class GitHubPullRequest {
	private readonly logger = logger.child({ component: GitHubPullRequest.name });

	/**
	 * @param deps Shared Octokit client and repository coordinates
	 */
	constructor(private readonly deps: SharedGitHubDependencies) {}

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
	 */
	public async getPullRequestFiles(prNumber: number): Promise<string[]> {
		const response = await withRetry(
			() =>
				this.deps.octokit.paginate("GET /repos/{owner}/{repo}/pulls/{pull_number}/files", {
					...this.deps.repositories.upstream,
					pull_number: prNumber,
					per_page: 100,
				}),
			`${GitHubPullRequest.name}.${this.getPullRequestFiles.name}`,
			{ retries: PR_FILES_FETCH_MAX_ATTEMPTS - 1, minTimeout: 1, maxTimeout: 10, factor: 1 },
		);

		this.logger.debug({ count: response.length, prNumber }, "Retrieved pull request files");

		return response.map((file) => file.filename);
	}

	/**
	 * Creates a pull request.
	 *
	 * @param options Pull request options
	 * @param options.branch Head branch name for the translation PR
	 * @param options.title PR title shown on GitHub
	 * @param options.body PR description body (markdown)
	 * @param options.baseBranch Base branch on the upstream repo (default branch when omitted)
	 *
	 * @returns Octokit `pulls.create` response
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
	 * Updates the body of an open translation pull request on the upstream repository.
	 *
	 * @param prNumber Pull request number
	 * @param body Markdown body (for example advisory validation warnings after re-translation)
	 *
	 * @returns Updated pull request data
	 */
	public async updatePullRequestBody(
		prNumber: number,
		body: string,
	): Promise<RestEndpointMethodTypes["pulls"]["update"]["response"]["data"]> {
		const response = await this.deps.octokit.pulls.update({
			...this.deps.repositories.upstream,
			pull_number: prNumber,
			body,
		});

		this.logger.info({ prNumber }, "Pull request body updated");

		return response.data;
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

	/**
	 * Lists issue comments on an open translation pull request (upstream repo).
	 *
	 * @param prNumber Pull request number on the upstream repository
	 *
	 * @returns Normalized issue comments, oldest first
	 */
	public async listPullRequestIssueComments(
		prNumber: number,
	): Promise<PullRequestIssueCommentSnapshot[]> {
		const comments = await this.deps.octokit.paginate(
			"GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
			{
				...this.deps.repositories.upstream,
				issue_number: prNumber,
				per_page: 100,
			},
		);

		return comments.map((comment) => ({
			login: comment.user?.login ?? "",
			authorAssociation: comment.author_association,
			userType: comment.user?.type ?? "User",
			createdAt: new Date(comment.created_at),
			body: comment.body ?? "",
		}));
	}

	/**
	 * Lists submitted pull request reviews on an open translation pull request (upstream repo).
	 *
	 * @param prNumber Pull request number on the upstream repository
	 *
	 * @returns Normalized reviews, oldest first
	 */
	public async listPullRequestReviews(prNumber: number): Promise<PullRequestReviewSnapshot[]> {
		const reviews = await this.deps.octokit.paginate(
			"GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
			{
				...this.deps.repositories.upstream,
				pull_number: prNumber,
				per_page: 100,
			},
		);

		return reviews.flatMap((review) => {
			if (!review.submitted_at) {
				return [];
			}

			return [
				{
					id: review.id,
					login: review.user?.login ?? "",
					authorAssociation: review.author_association,
					userType: review.user?.type ?? "User",
					state: review.state as PullRequestReviewSnapshot["state"],
					submittedAt: new Date(review.submitted_at),
					body: review.body,
				},
			];
		});
	}

	/**
	 * Closes a pull request by number.
	 *
	 * @param prNumber Pull request number
	 *
	 * @returns Updated pull request data after setting `state` to `closed`
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

	/**
	 * Fetches a single PR's data from GitHub.
	 *
	 * @param prNumber Pull request number on the upstream repository
	 *
	 * @returns Pull request payload from the GitHub REST API
	 */
	private async fetchPullRequest(prNumber: number) {
		const response = await this.deps.octokit.pulls.get({
			...this.deps.repositories.upstream,
			pull_number: prNumber,
		});

		return response.data;
	}
}
