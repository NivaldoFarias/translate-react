import type { Octokit, RestEndpointMethodTypes } from "@octokit/rest";

import type { PatchedRepositoryTreeItem, ProcessedFileResult, PullRequestStatus } from "../runner";
import type { TranslationFile } from "../translator.service";

import type { CommitTranslationOptions, PullRequestOptions } from "./github.content";
import type { BaseRepositories, SharedGitHubDependencies } from "./github.types";

import { octokit } from "@/clients/";
import { env } from "@/utils/";

import { commentBuilderService } from "../comment-builder.service";

import { GitHubBranch } from "./github.branch";
import { GitHubContent } from "./github.content";
import { GitHubRepository } from "./github.repository";

export const DEFAULT_REPOSITORIES: BaseRepositories = {
	upstream: {
		owner: env.REPO_UPSTREAM_OWNER,
		repo: env.REPO_UPSTREAM_NAME,
	},
	fork: {
		owner: env.REPO_FORK_OWNER,
		repo: env.REPO_FORK_NAME,
	},
};

export interface GitHubServiceDependencies {
	octokit?: Octokit;
	repositories?: BaseRepositories;
	commentBuilderService?: typeof commentBuilderService;
}

/**
 * Unified GitHub service combining repository, branch, and content operations.
 *
 * Provides a single API for all GitHub operations while maintaining clear
 * domain separation through internal composition.
 */
export class GitHubService {
	private readonly repository: GitHubRepository;
	private readonly branch: GitHubBranch;
	private readonly content: GitHubContent;

	constructor(dependencies: GitHubServiceDependencies = {}) {
		const shared: SharedGitHubDependencies = {
			octokit: dependencies.octokit ?? octokit,
			repositories: dependencies.repositories ?? DEFAULT_REPOSITORIES,
		};

		this.content = new GitHubContent(
			shared,
			dependencies.commentBuilderService ?? commentBuilderService,
		);
		this.repository = new GitHubRepository(shared);
		this.branch = new GitHubBranch(shared);

		this.branch.setCleanupContentAccess({
			findPullRequestByBranch: this.content.findPullRequestByBranch.bind(this.content),
			checkPullRequestStatus: this.content.checkPullRequestStatus.bind(this.content),
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
	 * @param filterIgnored Whether to filter ignored paths
	 *
	 * @returns Array of repository tree items
	 */
	public async getRepositoryTree(
		target: "fork" | "upstream" = "fork",
		baseBranch?: string,
		filterIgnored = true,
	): Promise<RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"]> {
		return this.repository.getRepositoryTree(target, baseBranch, filterIgnored);
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
	 * Fetches the glossary.md file from the repository.
	 *
	 * @returns The content of the glossary file as a string, or null if not found
	 */
	public async fetchGlossary(): Promise<string | null> {
		return this.repository.fetchGlossary();
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
		return this.content.createCommentOnPullRequest(prNumber, comment);
	}

	/**
	 * Lists all open pull requests.
	 *
	 * @returns A list of open pull requests
	 */
	public async listOpenPullRequests(): Promise<
		RestEndpointMethodTypes["pulls"]["list"]["response"]["data"]
	> {
		return this.content.listOpenPullRequests();
	}

	/**
	 * Retrieves the list of files changed in a pull request.
	 *
	 * @param prNumber Pull request number to fetch changed files from
	 *
	 * @returns Array of file paths changed in the PR
	 */
	public async getPullRequestFiles(prNumber: number): Promise<string[]> {
		return this.content.getPullRequestFiles(prNumber);
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
		return this.content.commitTranslation(options);
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
		return this.content.createPullRequest(options);
	}

	/**
	 * Fetches raw content of a file from GitHub.
	 *
	 * @param file File reference to fetch
	 *
	 * @returns Translation file with content
	 */
	public async getFile(file: PatchedRepositoryTreeItem): Promise<TranslationFile> {
		return this.content.getFile(file);
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
		return this.content.findPullRequestByBranch(branchName);
	}

	/**
	 * Checks if a pull request has merge conflicts that require closing and recreating.
	 *
	 * @param prNumber Pull request number to check
	 *
	 * @returns PR status information
	 */
	public async checkPullRequestStatus(prNumber: number): Promise<PullRequestStatus> {
		return this.content.checkPullRequestStatus(prNumber);
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
		return this.content.closePullRequest(prNumber);
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
		filesToTranslate: TranslationFile[],
	): Promise<RestEndpointMethodTypes["issues"]["createComment"]["response"]["data"] | undefined> {
		return this.content.commentCompiledResultsOnIssue(results, filesToTranslate);
	}
}

export const githubService = new GitHubService();
