import { Octokit } from "@octokit/rest";

import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { TranslationFile } from "../types";

import { BranchManager } from "../utils/branchManager";
import Logger from "../utils/logger";
import { RateLimiter } from "../utils/rateLimiter";
import { RetryableOperation } from "../utils/retryableOperation";

export class GitHubService {
	private octokit: Octokit;
	private logger = new Logger();
	private rateLimiter = new RateLimiter(60, "GitHub API");
	private retryOperation = new RetryableOperation(3, 1000, 5000);
	private branchManager: BranchManager;

	constructor(
		private readonly owner: string = process.env["REPO_OWNER"]!,
		private readonly repo: string = process.env["REPO_NAME"]!,
		private readonly githubToken: string = process.env["GITHUB_TOKEN"]!,
	) {
		this.octokit = new Octokit({ auth: githubToken });
		this.branchManager = new BranchManager(owner, repo, githubToken);
	}

	private async callGitHubAPI<T>(operation: () => Promise<T>, context: string): Promise<T> {
		return this.rateLimiter.schedule(() => operation(), context);
	}

	private async withRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
		return this.retryOperation.withRetry(
			async () => this.callGitHubAPI(operation, context),
			context,
		);
	}

	public async getUntranslatedFiles(maxFiles?: number): Promise<TranslationFile[]> {
		try {
			const { data } = await this.withRetry(
				() =>
					this.octokit.git.getTree({
						owner: this.owner,
						repo: this.repo,
						tree_sha: "main",
						recursive: "1",
					}),
				"Fetching repository tree",
			);

			if (!data.tree) {
				throw new Error("Repository tree is empty");
			}

			// Filter out ignored paths
			const markdownFiles = this.filterRepositoryTree(data.tree);

			// Apply maxFiles limit after filtering but before content fetching
			const filesToProcess = maxFiles ? markdownFiles.slice(0, maxFiles) : markdownFiles;
			this.logger.info(`Found ${filesToProcess.length} markdown files to process`);

			const files: TranslationFile[] = [];
			for (const file of filesToProcess) {
				if (!file.path) {
					this.logger.warn("Skipping file with undefined path");
					continue;
				}

				try {
					const { data: content } = await this.withRetry(
						() =>
							this.octokit.repos.getContent({
								owner: this.owner,
								repo: this.repo,
								path: file.path!,
							}),
						`Fetching ${file.path}`,
					);

					if (!("content" in content)) {
						this.logger.warn(`No content found for ${file.path}`);
						continue;
					}

					const decodedContent = Buffer.from(content.content, "base64").toString();
					files.push({
						path: file.path,
						content: decodedContent,
						sha: content.sha,
					});
				} catch (error) {
					const message = error instanceof Error ? error.message : "Unknown error";
					this.logger.warn(`Failed to fetch content for ${file.path}: ${message}`);
					// Continue with other files instead of failing completely
					continue;
				}
			}

			if (files.length === 0) {
				this.logger.warn("No valid files were found to process");
			} else {
				this.logger.info(`Successfully processed ${files.length} files`);
			}

			return files;
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			this.logger.error(`Failed to fetch untranslated files: ${message}`);
			throw error;
		}
	}

	private filterRepositoryTree(
		tree: RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"],
	) {
		return tree.filter((item) => {
			if (!item.path) return false;
			if (!item.path.endsWith(".md")) return false;
			if (!item.path.includes("/") && item.path !== "GLOSSARY.md") return false;
			if (!item.path.includes("src/")) return false;

			return true;
		});
	}

	async createTranslationBranch(baseBranch: string = "main") {
		const branchName = `translate-${Date.now()}`;
		await this.branchManager.createBranch(branchName, baseBranch);
		return branchName;
	}

	async commitTranslation(
		branch: string,
		filePath: string,
		content: string,
		message: string,
	): Promise<void> {
		try {
			// Get the current file (if it exists)
			let currentFile: RestEndpointMethodTypes["repos"]["getContent"]["response"] | undefined;
			try {
				currentFile = await this.withRetry(
					() =>
						this.octokit.repos.getContent({
							owner: this.owner,
							repo: this.repo,
							path: filePath,
							ref: branch,
						}),
					`Checking existing file: ${filePath}`,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				this.logger.warn(`File not found: ${message}`);
			}

			await this.withRetry(
				() =>
					this.octokit.repos.createOrUpdateFileContents({
						owner: this.owner,
						repo: this.repo,
						path: filePath,
						message,
						content: Buffer.from(content).toString("base64"),
						branch,
						sha:
							currentFile && "data" in currentFile ?
								"sha" in currentFile.data ?
									currentFile.data.sha
								:	undefined
							:	undefined,
					}),
				`Committing changes to ${filePath}`,
			);

			this.logger.info(`Committed translation to ${filePath} on branch ${branch}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			this.logger.error(`Failed to commit translation: ${errorMessage}`);

			// Clean up the branch on failure
			await this.branchManager.deleteBranch(branch);
			throw error;
		}
	}

	async createPullRequest(
		branch: string,
		title: string,
		body: string,
		baseBranch: string = "main",
	): Promise<number> {
		try {
			const { data: pr } = await this.withRetry(
				() =>
					this.octokit.pulls.create({
						owner: this.owner,
						repo: this.repo,
						title,
						body,
						head: branch,
						base: baseBranch,
					}),
				"Creating pull request",
			);

			this.logger.info(`Created pull request #${pr.number}: ${title}`);
			return pr.number;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			this.logger.error(`Failed to create pull request: ${errorMessage}`);

			// Clean up the branch on failure
			await this.branchManager.deleteBranch(branch);
			throw error;
		}
	}

	async cleanupBranch(branch: string) {
		await this.branchManager.deleteBranch(branch);
	}

	getActiveBranches(): string[] {
		return this.branchManager.getActiveBranches();
	}

	async getFileContent(filePath: string) {
		try {
			const { data: content } = await this.withRetry(
				() =>
					this.octokit.repos.getContent({
						owner: this.owner,
						repo: this.repo,
						path: filePath,
					}),
				`Fetching ${filePath}`,
			);

			if (!("content" in content)) {
				throw new Error("Invalid content response from GitHub");
			}

			return {
				content: Buffer.from(content.content, "base64").toString(),
				sha: content.sha,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			this.logger.error(`Failed to fetch file content: ${message}`);
			throw error;
		}
	}

	async getRepositoryTree(baseBranch: string = "main", filterIgnored: boolean = true) {
		const { data } = await this.withRetry(
			() =>
				this.octokit.git.getTree({
					owner: this.owner,
					repo: this.repo,
					tree_sha: baseBranch,
					recursive: "1",
				}),
			"Fetching repository tree",
		);

		return filterIgnored ? this.filterRepositoryTree(data.tree) : data.tree;
	}
}
