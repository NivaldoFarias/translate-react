import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { ParsedContent, ProcessedFileResult, TranslationFile } from "../../types";

import { reconstructContent } from "../../utils/content-parser.util";

import { BaseGitHubService } from "./base.service";

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
	/**
	 * Retrieves markdown files that need translation.
	 * Filters and processes files based on content type.
	 *
	 * @param maxFiles - Optional limit on number of files to retrieve
	 * @throws {Error} If repository tree is empty or retrieval fails
	 *
	 * @example
	 * ```typescript
	 * const files = await contentService.getUntranslatedFiles(5);
	 * ```
	 */
	public async getUntranslatedFiles(maxFiles?: number) {
		try {
			const { data } = await this.octokit.git.getTree({
				...this.fork,
				tree_sha: "main",
				recursive: "1",
			});

			if (!data.tree) {
				throw new Error("Repository tree is empty");
			}

			const markdownFiles = this.filterMarkdownFiles(data.tree);
			const filesToProcess = maxFiles ? markdownFiles.slice(0, maxFiles) : markdownFiles;

			const files: TranslationFile[] = [];
			for (const file of filesToProcess) {
				if (!file.path) continue;

				try {
					const { data } = await this.octokit.repos.getContent({
						...this.fork,
						path: file.path,
					});

					if (!("content" in data)) continue;

					files.push({
						path: file.path,
						content: Buffer.from(data.content, "base64").toString(),
						sha: data.sha,
					});
				} catch (error) {
					console.error(this.formatError(error, `Failed to fetch content for ${file.path}`));
					continue;
				}
			}

			return files;
		} catch (error) {
			console.error(this.formatError(error, "Failed to fetch untranslated files"));
			throw error;
		}
	}

	/**
	 * Commits translated content to a branch.
	 * Updates existing file or creates new one.
	 *
	 * @param branch - Target branch reference
	 * @param file - File being translated
	 * @param content - Translated content
	 * @param message - Commit message
	 * @throws {Error} If commit operation fails
	 *
	 * @example
	 * ```typescript
	 * await contentService.commitTranslation(
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
		try {
			const currentFile = await this.octokit.repos.getContent({
				...this.fork,
				path: file.path!,
				ref: branch.object.sha,
			});

			const fileSha = "sha" in currentFile.data ? currentFile.data.sha : undefined;
			const finalContent = typeof content === "string" ? content : reconstructContent(content);

			await this.octokit.repos.createOrUpdateFileContents({
				...this.fork,
				path: file.path!,
				message,
				content: Buffer.from(finalContent).toString("base64"),
				branch: branch.ref,
				sha: fileSha,
			});
		} catch (error) {
			console.error(this.formatError(error, "Failed to commit translation"));
			throw error;
		}
	}

	/**
	 * Creates or finds an existing pull request.
	 *
	 * @param branch - Source branch name
	 * @param title - Pull request title
	 * @param body - Pull request description
	 * @param baseBranch - Target branch for PR
	 * @throws {Error} If pull request creation fails
	 *
	 * @example
	 * ```typescript
	 * const pr = await contentService.createPullRequest(
	 *   'translate/homepage',
	 *   'feat(i18n): translate homepage',
	 *   'Translates homepage content to Portuguese'
	 * );
	 * ```
	 */
	public async createPullRequest(branch: string, title: string, body: string, baseBranch = "main") {
		try {
			const existingPRsResponse = await this.octokit.pulls.list({
				...this.upstream,
				head: `${this.fork.owner}:${branch}`,
				state: "open",
			});

			const pr = existingPRsResponse.data.find((pr) => pr.title === title);
			if (pr) return pr;

			const { data } = await this.octokit.pulls.create({
				...this.upstream,
				title,
				body,
				head: `${this.fork.owner}:${branch}`,
				base: baseBranch,
				maintainer_can_modify: true,
			});

			return data;
		} catch (error) {
			console.error(this.formatError(error, "Failed to create pull request"));
			throw error;
		}
	}

	/**
	 * Filters repository tree for markdown files.
	 *
	 * @param tree - Repository tree from GitHub API
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
	 * # File Content Retrieval
	 *
	 * Fetches raw content of a file from GitHub.
	 *
	 * @param file - File reference to fetch
	 */
	public async getFileContent(
		file:
			| TranslationFile
			| RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"][number],
	) {
		try {
			const blobSha = file.sha;

			if (!blobSha) {
				throw new Error("Invalid blob URL");
			}

			const { data } = await this.octokit.git.getBlob({
				...this.fork,
				file_sha: blobSha,
			});

			return Buffer.from(data.content, "base64").toString();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			console.error(`Failed to fetch file content: ${message}`);
			throw error;
		}
	}

	/**
	 * # Issue Comment Creation
	 *
	 * Posts translation results as comments on GitHub issues.
	 *
	 * @param issueNumber - Target issue number
	 * @param results - Translation results to report
	 */
	public async commentCompiledResultsOnIssue(issueNumber: number, results: ProcessedFileResult[]) {
		// check if the issue exists
		const issue = await this.octokit.issues.get({
			...this.upstream,
			issue_number: issueNumber,
		});

		if (!issue.data) {
			throw new Error(`Issue ${issueNumber} not found`);
		}

		// check if the issue contains the comment
		const listCommentsResponse = await this.octokit.issues.listComments({
			...this.upstream,
			issue_number: issueNumber,
			since: import.meta.env.GITHUB_SINCE,
		});

		const userComment = listCommentsResponse.data.find((comment) => {
			return (
				comment.user?.login === import.meta.env.REPO_OWNER! &&
				comment.body?.includes("###### Observações")
			);
		});

		if (userComment) {
			const listResults = userComment.body
				?.split("\n")
				.filter((line) => line.includes("- ["))
				.map((line) => {
					const match = line.match(/-\s*\[(?<filename>.*?)\]\((?<html_url>.*?)\)/);
					const data = match ? match.groups : null;

					return data ? { filename: data["filename"], html_url: data["html_url"] } : null;
				})
				.filter((result) => result !== null) as { filename: string; html_url: string }[];

			const newResults = results
				.filter((result) => !listResults.find((compare) => compare.filename === result.filename))
				.map((result) => ({
					filename: result.filename,
					html_url: result.pullRequest?.html_url,
				}));

			if (!newResults.length) {
				return userComment;
			}

			const newResultsComment = newResults
				.concat(listResults)
				.map((result) => `- [${result.filename}](${result.html_url})`)
				.join("\n");

			const newComment = `${this.commentPrefix}\n\n${newResultsComment}\n\n${this.commentSufix}`;

			const updateCommentResponse = await this.octokit.issues.updateComment({
				...this.upstream,
				issue_number: issueNumber,
				body: newComment,
				comment_id: userComment.id,
			});

			return updateCommentResponse.data;
		}

		const listResults = results
			.map((result) => `- [${result.filename}](${result.pullRequest?.html_url})`)
			.join("\n");

		const createCommentResponse = await this.octokit.issues.createComment({
			...this.upstream,
			issue_number: issueNumber,
			body: `${this.commentPrefix}\n\n${listResults}\n\n${this.commentSufix}`,
		});

		return createCommentResponse.data;
	}

	/**
	 * Comment header template for issue comments
	 */
	private get commentPrefix() {
		return `As seguintes páginas foram traduzidas e PRs foram criados:`;
	}

	/**
	 * Comment footer template for issue comments
	 */
	private get commentSufix() {
		return `###### Observações
	
	- As traduções foram geradas por IA e precisam de revisão.
	- Talvez algumas traduções já tenham PRs criados, mas ainda não foram fechados.
	- O fluxo que escrevi para gerar as traduções está disponível no repositório [\`translate-react\`](https://github.com/${import.meta.env.REPO_OWNER}/translate-react).
	- A implementação não é perfeita e pode conter erros.`;
	}
}
