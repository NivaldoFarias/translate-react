import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { ProcessedFileResult } from "@/services/runner/";

import {
	BranchService,
	CommitTranslationOptions,
	ContentService,
	PullRequestOptions,
	RepositoryService,
} from "@/services/github/";
import { logger } from "@/utils/";

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
	 * Creates a new branch for translation work, or reuses an existing branch if appropriate.
	 *
	 * This method intelligently handles existing branches by evaluating their associated PRs
	 * for merge conflicts. When a branch already exists, the method checks if there's an open
	 * PR and evaluates its merge status using {@link ContentService.checkPullRequestStatus}.
	 * Branches are only deleted and recreated when their associated PRs have actual merge
	 * conflicts (not when they're simply behind the base branch).
	 *
	 * ### Branch Reuse Scenarios
	 *
	 * 1. **Branch exists with PR having no conflicts**: Reuses existing branch, preserving PR
	 * 2. **Branch exists with PR having conflicts**: Closes PR, deletes branch, creates new branch
	 * 3. **Branch exists without PR**: Reuses existing branch safely
	 * 4. **No existing branch**: Creates new branch from base
	 *
	 * ### Conflict Detection Logic
	 *
	 * The method uses `checkPullRequestStatus()` which only flags PRs with `hasConflicts = true`
	 * when GitHub indicates `mergeable === false` and `mergeable_state === "dirty"`. PRs that
	 * are merely "behind" the base branch are considered safe to reuse and can be updated via
	 * rebase without requiring closure.
	 *
	 * @param file Translation file being processed
	 * @param baseBranch Optional base branch to create from (defaults to fork's default branch)
	 *
	 * @returns Branch reference data containing SHA and branch name for subsequent commit operations
	 *
	 * @example
	 * ```typescript
	 * const branch = await github.createOrGetTranslationBranch(file, 'main');
	 * console.log(branch.ref);
	 * // ^? "refs/heads/translate/content/learn/homepage.md"
	 * ```
	 *
	 * @see {@link ContentService.checkPullRequestStatus} for conflict detection logic
	 * @see {@link BranchService.getBranch} for branch existence checking
	 */
	public async createOrGetTranslationBranch(file: TranslationFile, baseBranch?: string) {
		const actualBaseBranch =
			baseBranch || (await this.services.repository.getDefaultBranch("fork"));
		const branchName = `translate/${file.path.split("/").slice(2).join("/")}`;

		logger.debug(
			{ filename: file.filename, branchName },
			"Checking for existing translation branch",
		);
		const existingBranch = await this.services.branch.getBranch(branchName);

		if (existingBranch) {
			logger.debug(
				{ filename: file.filename, branchName },
				"Existing branch found, checking associated PR status",
			);

			const upstreamPR = await this.services.content.findPullRequestByBranch(branchName);

			if (upstreamPR) {
				const prStatus = await this.services.content.checkPullRequestStatus(upstreamPR.number);

				if (prStatus.hasConflicts) {
					logger.info(
						{
							filename: file.filename,
							prNumber: upstreamPR.number,
							mergeableState: prStatus.mergeableState,
						},
						"PR has merge conflicts, closing and recreating",
					);
					await this.services.content.createCommentOnPullRequest(
						upstreamPR.number,
						"This PR has merge conflicts and is being closed. A new PR with the updated translation will be created.",
					);

					await this.services.content.closePullRequest(upstreamPR.number);
					await this.services.branch.deleteBranch(branchName);
				} else {
					logger.debug(
						{
							filename: file.filename,
							prNumber: upstreamPR.number,
							mergeableState: prStatus.mergeableState,
						},
						"PR exists with no conflicts, reusing existing branch",
					);
					return existingBranch.data;
				}
			} else {
				logger.debug({ filename: file.filename, branchName }, "Branch exists without PR, reusing");
				return existingBranch.data;
			}
		}

		logger.debug({ filename: file.filename, branchName }, "Creating new translation branch");
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
	 * Handles pull request creation or reuse for a translation file.
	 *
	 * Implements intelligent PR lifecycle management by checking if a PR already exists for
	 * the translation branch and evaluating its merge status. The method uses
	 * {@link ContentService.checkPullRequestStatus} to determine if an existing PR has actual
	 * merge conflicts. PRs are only closed and recreated when they have true conflicts
	 * (indicated by `needsUpdate = true`). PRs that are merely behind the base branch are
	 * preserved since they can be safely rebased without closure.
	 *
	 * ### PR Handling Logic
	 *
	 * 1. **No existing PR**: Creates new PR with provided options
	 * 2. **Existing PR without conflicts**: Returns existing PR (preserves PR number and discussion)
	 * 3. **Existing PR with conflicts**: Closes conflicted PR, creates new PR with updated content
	 *
	 * ### Conflict Resolution
	 *
	 * When conflicts are detected (`needsUpdate = true`), the method:
	 * - Adds an explanatory comment to the existing PR
	 * - Closes the conflicted PR
	 * - Creates a new PR with the same title/body but fresh translation content
	 *
	 * @param file Translation file being processed
	 * @param prOptions Pull request creation options (excluding branch, which is auto-generated)
	 *
	 * @returns Either the newly created PR data or the existing PR data if reused
	 *
	 * @example
	 * ```typescript
	 * const pr = await github.createOrUpdatePullRequest(file, {
	 *   title: 'Translate homepage to Portuguese',
	 *   body: 'Translation of homepage.md',
	 *   baseBranch: 'main'
	 * });
	 * console.log(pr.number);
	 * // ^? Existing PR number if reused, new PR number if created
	 * ```
	 *
	 * @see {@link ContentService.checkPullRequestStatus} for conflict detection logic
	 * @see {@link ContentService.findPullRequestByBranch} for PR lookup
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
				logger.info(
					{ prNumber: existingPR.number, mergeableState: prStatus.mergeableState },
					"Closing PR with merge conflicts and creating new one",
				);
				await this.services.content.createCommentOnPullRequest(
					existingPR.number,
					"This PR has merge conflicts and is being closed. A new PR with the updated translation will be created.",
				);

				await this.services.content.closePullRequest(existingPR.number);

				return await this.services.content.createPullRequest({
					branch: branchName,
					...prOptions,
					baseBranch: prOptions.baseBranch || "main",
				});
			}

			logger.debug(
				{ prNumber: existingPR.number, mergeableState: prStatus.mergeableState },
				"PR exists with no conflicts, reusing",
			);
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
