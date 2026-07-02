import type { Octokit, RestEndpointMethodTypes } from "@octokit/rest";

import type { CommentBuilderService } from "@/app/services/comment-builder/comment-builder.service";
import type {
	PatchedRepositoryTreeItem,
	ProcessedFileResult,
	PullRequestStatus,
	RepositoryMarkdownBlob,
	TranslationProgressFileRef,
} from "@/app/services/github/types";

import type { PullRequestOptions } from "./github.pull-request";
import type { CommitTranslationOptions } from "./github.repository-content";
import type { BaseRepositories, SharedGitHubDependencies } from "./types";

import { octokit } from "@/app/clients/";
import { env } from "@/app/utils/";

import { GitHubBranch } from "./github.branch";
import { GitHubProgressIssue } from "./github.progress-issue";
import { GitHubPullRequest } from "./github.pull-request";
import { GitHubRepository } from "./github.repository";
import { GitHubRepositoryContent } from "./github.repository-content";

const DEFAULT_REPOSITORIES: BaseRepositories = {
	upstream: {
		owner: env.REPO_UPSTREAM_OWNER,
		repo: env.REPO_UPSTREAM_NAME,
	},
	fork: {
		owner: env.REPO_FORK_OWNER,
		repo: env.REPO_FORK_NAME,
	},
};

/** Dependency injection interface for {@link GitHubService} */
export interface GitHubServiceDependencies {
	/** Octokit client (defaults to the shared app-level client) */
	octokit?: Octokit;

	/** Upstream and fork repository coordinates (defaults to env-configured repositories) */
	repositories?: BaseRepositories;

	/** Builder for advisory validation comments on pull requests and issues */
	commentBuilderService: CommentBuilderService;
}

/**
 * Unified GitHub service composing repository, branch, file content, pull
 * request, and progress issue operations.
 *
 * Provides a single API for all GitHub operations by delegating to
 * {@link GitHubRepository}, {@link GitHubBranch}, {@link GitHubRepositoryContent},
 * {@link GitHubPullRequest}, and {@link GitHubProgressIssue}.
 */
export class GitHubService {
	private readonly repository: GitHubRepository;
	private readonly branch: GitHubBranch;
	private readonly repositoryContent: GitHubRepositoryContent;
	private readonly pullRequest: GitHubPullRequest;
	private readonly progressIssue: GitHubProgressIssue;

	/**
	 * Wires the composed GitHub sub-services and binds branch cleanup to pull request lookups.
	 *
	 * @param dependencies Octokit client, repository coordinates, and comment builder service
	 */
	constructor(dependencies: GitHubServiceDependencies) {
		const shared: SharedGitHubDependencies = {
			octokit: dependencies.octokit ?? octokit,
			repositories: dependencies.repositories ?? DEFAULT_REPOSITORIES,
		};

		this.repositoryContent = new GitHubRepositoryContent(shared);
		this.pullRequest = new GitHubPullRequest(shared);
		this.progressIssue = new GitHubProgressIssue(shared, dependencies.commentBuilderService);
		this.repository = new GitHubRepository(shared);
		this.branch = new GitHubBranch(shared);

		this.branch.setCleanupPullRequestAccess({
			findPullRequestByBranch: this.pullRequest.findPullRequestByBranch.bind(this.pullRequest),
			checkPullRequestStatus: this.pullRequest.checkPullRequestStatus.bind(this.pullRequest),
		});
	}

	// === Repository Methods ===

	/**
	 * Gets the default branch name for a repository.
	 *
	 * @param target Which repository to check ('fork' or 'upstream')
	 *
	 * @returns The default branch name
	 */
	public async getDefaultBranch(target: "fork" | "upstream" = "fork"): Promise<string> {
		return this.repository.getDefaultBranch(target);
	}

	/**
	 * Retrieves the repository file tree from fork or upstream.
	 *
	 * @param target Which repository to fetch tree from ('fork' or 'upstream')
	 * @param baseBranch Branch to get tree from (defaults to target's default branch)
	 *
	 * @returns Array of repository tree items
	 */
	public async getRepositoryTree(
		target: "fork" | "upstream" = "fork",
		baseBranch?: string,
	): Promise<RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"]> {
		return this.repository.getRepositoryTree(target, baseBranch);
	}

	/**
	 * Verifies that the GitHub token has required permissions.
	 *
	 * @returns `true` if token has access to both repositories, `false` otherwise
	 */
	public async verifyTokenPermissions(): Promise<boolean> {
		return this.repository.verifyTokenPermissions();
	}

	/**
	 * Checks if a branch is behind its base branch.
	 *
	 * @param headBranch Branch to check
	 * @param baseBranch Base branch to compare against
	 * @param target Which repository to check ('fork' or 'upstream')
	 *
	 * @returns `true` if head is behind base, `false` if up-to-date or ahead
	 */
	public async isBranchBehind(
		headBranch: string,
		baseBranch: string,
		target: "fork" | "upstream" = "fork",
	): Promise<boolean> {
		return this.repository.isBranchBehind(headBranch, baseBranch, target);
	}

	/**
	 * Checks if the fork repository exists.
	 *
	 * If it does not exist, an error is thrown.
	 *
	 * @returns Resolves when the fork repo is reachable via the API
	 */
	public async forkExists(): Promise<void> {
		return this.repository.forkExists();
	}

	/**
	 * Checks if the fork is synchronized with upstream.
	 *
	 * @returns `true` if fork is synced, `false` otherwise
	 */
	public async isForkSynced(): Promise<boolean> {
		return this.repository.isForkSynced();
	}

	/**
	 * Synchronizes the fork with the upstream repository.
	 *
	 * @returns `true` if sync succeeded, `false` otherwise
	 */
	public async syncFork(): Promise<boolean> {
		return this.repository.syncFork();
	}

	/**
	 * Fetches the translation guidelines file from the upstream repository.
	 *
	 * Uses auto-discovery to find the guidelines file unless `TRANSLATION_GUIDELINES_FILE`
	 * env var is explicitly set. Common filenames like `GLOSSARY.md` and `TRANSLATION.md`
	 * are checked in priority order.
	 *
	 * @returns The content of the translation guidelines file as a string, or `null` if not found
	 *
	 * @see {@link TRANSLATION_GUIDELINES_CANDIDATES} for the list of auto-discovered filenames
	 */
	public async fetchTranslationGuidelinesFile(): Promise<string | null> {
		return this.repository.fetchTranslationGuidelinesFile();
	}

	// === Branch Methods ===

	/**
	 * Creates a new Git branch from a base branch.
	 *
	 * @param branchName Name for the new branch
	 * @param baseBranch Branch to create from
	 *
	 * @returns Branch reference data
	 */
	public async createBranch(
		branchName: string,
		baseBranch?: string,
	): Promise<RestEndpointMethodTypes["git"]["createRef"]["response"]> {
		return this.branch.createBranch(branchName, baseBranch);
	}

	/**
	 * Retrieves information about an existing branch.
	 *
	 * @param branchName Name of branch to retrieve
	 *
	 * @returns Branch reference data or undefined if not found
	 */
	public async getBranch(
		branchName: string,
	): Promise<RestEndpointMethodTypes["git"]["getRef"]["response"] | undefined> {
		return this.branch.getBranch(branchName);
	}

	/**
	 * Deletes a Git branch and removes it from tracking.
	 *
	 * @param branchName Name of branch to delete
	 *
	 * @returns Deletion response
	 */
	public async deleteBranch(
		branchName: string,
	): Promise<RestEndpointMethodTypes["git"]["deleteRef"]["response"]> {
		return this.branch.deleteBranch(branchName);
	}

	/**
	 * Recreates a translation topic branch from the fork default tip without closing its pull request.
	 *
	 * @param branchName Translation branch to refresh
	 *
	 * @returns New branch reference data
	 */
	public async refreshTranslationBranchPreservePr(
		branchName: string,
	): Promise<RestEndpointMethodTypes["git"]["getRef"]["response"]["data"]> {
		return this.branch.refreshTranslationBranchPreservePr(branchName);
	}

	// === Content/PR Methods ===

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
		return this.pullRequest.createCommentOnPullRequest(prNumber, comment);
	}

	/**
	 * Lists all open pull requests.
	 *
	 * @returns A list of open pull requests
	 */
	public async listOpenPullRequests(): Promise<
		RestEndpointMethodTypes["pulls"]["list"]["response"]["data"]
	> {
		return this.pullRequest.listOpenPullRequests();
	}

	/**
	 * Retrieves the list of files changed in a pull request.
	 *
	 * @param prNumber Pull request number to fetch changed files from
	 *
	 * @returns Array of file paths changed in the PR
	 */
	public async getPullRequestFiles(prNumber: number): Promise<string[]> {
		return this.pullRequest.getPullRequestFiles(prNumber);
	}

	/**
	 * Commits translated content to a branch.
	 *
	 * @param options Commit options
	 *
	 * @returns Commit response
	 */
	public async commitTranslation(
		options: CommitTranslationOptions,
	): Promise<RestEndpointMethodTypes["repos"]["createOrUpdateFileContents"]["response"]> {
		return this.repositoryContent.commitTranslation(options);
	}

	/**
	 * Creates a pull request.
	 *
	 * @param options Pull request options
	 *
	 * @returns Created pull request data
	 */
	public async createPullRequest(
		options: PullRequestOptions,
	): Promise<RestEndpointMethodTypes["pulls"]["create"]["response"]["data"]> {
		return this.pullRequest.createPullRequest(options);
	}

	/**
	 * Updates the body of an open translation pull request.
	 *
	 * @param prNumber Pull request number on the upstream repository
	 * @param body Markdown pull request description
	 *
	 * @returns Updated pull request data
	 */
	public async updatePullRequestBody(
		prNumber: number,
		body: string,
	): Promise<RestEndpointMethodTypes["pulls"]["update"]["response"]["data"]> {
		return this.pullRequest.updatePullRequestBody(prNumber, body);
	}

	/**
	 * Fetches source markdown from the upstream default branch at `file.path`.
	 *
	 * @param file File reference from the upstream repository tree
	 *
	 * @returns Translation file with upstream content and blob `sha`
	 */
	public async getFile(file: PatchedRepositoryTreeItem): Promise<RepositoryMarkdownBlob> {
		return this.repositoryContent.getFile(file);
	}

	/**
	 * Reads markdown content from the fork at a translation branch tip.
	 *
	 * @param path Repository path of the file
	 * @param branchName Translation branch name without `refs/heads/` prefix
	 *
	 * @returns File body, or `undefined` when absent on that branch
	 */
	public async getForkFileContentAtBranch(path: string, branchName: string) {
		return this.repositoryContent.getForkFileContentAtBranch(path, branchName);
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
		return this.pullRequest.findPullRequestByBranch(branchName);
	}

	/**
	 * Checks if a pull request has merge conflicts that require refreshing its translation branch.
	 *
	 * @param prNumber Pull request number to check
	 *
	 * @returns PR status information
	 */
	public async checkPullRequestStatus(prNumber: number): Promise<PullRequestStatus> {
		return this.pullRequest.checkPullRequestStatus(prNumber);
	}

	/**
	 * Closes a pull request by number.
	 *
	 * @param prNumber Pull request number
	 *
	 * @returns Updated pull request data
	 */
	public async closePullRequest(
		prNumber: number,
	): Promise<RestEndpointMethodTypes["pulls"]["update"]["response"]["data"]> {
		return this.pullRequest.closePullRequest(prNumber);
	}

	/**
	 * Lists issue comments on a translation pull request.
	 *
	 * @param prNumber Pull request number on the upstream repository
	 *
	 * @returns Normalized issue comments
	 */
	public async listPullRequestIssueComments(prNumber: number) {
		return this.pullRequest.listPullRequestIssueComments(prNumber);
	}

	/**
	 * Lists submitted reviews on a translation pull request.
	 *
	 * @param prNumber Pull request number on the upstream repository
	 *
	 * @returns Normalized reviews for approved-pull-request preservation checks
	 */
	public async listPullRequestReviews(prNumber: number) {
		return this.pullRequest.listPullRequestReviews(prNumber);
	}

	/**
	 * Posts translation results as comments on GitHub issues.
	 *
	 * @param results Translation results to report
	 * @param filesToTranslate Files that were translated
	 *
	 * @returns The comment created on the issue or undefined
	 */
	public async commentCompiledResultsOnIssue(
		results: ProcessedFileResult[],
		filesToTranslate: readonly TranslationProgressFileRef[],
	): Promise<RestEndpointMethodTypes["issues"]["createComment"]["response"]["data"] | undefined> {
		return this.progressIssue.commentCompiledResultsOnIssue(results, filesToTranslate);
	}
}
