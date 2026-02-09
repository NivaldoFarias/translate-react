import { PartialDeep } from "type-fest";

import type { RestEndpointMethodTypes } from "@octokit/rest";
import type { ChatCompletion } from "openai/resources";

import type { PatchedRepositoryTreeItem } from "@/services";

import { LanguageAnalysisResult, ProcessedFileResult, TranslationFile } from "@/services";

type PullRequestListItem = RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number];
type PartialChatCompletion = PartialDeep<
	Omit<ChatCompletion, "choices"> & { choices: PartialDeep<ChatCompletion["choices"][number]>[] }
>;

/**
 * Creates a minimal PR list item fixture for tests (Octokit pulls.list shape).
 * Cast to full type once here so specs avoid per-use casts.
 *
 * @param prNumber PR number to use in URLs and ids
 * @returns Typed PR list item for use in ProcessedFileResult.pullRequest
 */
export function createMockPullRequestListItem(prNumber: number): PullRequestListItem {
	return {
		number: prNumber,
		id: prNumber,
		node_id: `PR_${prNumber}`,
		url: `https://api.github.com/repos/test/test/pulls/${prNumber}`,
		html_url: `https://github.com/test/test/pull/${prNumber}`,
		diff_url: `https://github.com/test/test/pull/${prNumber}.diff`,
		patch_url: `https://github.com/test/test/pull/${prNumber}.patch`,
		issue_url: `https://github.com/test/test/issues/${prNumber}`,
		commits_url: `https://api.github.com/repos/test/test/pulls/${prNumber}/commits`,
		review_comments_url: `https://api.github.com/repos/test/test/pulls/${prNumber}/comments`,
	} as PullRequestListItem;
}

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

/**
 * Creates a {@link TranslationFile} fixture
 *
 * @param overrides Values to override the default fixture
 * @param title The title to use in the frontmatter (defaults to "Untitled")
 *
 * @returns TranslationFile object
 */
export function createTranslationFileFixture(
	overrides?: Partial<TranslationFile>,
	title?: string,
): TranslationFile {
	const content = overrides?.content ?? "# Content of file";

	return new TranslationFile(
		wrapContentInFrontmatter(content, title),
		overrides?.filename ?? "file.md",
		overrides?.path ?? "src/test/file.md",
		overrides?.sha ?? "abc123",
	);
}

/**
 * Wraps content in YAML frontmatter
 *
 * @param content The content to wrap in frontmatter
 * @param title The title to use in the frontmatter
 *
 * @returns Content wrapped in YAML frontmatter
 */
export function wrapContentInFrontmatter(content: string, title?: string): string {
	return !content.startsWith("---") && title ? `---\ntitle: '${title}'\n---\n${content}` : content;
}

/**
 * Creates a {@link PatchedRepositoryTreeItem} fixture
 *
 * @param overrides Values to override the default fixture
 *
 * @returns PatchedRepositoryTreeItem object
 */
export function createRepositoryTreeItemFixture(
	overrides?: Partial<PatchedRepositoryTreeItem>,
): PatchedRepositoryTreeItem {
	return {
		path: "src/test/file.md",
		sha: "abc123",
		filename: "file.md",
		mode: "100644",
		size: 100,
		type: "blob",
		url: "https://api.github.com/repos/test/test/git/blobs/abc123",
		...overrides,
	} satisfies PatchedRepositoryTreeItem;
}

/**
 * Creates a {@link ChatCompletion} fixture.
 *
 * @param overrides Optional overrides for the ChatCompletion fields
 *
 * @returns ChatCompletion object
 */
export function createChatCompletionFixture(
	overrides?: string | PartialChatCompletion,
	title?: string,
): ChatCompletion {
	const defaults = {
		id: "chatcmpl-test-123",
		created: Date.now(),
		model: "test-model",
		object: "chat.completion",
		choices: [
			{
				message: { content: "", refusal: null, role: "assistant" },
				finish_reason: "stop",
				index: 0,
				logprobs: null,
			},
		],
		usage: {
			total_tokens: 50,
			completion_tokens: 30,
			prompt_tokens: 20,
		},
	} satisfies ChatCompletion;

	if (typeof overrides === "string") {
		if (title) overrides = wrapContentInFrontmatter(overrides, title);

		return {
			...defaults,
			choices: [{ message: { ...(defaults.choices[0]?.message ?? {}), content: overrides } }],
		} as ChatCompletion;
	}

	return { ...defaults, ...overrides } as ChatCompletion;
}

/**
 * Creates a {@link LanguageAnalysisResult} fixture
 *
 * @param overrides Values to override the default fixture
 *
 * @returns LanguageAnalysisResult object
 */
export function createLanguageAnalysisResultFixture(
	overrides?: PartialDeep<LanguageAnalysisResult>,
): LanguageAnalysisResult {
	return {
		languageScore: {
			target: 0.9,
			source: 0.1,
		},
		ratio: 0.9,
		isTranslated: true,
		detectedLanguage: "pt",
		rawResult: {
			reliable: true,
			textBytes: 100,
			languages: [],
			chunks: [],
		},
		...overrides,
	} as LanguageAnalysisResult;
}
