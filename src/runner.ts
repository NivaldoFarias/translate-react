import ora from "ora";

import type { TranslationFile } from "@/types";

import { RunnerService } from "@/services/runner.service";

/**
 * # Translation Workflow Runner
 *
 * Main orchestrator class that manages the entire translation process workflow.
 * Handles file processing, translation, GitHub operations, and progress tracking.
 */
export default class Runner extends RunnerService {
	/**
	 * # Main Workflow Execution
	 *
	 * Executes the complete translation workflow:
	 * 1. Verifies GitHub token permissions
	 * 2. Loads or creates workflow snapshot
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

			if (!(await this.github.verifyTokenPermissions())) {
				this.spinner.fail("Token permissions verification failed");
				throw new Error("Token permissions verification failed");
			}

			this.spinner.text = "Checking fork status...";
			const isSynced = await this.github.isForkSynced();

			if (!isSynced) {
				this.spinner.text = "Fork is out of sync. Updating...";
				const syncSuccess = await this.github.syncFork();

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

			let snapshot = (await this.snapshotManager.loadLatest()) || {
				repositoryTree: [],
				filesToTranslate: [],
				processedResults: [],
				timestamp: Date.now(),
			};

			if (!snapshot.repositoryTree?.length) {
				this.spinner.text = "Fetching repository tree...";

				snapshot.repositoryTree = await this.github.getRepositoryTree("main");
				await this.snapshotManager.append("repositoryTree", snapshot.repositoryTree);
				this.spinner.succeed("Repository tree fetched");
			} else {
				this.spinner.stopAndPersist({
					symbol: "📦",
					text: "Repository tree already fetched",
				});
				this.spinner.start();
			}

			if (!snapshot.filesToTranslate?.length) {
				const uncheckedFiles: TranslationFile[] = [];

				for (const [index, file] of snapshot.repositoryTree.slice(0, this.maxFiles).entries()) {
					this.spinner.text = `Fetching file ${index + 1}/${snapshot.repositoryTree.length}: ${file.path}`;

					if (uncheckedFiles.find((compareFile) => compareFile.path === file.path)) continue;

					uncheckedFiles.push({
						content: await this.github.getFileContent(file),
						filename: file.path?.split("/").pop(),
						...file,
					});
				}

				this.spinner.stop();

				const filesToTranslate = uncheckedFiles.filter(
					(file) => !this.languageDetector.isFileTranslated(file.content as string),
				);

				await this.snapshotManager.append("filesToTranslate", filesToTranslate);

				snapshot.filesToTranslate = filesToTranslate;

				this.spinner.succeed(`Found ${filesToTranslate.length} files to translate`);
				this.spinner.start();
			} else {
				this.spinner.stopAndPersist({
					symbol: "📦",
					text: `Found ${snapshot.filesToTranslate.length} files to translate`,
				});
				this.spinner.start();
			}

			await this.processInBatches(snapshot.filesToTranslate, 10);

			snapshot.processedResults = Array.from(this.stats.results.values());

			await this.snapshotManager.append("processedResults", snapshot.processedResults);

			this.spinner.succeed("Translation completed");

			if (
				import.meta.env.NODE_ENV === "production" &&
				import.meta.env.TRANSLATION_ISSUE_NUMBER &&
				snapshot.processedResults.length > 0
			) {
				this.spinner.text = "Commenting on issue...";
				const comment = await this.github.commentCompiledResultsOnIssue(
					import.meta.env.TRANSLATION_ISSUE_NUMBER,
					snapshot.processedResults,
				);
				this.spinner.succeed(`Commented on translation issue: ${comment.html_url}`);
			}

			// Use stopAndPersist for final statistics
			this.spinner.stopAndPersist({
				symbol: "📊",
				text: "Final Statistics",
			});

			console.table({
				"Files processed successfully": Array.from(this.stats.results.values()).filter(
					(file) => file.error === null,
				).length,
				"Failed translations": Array.from(this.stats.results.values()).filter(
					(file) => file.error !== null,
				).length,
			});

			if (import.meta.env.NODE_ENV === "production") {
				await this.snapshotManager.clear();
			}
		} catch (error) {
			this.spinner?.fail(error instanceof Error ? error.message : "Unknown error");
			process.exit(1);
		} finally {
			const elapsedTime = Math.ceil(Date.now() - this.stats.startTime);
			this.spinner?.stopAndPersist({
				symbol: "⏱️",
				text: `Elapsed time: ${elapsedTime}ms (${Math.ceil(elapsedTime / 1000)}s)`,
			});
			this.spinner?.stop();
			process.exit(1);
		}
	}

	/**
	 * # Batch Processing
	 *
	 * Processes files in batches to manage resources and provide progress feedback
	 *
	 * @param files - List of files to process
	 * @param batchSize - Number of files to process simultaneously
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
			this.spinner!.text = `Processing batch ${batchIndex + 1}/${batches.length}`;

			await Promise.all(
				batch.map((file, fileIndex) => {
					const progress = {
						batchIndex: batchIndex + 1,
						fileIndex,
						totalBatches: batches.length,
						batchSize,
					};

					return this.processFile(file, progress);
				}),
			);

			this.spinner!.succeed(`Completed batch ${batchIndex + 1}/${batches.length}`);

			if (batchIndex < batches.length - 1) this.spinner!.start();
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
	 * @param file - File to process
	 * @param progress - Progress tracking information
	 */
	private async processFile(
		file: TranslationFile,
		progress: { batchIndex: number; fileIndex: number; totalBatches: number; batchSize: number },
	) {
		const metadata = this.stats.results.get(file.filename!) || {
			branch: null,
			filename: file.filename!,
			translation: null,
			pullRequest: null,
			error: null,
		};

		const suffixText = `[${progress.fileIndex + 1}/${progress.batchSize}]`;

		try {
			this.spinner!.suffixText = `${suffixText} Creating branch for ${file.filename}`;
			metadata.branch = await this.github.createOrGetTranslationBranch(file.filename!);

			this.spinner!.suffixText = `${suffixText} Translating ${file.filename}`;
			metadata.translation = await this.translator.translateContent(file);

			this.spinner!.suffixText = `${suffixText} Committing ${file.filename}`;

			await this.github.commitTranslation(
				metadata.branch,
				file,
				metadata.translation,
				`Translate \`${file.filename}\` to ${this.options.targetLanguage}`,
			);

			this.spinner!.suffixText = `${suffixText} Creating PR for ${file.filename}`;
			metadata.pullRequest = await this.github.createPullRequest(
				metadata.branch.ref,
				`Translate \`${file.filename}\` to ${this.options.targetLanguage}`,
				this.pullRequestDescription,
			);
		} catch (error) {
			metadata.error = error instanceof Error ? error : new Error(String(error));
			this.spinner!.suffixText = `${suffixText} Failed: ${file.filename}`;
		} finally {
			this.stats.results.set(file.filename!, metadata);
		}
	}
}
