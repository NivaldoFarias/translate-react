import { ProcessedFileResult, TranslationFile } from "@/services";

/**
 * Creates an array of {@link ProcessedFileResult} fixtures
 *
 * @param options
 * @param options.count Number of results to create
 * @param options.containInvalid Whether to include invalid results
 *
 * @returns Array of ProcessedFileResult objects
 */
export function createProcessedFileResultsFixture({
	count,
	containInvalid = false,
}: {
	count: number;
	containInvalid?: boolean;
}): ProcessedFileResult[] {
	return new Array(count).fill(null).map((_, index) => {
		if (containInvalid && index % 2 === 0) {
			return {
				branch: null,
				filename: `file-${index + 1}.md`,
				translation: null,
				pullRequest: null,
				error: new Error(`Translation failed for file ${index + 1}`),
			};
		}

		return {
			branch: {
				node_id: "MDM6UmVmMTpyZWZzL2hlYWRzL3RyYW5zbGF0ZS90ZXN0",
				object: {
					sha: `abc123def456ghi789jkl${index + 1}`,
					type: "commit",
					url: `https://api.github.com/repos/test/test/git/commits/abc123def456ghi789jkl${index + 1}`,
				},
				ref: `refs/heads/translate/test-${index + 1}`,
				url: "https://api.github.com/repos/test/test/git/refs/heads/translate/test",
			},
			filename: `file-${index + 1}.md`,
			translation: `Translated content for file ${index + 1}`,
			pullRequest: null,
			error: null,
		};
	});
}

/**
 * Creates an array of {@link TranslationFile} fixtures
 *
 * @param options
 * @param options.count Number of files to create
 *
 * @returns Array of TranslationFile objects
 */
export function createTranslationFilesFixture({ count }: { count: number }): TranslationFile[] {
	return new Array(count).fill(null).map((_, index) => {
		const filename = `file-${index + 1}.md`;

		return new TranslationFile(
			`# Content of file ${index + 1}`,
			filename,
			`src/path/to/${filename}`,
			`sha123file${index + 1}`,
		);
	});
}
