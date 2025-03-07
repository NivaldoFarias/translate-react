import ora from "ora";

import type { FileProcessingProgress, ProcessedFileResult, TranslationFile } from "@/types";
import type { SetNonNullable } from "type-fest";

import type { Snapshot } from "../snapshot.service";

import { RunnerService } from "@/services/runner/base.service";
import { extractErrorMessage } from "@/utils/errors.util";

/**
 * # Translation Workflow Runner
 *
 * Main orchestrator class that manages the entire translation process workflow.
 * Handles file processing, translation, GitHub operations, and progress tracking.
 */
export default class Runner extends RunnerService {
	/** Batch progress tracking */
	private readonly batchProgress = {
		completed: 0,
		successful: 0,
		failed: 0,
	};

	/**
	 * Updates the batch progress tracking and spinner text
	 *
	 * @param status The status of the completed file ('success' | 'error')
	 */
	private updateBatchProgress(status: "success" | "error") {
		this.batchProgress.completed++;

		if (status === "success") {
			this.batchProgress.successful++;
		} else {
			this.batchProgress.failed++;
		}
	}

	/**
	 * # Main Workflow Execution
	 *
	 * Executes the complete translation workflow:
	 * 1. Verifies GitHub token permissions
	 * 2. Loads or creates workflow snapshot (development only)
	 * 3. Fetches repository tree
	 * 4. Identifies files for translation
	 * 5. Processes files in batches
	 * 6. Reports results
	 *
	 * In production, also comments results on the specified issue
	 */
	public async run() {
		try {
			this.spinner = ora({
				text: "Starting translation workflow",
				color: "cyan",
				spinner: "dots",
			}).start();

			const hasPermissions = await this.services.github.verifyTokenPermissions();

			if (!hasPermissions) {
				this.spinner.fail("Token permissions verification failed");

				throw new Error("Token permissions verification failed");
			}

			this.spinner.text = "Checking fork status...";
			const isForkSynced = await this.services.github.isForkSynced();

			if (!isForkSynced) {
				this.spinner.text = "Fork is out of sync. Updating fork...";

				if (import.meta.env.NODE_ENV === "development") {
					await this.services.snapshot.clear();
				}

				const syncSuccess = await this.services.github.syncFork();

				if (!syncSuccess) {
					this.spinner.fail("Failed to sync fork with upstream repository");
					throw new Error("Failed to sync fork with upstream repository");
				}

				this.spinner.succeed("Fork synchronized with upstream repository");
				this.spinner.start();
			} else {
				this.spinner.succeed("Fork is up to date");
				this.spinner.start();
			}

			let data: Omit<Snapshot, "id"> = {
				repositoryTree: [],
				filesToTranslate: [],
				processedResults: [],
				timestamp: Date.now(),
			};

			if (import.meta.env.NODE_ENV === "development") {
				const latestSnapshot = await this.services.snapshot.loadLatest();

				if (latestSnapshot && !isForkSynced) data = latestSnapshot;
			}

			if (!data.repositoryTree?.length) {
				this.spinner.text = "Fetching repository content...";
				data.repositoryTree = await this.services.github.getRepositoryTree("main");

				if (import.meta.env.NODE_ENV === "development") {
					await this.services.snapshot.append("repositoryTree", data.repositoryTree);
				}

				this.spinner.text = "Repository tree fetched. Fetching glossary...";

				const glossary = await this.services.github.getGlossary();

				if (!glossary) {
					this.spinner.fail("Failed to fetch glossary");
					throw new Error("Failed to fetch glossary");
				}

				this.services.translator.glossary = glossary;

				this.spinner.succeed("Repository content fetched");
			} else {
				this.spinner.stopAndPersist({
					symbol: "📦",
					text: "Repository tree already fetched",
				});
			}

			this.spinner.start();

			if (!data.filesToTranslate?.length) {
				const uncheckedFiles: TranslationFile[] = [];

				this.spinner.text = `Fetching ${data.repositoryTree.length} files...`;

				const totalFiles = data.repositoryTree.length;
				let completedFiles = 0;

				const updateSpinner = () => {
					completedFiles++;
					const percentage = Math.floor((completedFiles / totalFiles) * 100);
					this.spinner!.text = `Fetching files: ${completedFiles}/${totalFiles} (${percentage}%)`;
				};

				const uniqueFiles = data.repositoryTree.filter(
					(file, index, self) => index === self.findIndex((f) => f.path === file.path),
				);

				const batchSize = 10;
				for (let i = 0; i < uniqueFiles.length; i += batchSize) {
					const batch = uniqueFiles.slice(i, i + batchSize);

					const batchResults = await Promise.all(
						batch.map(async (file) => {
							const filename = file.path?.split("/").pop();

							if (!filename || !file.sha) return null;

							const content = await this.services.github.getFileContent(file);
							updateSpinner();

							return {
								content,
								filename,
								sha: file.sha,
							};
						}),
					);

					uncheckedFiles.push(...batchResults.filter((file) => !!file));
				}

				data.filesToTranslate = uncheckedFiles.filter(
					(file) => !this.services.translator.isFileTranslated(file),
				);

				if (import.meta.env.NODE_ENV === "development") {
					await this.services.snapshot.append("filesToTranslate", data.filesToTranslate);
				}

				this.spinner.succeed(`Found ${data.filesToTranslate.length} files to translate`);
			} else {
				this.spinner.stopAndPersist({
					symbol: "📦",
					text: `Found ${data.filesToTranslate.length} files to translate`,
				});
			}

			this.spinner.start();

			await this.processInBatches(data.filesToTranslate, 10);

			data.processedResults = Array.from(this.stats.results.values());

			if (import.meta.env.NODE_ENV === "development") {
				await this.services.snapshot.append("processedResults", data.processedResults);
			}

			this.spinner.succeed("Translation completed");

			if (this.shouldUpdateIssueComment) {
				this.spinner.text = "Commenting on issue...";
				const comment = await this.services.github.commentCompiledResultsOnIssue(
					Number(import.meta.env.PROGRESS_ISSUE_NUMBER),
					data.processedResults,
				);
				this.spinner.succeed(`Commented on translation issue: ${comment.html_url}`);
			}

			if (import.meta.env.NODE_ENV === "production") {
				await this.services.snapshot.clear();
			}
		} catch (error) {
			this.spinner?.fail(extractErrorMessage(error));
		} finally {
			this.printFinalStatistics();
		}
	}

	/**
	 * @returns `true` if the issue comment should be updated, `false` otherwise
	 */
	private get shouldUpdateIssueComment() {
		return !!(
			import.meta.env.NODE_ENV === "production" &&
			import.meta.env.PROGRESS_ISSUE_NUMBER &&
			this.stats.results.size > 0
		);
	}

	/** Prints the final statistics of the translation workflow */
	private async printFinalStatistics() {
		if (!this.spinner) return;

		const elapsedTime = Math.ceil(Date.now() - this.stats.timestamp);

		this.spinner.stopAndPersist({ symbol: "📊", text: "Final Statistics" });

		const results = Array.from(this.stats.results.values());

		console.table({
			"Files processed successfully": results.filter(({ error }) => !error).length,
			"Failed translations": results.filter(({ error }) => !!error).length,
		});

		if (results.some(({ error }) => !!error)) {
			const failedFiles = results.filter(({ error }) => !!error) as SetNonNullable<
				ProcessedFileResult,
				"error"
			>[];

			this.spinner.stopAndPersist({ symbol: "❌", text: `Failed translations:` });

			for (const [index, { filename, error }] of failedFiles.entries()) {
				this.spinner.stopAndPersist({
					symbol: "  •",
					text: `${index + 1}. ${filename}: ${error?.message}`,
				});
			}
		}

		this.spinner.stopAndPersist({
			symbol: "⏱️",
			text: ` Elapsed time: ${elapsedTime}ms (${Math.ceil(elapsedTime / 1000)}s)`,
		});

		this.spinner.stop();
	}

	/**
	 * Processes files in batches to manage resources and provide progress feedback
	 *
	 * @param files List of files to process
	 * @param batchSize Number of files to process simultaneously
	 */
	private async processInBatches(files: TranslationFile[], batchSize = 10) {
		if (!this.spinner) {
			this.spinner = ora({
				text: "Processing files",
				color: "cyan",
				spinner: "dots",
			}).start();
		}

		const batches: TranslationFile[][] = [];
		for (let i = 0; i < files.length; i += batchSize) {
			batches.push(files.slice(i, i + batchSize));
		}

		for (const [batchIndex, batch] of batches.entries()) {
			this.batchProgress.completed = 0;
			this.batchProgress.successful = 0;
			this.batchProgress.failed = 0;

			this.spinner.text = `Processing batch ${batchIndex + 1}/${batches.length}`;
			this.spinner.suffixText = `:: 0 out of ${batch.length} files completed (0% done)`;

			await Promise.all(
				batch.map((file) => {
					const progress = {
						batchIndex: batchIndex + 1,
						fileIndex: this.batchProgress.completed,
						totalBatches: batches.length,
						batchSize,
					};

					return this.processFile(file, progress);
				}),
			);

			const successRate = Math.round((this.batchProgress.successful / batch.length) * 100);
			this.spinner.succeed(
				`Completed batch ${batchIndex + 1}/${batches.length} - ` +
					`${this.batchProgress.successful}/${batch.length} successful (${successRate}% success rate)`,
			);

			if (batchIndex < batches.length - 1) this.spinner.start();
		}
	}

	/**
	 * # Single File Processing
	 *
	 * Processes an individual file through the translation workflow:
	 * - Creates a branch
	 * - Checks for existing translations
	 * - Performs translation
	 * - Creates pull request
	 *
	 * @param file File to process
	 * @param progress Progress tracking information
	 */
	private async processFile(file: TranslationFile, progress: FileProcessingProgress) {
		const metadata = this.stats.results.get(file.filename!) || {
			branch: null,
			filename: file.filename!,
			translation: null,
			pullRequest: null,
			error: null,
		};

		try {
			metadata.branch = await this.services.github.createOrGetTranslationBranch(file.filename!);
			metadata.translation = await this.services.translator.translateContent(file);

			await this.services.github.commitTranslation(
				metadata.branch,
				file,
				metadata.translation,
				`Translate \`${file.filename}\` to ${this.options.targetLanguage}`,
			);

			metadata.pullRequest = await this.services.github.createPullRequest(
				metadata.branch.ref,
				`Translate \`${file.filename}\` to ${this.options.targetLanguage}`,
				this.pullRequestDescription,
			);

			this.updateBatchProgress("success");
		} catch (error) {
			metadata.error = error instanceof Error ? error : new Error(String(error));
			this.updateBatchProgress("error");
		} finally {
			this.stats.results.set(file.filename!, metadata);

			if (this.spinner) {
				const percentComplete = Math.round(
					(this.batchProgress.completed / progress.batchSize) * 100,
				);
				this.spinner.suffixText = `[${this.batchProgress.completed}/${progress.batchSize}] files completed (${percentComplete}% done)`;
			}
		}
	}
}
