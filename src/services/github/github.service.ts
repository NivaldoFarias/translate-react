import type { ProcessedFileResult } from "@/types";
import type { RestEndpointMethodTypes } from "@octokit/rest";

import { BranchService } from "@/services/github/branch.service";
import { ContentService } from "@/services/github/content.service";
import { RepositoryService } from "@/services/github/repository.service";
import { TranslationFile } from "@/utils/translation-file.util";

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
	private readonly services: {
		branch: BranchService;
		repository: RepositoryService;
		content: ContentService;
	};

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
	constructor(
		/** Repository configuration for upstream and fork */
		private readonly repos: {
			upstream: { owner: string; repo: string };
			fork: { owner: string; repo: string };
		},
	) {
		this.services = {
			branch: new BranchService(this.repos.upstream, this.repos.fork),
			repository: new RepositoryService(this.repos.upstream, this.repos.fork),
			content: new ContentService(this.repos.upstream, this.repos.fork),
		};
	}

	/**
	 * Retrieves the repository file tree.
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
	public async getRepositoryTree(baseBranch = "main", filterIgnored = true) {
		return this.services.repository.getRepositoryTree(baseBranch, filterIgnored);
	}

	/**
	 * Fetches raw content of a file from GitHub.
	 *
	 * @param file File reference to fetch
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
	public async createOrGetTranslationBranch(file: TranslationFile, baseBranch = "main") {
		const branchName = `translate/${file.path.split("/").slice(2).join("/")}`;
		const existingBranch = await this.services.branch.getBranch(branchName);

		if (existingBranch) {
			const mainBranchRef = await this.services.branch.getBranch(baseBranch);
			if (!mainBranchRef) throw new Error(`Base branch ${baseBranch} not found`);

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

		const newBranch = await this.services.branch.createBranch(branchName, baseBranch);

		return newBranch.data;
	}

	/**
	 * Commits translated content to a branch.
	 *
	 * @param options Commit options
	 * @param options.branch Target branch reference
	 * @param options.file File being translated
	 * @param options.content Translated content
	 * @param options.message Commit message
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
	public async commitTranslation({
		branch,
		file,
		content,
		message,
	}: {
		branch: RestEndpointMethodTypes["git"]["getRef"]["response"]["data"];
		file: TranslationFile;
		content: string;
		message: string;
	}) {
		await this.services.content.commitTranslation({ branch, file, content, message });
	}

	/**
	 * Creates a pull request for translated content.
	 *
	 * @param options Pull request options
	 * @param options.branch Source branch name
	 * @param options.title Pull request title
	 * @param options.body Pull request description
	 * @param options.baseBranch Target branch for PR
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
	public async createPullRequest({
		branch,
		title,
		body,
		baseBranch = "main",
	}: {
		branch: string;
		title: string;
		body: string;
		baseBranch?: string;
	}) {
		return this.services.content.createPullRequest({ branch, title, body, baseBranch });
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
	public async cleanupBranch(branch: string) {
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
	public getActiveBranches() {
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
	public async verifyTokenPermissions() {
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
	public async isForkSynced() {
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
	public async syncFork() {
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
	) {
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
	public async checkIfCommitExistsOnFork(branchName: string) {
		return this.services.branch.checkIfCommitExistsOnFork(branchName);
	}

	/**
	 * Fetches the glossary.md file from the repository.
	 *
	 * @returns The content of the glossary file as a string, or null if the file doesn't exist or cannot be retrieved
	 *
	 * @example
	 * ```typescript
	 * const glossary = await github.fetchGlossary();
	 * ```
	 */
	public async getGlossary() {
		return this.services.repository.fetchGlossary();
	}
}
