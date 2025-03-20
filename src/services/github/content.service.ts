import type { ProcessedFileResult } from "@/types";
import type { RestEndpointMethodTypes } from "@octokit/rest";

import { BaseGitHubService } from "@/services/github/base.service";
import { TranslationFile } from "@/utils/translation-file.util";

/**
 * Service responsible for managing repository content and translations.
 * Handles file content operations, commits, and pull requests.
 *
 * ## Responsibilities
 * - File content retrieval and modification
 * - Translation content management
 * - Pull request creation and management
 * - Content filtering and validation
 */
export class ContentService extends BaseGitHubService {
	private readonly issueNumber = Number(import.meta.env.PROGRESS_ISSUE_NUMBER);

	/**
	 * Creates a comment on a pull request.
	 *
	 * @param prNumber Pull request number
	 * @param comment Comment to create
	 *
	 * @returns The response from the GitHub API
	 */
	public createCommentOnPullRequest(prNumber: number, comment: string) {
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
	public async listOpenPullRequests() {
		return await this.octokit.pulls.list({
			...this.upstream,
			state: "open",
		});
	}

	/**
	 * Retrieves a pull request by number.
	 *
	 * @param prNumber Pull request number
	 * @returns The pull request data
	 */
	public async findPullRequestByNumber(prNumber: number) {
		return this.octokit.pulls.get({ ...this.upstream, pull_number: prNumber });
	}

	/**
	 * Retrieves markdown files that need translation.
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
	public async getUntranslatedFiles(maxFiles?: number) {
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
	 * Updates existing file or creates new one.
	 *
	 * @param options Commit options
	 * @param options.branch Target branch reference
	 * @param options.file File being translated
	 * @param options.content Translated content
	 * @param options.message Commit message
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
	}: {
		branch: RestEndpointMethodTypes["git"]["getRef"]["response"]["data"];
		file: TranslationFile;
		content: string;
		message: string;
	}) {
		await this.octokit.repos.createOrUpdateFileContents({
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
	 * @param options.branch Source branch name
	 * @param options.title Pull request title
	 * @param options.body Pull request description
	 * @param options.baseBranch Target branch for PR
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
		baseBranch,
	}: {
		branch: string;
		title: string;
		body: string;
		baseBranch: string;
	}) {
		const createPullRequestResponse = await this.octokit.pulls.create({
			...this.upstream,
			title,
			body,
			head: `${this.fork.owner}:${branch}`,
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
	) {
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
	) {
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
	 * ## Workflow
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
	) {
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
				comment.user?.login === import.meta.env.REPO_FORK_OWNER &&
				comment.body?.includes(this.comment.suffix)
			);
		});

		if (userComment) {
			const updateCommentResponse = await this.octokit.issues.updateComment({
				...this.upstream,
				issue_number: this.issueNumber,
				body: this.concatComment(this.buildComment(results, filesToTranslate)),
				comment_id: userComment.id,
			});

			return updateCommentResponse.data;
		}

		const createCommentResponse = await this.octokit.issues.createComment({
			...this.upstream,
			issue_number: this.issueNumber,
			body: this.concatComment(this.buildComment(results, filesToTranslate)),
		});

		return createCommentResponse.data;
	}

	/**
	 * Concatenates the comment prefix and suffix to the main content.
	 *
	 * @param content The content to concatenate
	 *
	 * @returns The concatenated comment
	 */
	private concatComment(content: string) {
		return `${this.comment.prefix}\n\n${content}\n\n${this.comment.suffix}`;
	}

	/**
	 * Builds a comment for the issue based on the translation results and files that were translated.
	 *
	 * @param results Translation results
	 * @param filesToTranslate Files that were translated
	 *
	 * @returns The comment to be posted on the issue
	 */
	public buildComment(results: ProcessedFileResult[], filesToTranslate: TranslationFile[]) {
		const concattedData = results
			.map((result) => {
				const translationFile = filesToTranslate.find((file) => file.filename === result.filename);

				if (!translationFile) return null;

				// Extract the directory path and clean it
				const pathParts = translationFile.path.split("/");
				const filename = pathParts.pop() || "";

				// Create an object with the proper levels for hierarchy
				return {
					pathParts: this.simplifyPathParts(pathParts),
					filename,
					pr_number: result.pullRequest?.number || 0,
				};
			})
			.filter(Boolean);

		// Build a hierarchical structure instead of a flat map
		return this.buildHierarchicalComment(concattedData);
	}

	/**
	 * Simplifies path parts by removing date-based segments and other unnecessary elements.
	 *
	 * @param pathParts Array of path segments
	 * @returns Simplified path parts
	 */
	private simplifyPathParts(pathParts: string[]): string[] {
		// Remove the common prefix "src/content"
		if (pathParts[0] === "src" && pathParts[1] === "content") {
			pathParts = pathParts.slice(2);
		}

		// Special handling for blog posts
		if (pathParts[0] === "blog") {
			// For blog posts, we want to flatten the structure
			// Keep only the files directly under "blog" regardless of date directories
			return ["blog"];
		}

		return pathParts;
	}

	/**
	 * Builds a hierarchical comment from the processed data.
	 *
	 * @param data Processed file data with path parts
	 * @returns Formatted hierarchical comment
	 */
	private buildHierarchicalComment(
		data: Array<{
			pathParts: string[];
			filename: string;
			pr_number: number;
		}>,
	): string {
		// Sort data by path and filename
		data.sort((a, b) => {
			const pathA = a.pathParts.join("/");
			const pathB = b.pathParts.join("/");

			return pathA === pathB ? a.filename.localeCompare(b.filename) : pathA.localeCompare(pathB);
		});

		// Build a nested structure
		const structure: any = {};

		for (const item of data) {
			let currentLevel = structure;

			// Build the nested structure based on path parts
			for (const part of item.pathParts) {
				if (!currentLevel[part]) {
					currentLevel[part] = {
						__files: [],
					};
				}
				currentLevel = currentLevel[part];
			}

			// Add file to the current level
			currentLevel.__files.push({
				filename: item.filename,
				pr_number: item.pr_number,
			});
		}

		// Convert the structure to a formatted string
		return this.formatStructure(structure, 0);
	}

	/**
	 * Recursively formats the hierarchical structure into a Markdown comment.
	 *
	 * @param structure The hierarchical structure to format
	 * @param level Current indentation level
	 * @returns Formatted Markdown string
	 */
	private formatStructure(structure: any, level: number): string {
		const lines: string[] = [];
		const indent = "  ".repeat(level);

		// Process each directory in alphabetical order
		const dirs = Object.keys(structure)
			.filter((key) => key !== "__files")
			.sort();

		for (const dir of dirs) {
			lines.push(`${indent}- ${dir}`);

			// Add files at this level
			const files = structure[dir].__files || [];
			for (const file of files.sort((a: any, b: any) => a.filename.localeCompare(b.filename))) {
				lines.push(`${indent}  - \`${file.filename}\`: #${file.pr_number}`);
			}

			// Process subdirectories recursively
			const subDirs = Object.keys(structure[dir]).filter((key) => key !== "__files");
			if (subDirs.length > 0) {
				lines.push(this.formatStructure(structure[dir], level + 1));
			}
		}

		return lines.join("\n");
	}

	/**
	 * Retrieves a pull request by branch name.
	 *
	 * @param branchName Source branch name
	 */
	public async findPullRequestByBranch(branchName: string) {
		const response = await this.octokit.pulls.list({
			...this.upstream,
			head: `${this.fork.owner}:${branchName}`,
		});

		return response.data[0];
	}

	/**
	 * Closes a pull request by number.
	 *
	 * @param prNumber Pull request number
	 * @throws {Error} If pull request closure fails
	 */
	public async closePullRequest(prNumber: number) {
		const response = await this.octokit.pulls.update({
			...this.upstream,
			pull_number: prNumber,
			state: "closed",
		});

		if (response.status !== 200) throw new Error(`Failed to close pull request ${prNumber}`);
	}

	/** Comment template for issue comments */
	private get comment() {
		return {
			prefix: `As seguintes páginas foram traduzidas e PRs foram criados:`,
			suffix: `###### Observações
	
	- As traduções foram geradas por uma LLM e requerem revisão humana para garantir precisão técnica e fluência.
	- Alguns arquivos podem ter PRs de tradução existentes em análise. Verifiquei duplicações, mas recomendo conferir.
	- O fluxo de trabalho de automação completo está disponível no repositório [\`translate-react\`](https://github.com/${import.meta.env.REPO_FORK_OWNER}/translate-react) para referência e contribuições.
	- Esta implementação é um trabalho em progresso e pode apresentar inconsistências em conteúdos técnicos complexos ou formatação específica.`,
		};
	}
}
