import { PartialDeep } from "type-fest";

import type { RestEndpointMethodTypes } from "@octokit/rest";
import type { ChatCompletion } from "openai/resources";

import type {
	PatchedRepositoryTreeItem,
	ProcessedFileResult,
	PullRequestReviewSnapshot,
	PullRequestStatus,
} from "@/app/services/github/types";
import type { LanguageAnalysisResult } from "@/app/services/language-detector/language-detector.service";

import { PullRequestProgressAction } from "@/app/services/github/types";
import { TranslationFile } from "@/app/services/translator/translation-file";

type PullRequestListItem = RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number];

/** Octokit `git.getRef` response used by {@link GitHubService.getBranch} */
export type GitBranchRefResponse = RestEndpointMethodTypes["git"]["getRef"]["response"];

type PartialChatCompletionChoice = PartialDeep<
	Omit<ChatCompletion["choices"][number], "finish_reason">
> & {
	/** Widened for tests: OpenRouter can return `"error"`, which the OpenAI SDK type omits. */
	finish_reason?: ChatCompletion["choices"][number]["finish_reason"] | "error";
};

type PartialChatCompletion = PartialDeep<
	Omit<ChatCompletion, "choices"> & { choices: PartialChatCompletionChoice[] }
>;

/**
 * Creates a minimal PR list item fixture for tests (Octokit pulls.list shape).
 * Cast to full type once here so specs avoid per-use casts.
 *
 * @param prNumber PR number to use in URLs and ids
 *
 * @returns Typed PR list item for use in {@link ProcessedFileResult.pullRequest}
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
 * Creates a minimal in-sync pull request status fixture for runner workflow tests.
 *
 * @param overrides Optional field overrides
 *
 * @returns Typed {@link PullRequestStatus} for mock `checkPullRequestStatus` responses
 */
export function createPullRequestStatusFixture(
	overrides: Partial<PullRequestStatus> = {},
): PullRequestStatus {
	return {
		hasConflicts: false,
		mergeable: true,
		needsUpdate: false,
		mergeableState: "clean",
		createdBy: "translate-react-bot",
		...overrides,
	};
}

/**
 * Creates a normalized pull request review snapshot for workflow tests.
 *
 * @param overrides Optional field overrides
 *
 * @returns Typed {@link PullRequestReviewSnapshot} for mock `listPullRequestReviews` responses
 */
export function createMockPullRequestReviewSnapshot(
	overrides: Partial<PullRequestReviewSnapshot> = {},
): PullRequestReviewSnapshot {
	return {
		id: 42,
		login: "jhonmike",
		authorAssociation: "MEMBER",
		userType: "User",
		state: "CHANGES_REQUESTED",
		submittedAt: new Date("2026-06-03T12:00:00Z"),
		body: "Please review.",
		...overrides,
	};
}

/**
 * Creates a minimal `git.getRef` response for mock `getBranch` results.
 *
 * Production code reads `data.object.sha` and `data.ref` only; the cast is centralized here.
 *
 * @param [options] Optional ref and tip SHA overrides
 * @param [options.ref] Branch ref (defaults to `refs/heads/translate/test`)
 * @param [options.sha] Branch tip SHA (defaults to `branch-sha`)
 *
 * @returns Typed branch ref response for {@link GitHubService.getBranch}
 */
export function createGitBranchRefResponse(options?: {
	ref?: string;
	sha?: string;
}): GitBranchRefResponse {
	const sha = options?.sha ?? "branch-sha";
	const ref = options?.ref ?? "refs/heads/translate/test";

	return {
		data: {
			ref,
			object: {
				sha,
				type: "commit",
				url: `https://api.github.com/repos/test/test/git/commits/${sha}`,
			},
			url: `https://api.github.com/repos/test/test/git/refs/${ref.replace("refs/", "")}`,
			node_id: "REF_NODE",
		},
	} as GitBranchRefResponse;
}

const defaultLanguageAnalysisRawResult: LanguageAnalysisResult["rawResult"] = {
	reliable: true,
	languages: [],
	textBytes: 100,
	chunks: [],
};

/**
 * Creates a {@link LanguageAnalysisResult} fixture with sensible defaults.
 *
 * @param overrides Optional field overrides
 *
 * @returns Typed language analysis for mock `analyzeLanguage` responses
 */
export function createLanguageAnalysisResult(
	overrides: Partial<LanguageAnalysisResult> = {},
): LanguageAnalysisResult {
	return {
		languageScore: { target: 0.1, source: 0.9 },
		ratio: 0.1,
		isTranslated: false,
		detectedLanguage: "en",
		rawResult: defaultLanguageAnalysisRawResult,
		...overrides,
	};
}

/**
 * Creates a translated-target-language {@link LanguageAnalysisResult} fixture.
 *
 * @param overrides Optional field overrides
 *
 * @returns Language analysis indicating fork content is already translated
 */
export function createTranslatedLanguageAnalysis(
	overrides: Partial<LanguageAnalysisResult> = {},
): LanguageAnalysisResult {
	return createLanguageAnalysisResult({
		isTranslated: true,
		ratio: 0.9,
		detectedLanguage: "pt",
		languageScore: { target: 0.9, source: 0.1 },
		...overrides,
	});
}

/**
 * Creates an English-source {@link LanguageAnalysisResult} fixture.
 *
 * @param overrides Optional field overrides
 *
 * @returns Language analysis indicating fork content is not yet translated
 */
export function createUntranslatedLanguageAnalysis(
	overrides: Partial<LanguageAnalysisResult> = {},
): LanguageAnalysisResult {
	return createLanguageAnalysisResult({
		isTranslated: false,
		ratio: 0.1,
		detectedLanguage: "en",
		languageScore: { target: 0.1, source: 0.9 },
		...overrides,
	});
}

/**
 * Creates an array of {@link ProcessedFileResult} fixtures
 *
 * @param options Optional overrides
 * @param options.count Number of results to create
 * @param options.containInvalid Whether to include invalid results
 *
 * @returns Array of {@link ProcessedFileResult} fixtures
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
				reviewerNotices: [],
				pullRequest: null,
				pullRequestProgress: null,
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
			reviewerNotices: [],
			pullRequest: createMockPullRequestListItem(index + 1),
			pullRequestProgress: PullRequestProgressAction.Created,
			error: null,
		};
	});
}

/**
 * Creates an array of {@link TranslationFile} fixtures
 *
 * @param options Optional overrides
 * @param options.count Number of files to create
 *
 * @returns Array of {@link TranslationFile} fixtures
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
 * @param overrides Optional overrides
 * @param title Optional title to use in the frontmatter (defaults to "Untitled")
 *
 * @returns The {@link TranslationFile} fixture
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
 * @param overrides Optional overrides
 *
 * @returns The {@link PatchedRepositoryTreeItem} fixture
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
 * JSON assistant message content for mocked YAML `description` frontmatter LLM completions.
 *
 * @param descriptionTranslated Translated `description` string returned in the structured batch response
 *
 * @returns String passed as `choices[0].message.content` for the frontmatter batch completion
 */
export function createFrontmatterBatchLlmJsonContent(descriptionTranslated: string) {
	return JSON.stringify({
		items: [{ fieldKey: "description" as const, translated: descriptionTranslated }],
	});
}

/**
 * JSON assistant message content for mocked prose segment batch LLM completions.
 *
 * @param items Segment ids and translated strings for the structured batch response
 *
 * @returns String passed as `choices[0].message.content` for segment batch completions
 */
export function createSegmentBatchLlmJsonContent(
	items: readonly { segmentId: string; translated: string }[],
) {
	return JSON.stringify({ items });
}

/**
 * Creates a {@link ChatCompletion} fixture.
 *
 * @param overrides Optional overrides for the ChatCompletion fields
 * @param title Optional title to wrap content in frontmatter
 *
 * @returns The {@link ChatCompletion} fixture
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
 * @param overrides Optional overrides
 *
 * @returns The {@link LanguageAnalysisResult} fixture
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
