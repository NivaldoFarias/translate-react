import type { ParsedContent, ProcessedFileResult, TranslationFile } from "@/types";
import type { RestEndpointMethodTypes } from "@octokit/rest";

import { BranchService } from "@/services/github/branch.service";
import { ContentService } from "@/services/github/content.service";
import { RepositoryService } from "@/services/github/repository.service";

/**
 * Main GitHub service that integrates specialized services for repository operations.
 * Provides a unified interface for GitHub operations while maintaining separation of concerns.
 *
 * ## Responsibilities
 * - Service orchestration and integration
 * - Repository configuration management
 * - Unified interface for GitHub operations
 * - Error handling and recovery
 */
export class GitHubService {
	/**
	 * Repository configuration for upstream and fork
	 */
	protected readonly repos = {
		upstream: {
			owner: import.meta.env.ORIGINAL_REPO_OWNER!,
			repo: import.meta.env.REPO_NAME!,
		},
		fork: {
			owner: import.meta.env.REPO_OWNER!,
			repo: import.meta.env.REPO_NAME!,
		},
	};

	private readonly branchService = new BranchService(
		this.repos.fork.owner,
		this.repos.fork.repo,
		import.meta.env.GITHUB_TOKEN!,
	);

	private readonly repositoryService = new RepositoryService(
		this.repos.upstream,
		this.repos.fork,
		import.meta.env.GITHUB_TOKEN!,
	);

	private readonly contentService = new ContentService(
		this.repos.upstream,
		this.repos.fork,
		import.meta.env.GITHUB_TOKEN!,
	);

	/**
	 * Creates a new GitHub service instance.
	 * Initializes all specialized services with repository configuration.
	 *
	 * @example
	 * ```typescript
	 * const github = new GitHubService();
	 * await github.verifyTokenPermissions();
	 * ```
	 */
	constructor() {}

	/**
	 * Retrieves the repository file tree.
	 * Can optionally filter out ignored paths.
	 *
	 * @param baseBranch - Branch to get tree from
	 * @param filterIgnored - Whether to filter ignored paths
	 *
	 * @example
	 * ```typescript
	 * const tree = await repoService.getRepositoryTree('main', true);
	 * ```
	 */
	public async getRepositoryTree(baseBranch = "main", filterIgnored = true) {
		return this.repositoryService.getRepositoryTree(baseBranch, filterIgnored);
	}

	/**
	 * Fetches raw content of a file from GitHub.
	 *
	 * @param file - File reference to fetch
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
		return this.contentService.getFileContent(file);
	}

	/**
	 * Retrieves markdown files that need translation.
	 *
	 * @param maxFiles - Optional limit on number of files to retrieve
	 *
	 * @example
	 * ```typescript
	 * const files = await github.getUntranslatedFiles(5);
	 * ```
	 */
	public async getUntranslatedFiles(maxFiles?: number) {
		return this.contentService.getUntranslatedFiles(maxFiles);
	}

	/**
	 * Creates a new branch for translation work.
	 *
	 * @param fileName - Name of file being translated
	 * @param baseBranch - Branch to create from
	 *
	 * @example
	 * ```typescript
	 * const branch = await github.createTranslationBranch('homepage.md');
	 * ```
	 */
	public async createTranslationBranch(fileName: string, baseBranch = "main") {
		const branchName = `translate/${fileName}`;
		const existingBranch = await this.branchService.getBranch(branchName);
		if (existingBranch) return existingBranch.data;

		return (await this.branchService.createBranch(branchName, baseBranch)).data;
	}

	/**
	 * Commits translated content to a branch.
	 *
	 * @param branch - Target branch reference
	 * @param file - File being translated
	 * @param content - Translated content
	 * @param message - Commit message
	 *
	 * @example
	 * ```typescript
	 * await github.commitTranslation(
	 *   branch,
	 *   file,
	 *   translatedContent,
	 *   'feat(i18n): translate homepage'
	 * );
	 * ```
	 */
	public async commitTranslation(
		branch: RestEndpointMethodTypes["git"]["getRef"]["response"]["data"],
		file: TranslationFile,
		content: string | ParsedContent,
		message: string,
	) {
		await this.contentService.commitTranslation(branch, file, content, message);
	}

	/**
	 * Creates a pull request for translated content.
	 *
	 * @param branch - Source branch name
	 * @param title - Pull request title
	 * @param body - Pull request description
	 * @param baseBranch - Target branch for PR
	 *
	 * @example
	 * ```typescript
	 * const pr = await github.createPullRequest(
	 *   'translate/homepage',
	 *   'feat(i18n): translate homepage',
	 *   'Translates homepage content to Portuguese'
	 * );
	 * ```
	 */
	public async createPullRequest(branch: string, title: string, body: string, baseBranch = "main") {
		return this.contentService.createPullRequest(branch, title, body, baseBranch);
	}

	/**
	 * Removes a branch after successful merge or on failure.
	 *
	 * @param branch - Branch to delete
	 *
	 * @example
	 * ```typescript
	 * await github.cleanupBranch('translate/homepage');
	 * ```
	 */
	public async cleanupBranch(branch: string) {
		await this.branchService.deleteBranch(branch);
	}

	/**
	 * Retrieves list of currently active branches.
	 *
	 * @example
	 * ```typescript
	 * const branches = github.getActiveBranches();
	 * ```
	 */
	public getActiveBranches() {
		return this.branchService.getActiveBranches();
	}

	/**
	 * Verifies GitHub token permissions.
	 *
	 * @example
	 * ```typescript
	 * const hasPermissions = await github.verifyTokenPermissions();
	 * ```
	 */
	public async verifyTokenPermissions() {
		return this.repositoryService.verifyTokenPermissions();
	}

	/**
	 * Checks if fork is synchronized with upstream.
	 *
	 * @example
	 * ```typescript
	 * const needsSync = !(await github.isForkSynced());
	 * ```
	 */
	public async isForkSynced() {
		return this.repositoryService.isForkSynced();
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
	public async syncFork() {
		return this.repositoryService.syncFork();
	}

	/**
	 * Comments compiled results on a GitHub issue.
	 *
	 * @param issueNumber - Target issue number
	 * @param results - Translation results to report
	 *
	 * @example
	 * ```typescript
	 * const comment = await github.commentCompiledResultsOnIssue(123, results);
	 * ```
	 */
	public async commentCompiledResultsOnIssue(issueNumber: number, results: ProcessedFileResult[]) {
		return this.contentService.commentCompiledResultsOnIssue(issueNumber, results);
	}

	/**
	 * Checks if a commit exists on a branch.
	 *
	 * @param branchName - Name of branch to check
	 * @param commitSha - SHA of commit to check
	 *
	 * @example
	 */
	public async checkIfCommitExistsOnFork(branchName: string) {
		return this.branchService.checkIfCommitExistsOnFork(branchName);
	}
}
