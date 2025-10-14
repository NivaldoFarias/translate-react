import type { RestEndpointMethodTypes } from "@octokit/rest";

import { BranchService } from "@/services/github/branch.service";
import {
	CommitTranslationOptions,
	ContentService,
	PullRequestOptions,
} from "@/services/github/content.service";
import { RepositoryService } from "@/services/github/repository.service";

import { ProcessedFileResult } from "../runner/base.service";
import { TranslationFile } from "../translator.service";

import { BaseGitHubService } from "./base.service";

/**
 * Main GitHub service that integrates specialized services for repository operations.
 * Provides a unified interface for GitHub operations while maintaining separation of concerns.
 *
 * ### Responsibilities
 *
 * - Service orchestration and integration
 * - Repository configuration management
 * - Unified interface for GitHub operations
 * - Error handling and recovery
 */
export class GitHubService extends BaseGitHubService {
	private readonly services = {
		branch: new BranchService(),
		repository: new RepositoryService(),
		content: new ContentService(),
	};

	/**
	 * Retrieves the repository file tree.
	 *
	 * Can optionally filter out ignored paths.
	 *
	 * @param baseBranch Branch to get tree from
	 * @param filterIgnored Whether to filter ignored paths
	 *
	 * @example
	 * ```typescript
	 * const tree = await repoService.getRepositoryTree('main', true);
	 * ```
	 */
	public async getRepositoryTree(baseBranch?: string, filterIgnored = true) {
		return this.services.repository.getRepositoryTree(baseBranch, filterIgnored);
	}

	/**
	 * Fetches raw content of a file from GitHub.
	 *
	 * @param file File reference to fetch
	 *
	 * @returns The raw content of the file
	 *
	 * @example
	 * ```typescript
	 * const content = await github.getFileContent(file);
	 * ```
	 */
	public async getFileContent(
		file:
			| TranslationFile
			| RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"][number],
	) {
		return this.services.content.getFileContent(file);
	}

	/**
	 * Retrieves markdown files that need translation.
	 *
	 * @param maxFiles Optional limit on number of files to retrieve
	 *
	 * @example
	 * ```typescript
	 * const files = await github.getUntranslatedFiles(5);
	 * ```
	 */
	public async getUntranslatedFiles(maxFiles?: number) {
		return this.services.content.getUntranslatedFiles(maxFiles);
	}

	/**
	 * Lists all open pull requests for the fork repository.
	 *
	 * Used to check for existing translation PRs to avoid duplicates
	 * and skip files that already have pending translations.
	 *
	 * @returns Array of open pull request data
	 *
	 * @example
	 * ```typescript
	 * const openPRs = await github.listOpenPullRequests();
	 * ```
	 */
	public async listOpenPullRequests() {
		return this.services.content.listOpenPullRequests();
	}

	/**
	 * Creates a new branch for translation work, or gets the existing branch if it exists.
	 *
	 * @param file File being translated
	 * @param baseBranch Branch to create from
	 *
	 * @example
	 * ```typescript
	 * const branch = await github.createOrGetTranslationBranch(file);
	 * ```
	 */
	public async createOrGetTranslationBranch(file: TranslationFile, baseBranch?: string) {
		const actualBaseBranch =
			baseBranch || (await this.services.repository.getDefaultBranch("fork"));
		const branchName = `translate/${file.path.split("/").slice(2).join("/")}`;
		const existingBranch = await this.services.branch.getBranch(branchName);

		if (existingBranch) {
			const mainBranchRef = await this.services.branch.getBranch(actualBaseBranch);
			if (!mainBranchRef) throw new Error(`Base branch ${actualBaseBranch} not found`);

			if (existingBranch.data.object.sha === mainBranchRef.data.object.sha) {
				return existingBranch.data;
			}

			const upstreamPR = await this.services.content.findPullRequestByBranch(branchName);
			if (upstreamPR) {
				await this.services.content.createCommentOnPullRequest(
					upstreamPR.number,
					"PR closed due to upstream changes.",
				);

				await this.services.content.closePullRequest(upstreamPR.number);
			}

			await this.services.branch.deleteBranch(branchName);
		}

		const newBranch = await this.services.branch.createBranch(branchName, actualBaseBranch);

		return newBranch.data;
	}

	/**
	 * Commits translated content to a branch.
	 *
	 * @param options Commit options
	 */
	public async commitTranslation(
		options: CommitTranslationOptions,
	): Promise<RestEndpointMethodTypes["repos"]["createOrUpdateFileContents"]["response"]> {
		return await this.services.content.commitTranslation(options);
	}

	/**
	 * Creates a pull request for translated content.
	 *
	 * @param options Pull request options
	 */
	public async createPullRequest(
		options: PullRequestOptions,
	): Promise<RestEndpointMethodTypes["pulls"]["create"]["response"]["data"]> {
		return this.services.content.createPullRequest(options);
	}

	/**
	 * Handles pull request creation or update for a translation file.
	 *
	 * Checks if a PR already exists for the file's branch, and if so, evaluates
	 * whether it needs updating due to conflicts or being outdated. Handles the
	 * complete PR lifecycle including closing outdated PRs and creating new ones.
	 *
	 * @param file Translation file being processed
	 * @param prOptions Pull request creation options
	 *
	 * @returns The created or existing pull request data
	 *
	 * @example
	 * ```typescript
	 * const pr = await github.createOrUpdatePullRequest(file, {
	 *   title: 'Translate homepage',
	 *   body: 'Translation to Portuguese',
	 *   baseBranch: 'main'
	 * });
	 * ```
	 */
	public async createOrUpdatePullRequest(
		file: TranslationFile,
		prOptions: Omit<PullRequestOptions, "branch">,
	): Promise<
		| RestEndpointMethodTypes["pulls"]["create"]["response"]["data"]
		| RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number]
	> {
		const branchName = `translate/${file.path.split("/").slice(2).join("/")}`;
		const existingPR = await this.services.content.findPullRequestByBranch(branchName);

		if (existingPR) {
			const prStatus = await this.services.content.checkPullRequestStatus(existingPR.number);

			if (prStatus.needsUpdate) {
				await this.services.content.createCommentOnPullRequest(
					existingPR.number,
					"This PR is being closed and recreated due to conflicts or outdated content. A new PR with updated translation will be created.",
				);

				await this.services.content.closePullRequest(existingPR.number);

				return await this.services.content.createPullRequest({
					branch: branchName,
					...prOptions,
					baseBranch: prOptions.baseBranch || "main",
				});
			}

			return existingPR;
		}

		return await this.services.content.createPullRequest({
			branch: branchName,
			...prOptions,
			baseBranch: prOptions.baseBranch || "main",
		});
	}

	/**
	 * Removes a branch after successful merge or on failure.
	 *
	 * @param branch Branch to delete
	 *
	 * @example
	 * ```typescript
	 * await github.cleanupBranch('translate/homepage');
	 * ```
	 */
	public async cleanupBranch(branch: string): Promise<void> {
		await this.services.branch.deleteBranch(branch);
	}

	/**
	 * Retrieves list of currently active branches.
	 *
	 * @example
	 * ```typescript
	 * const branches = github.getActiveBranches();
	 * ```
	 */
	public getActiveBranches(): string[] {
		return this.services.branch.getActiveBranches();
	}

	/**
	 * Verifies GitHub token permissions.
	 *
	 * @example
	 * ```typescript
	 * const hasPermissions = await github.verifyTokenPermissions();
	 * ```
	 */
	public async verifyTokenPermissions(): Promise<boolean> {
		return this.services.repository.verifyTokenPermissions();
	}

	/**
	 * Checks if fork is synchronized with upstream.
	 *
	 * @example
	 * ```typescript
	 * const needsSync = !(await github.isForkSynced());
	 * ```
	 */
	public async isForkSynced(): Promise<boolean> {
		return this.services.repository.isForkSynced();
	}

	/**
	 * Synchronizes fork with upstream repository.
	 *
	 * @example
	 * ```typescript
	 * if (!(await github.isForkSynced())) {
	 *   await github.syncFork();
	 * }
	 * ```
	 */
	public async syncFork(): Promise<boolean> {
		return this.services.repository.syncFork();
	}

	/**
	 * Comments compiled results on a GitHub issue.
	 *
	 * @param results Translation results to report
	 * @param filesToTranslate Files that were translated
	 *
	 * @example
	 * ```typescript
	 * const comment = await github.commentCompiledResultsOnIssue(results, filesToTranslate);
	 * ```
	 */
	public async commentCompiledResultsOnIssue(
		results: ProcessedFileResult[],
		filesToTranslate: TranslationFile[],
	): Promise<RestEndpointMethodTypes["issues"]["createComment"]["response"]["data"]> {
		return this.services.content.commentCompiledResultsOnIssue(results, filesToTranslate);
	}

	/**
	 * Checks if a commit exists on a branch.
	 *
	 * @param branchName Name of branch to check
	 * @param commitSha SHA of commit to check
	 *
	 * @example
	 * ```typescript
	 * const exists = await github.checkIfCommitExistsOnFork('main', '1234567890');
	 * ```
	 */
	public async checkIfCommitExistsOnFork(branchName: string): Promise<boolean> {
		return this.services.branch.checkIfCommitExistsOnFork(branchName);
	}

	/**
	 * Fetches the glossary.md file from the repository.
	 *
	 * @returns The content of the glossary file as a `string`, or `null` if the file doesn't exist or cannot be retrieved
	 *
	 * @example
	 * ```typescript
	 * const glossary = await github.fetchGlossary();
	 * ```
	 */
	public async getGlossary(): Promise<string | null> {
		return this.services.repository.fetchGlossary();
	}
}
