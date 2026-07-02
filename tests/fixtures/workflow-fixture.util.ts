import type {
	PatchedRepositoryTreeItem,
	RepositoryMarkdownBlob,
} from "@/app/services/github/types";

/** Git tree fields for an upstream markdown blob before runner filename patching */
export type WorkflowFixtureTree = Readonly<
	Pick<PatchedRepositoryTreeItem, "path" | "sha" | "type" | "mode"> &
		Partial<Pick<PatchedRepositoryTreeItem, "url">>
>;

/**
 * Which translation surface or workflow branch a fixture is meant to exercise locally.
 *
 * Copy matching pages from `reactjs/en.react.dev` into `tests/fixtures/md/<basename>`.
 */
export enum WorkflowFixtureProfile {
	/** Hook or small API reference (~few KB, usually one segment batch) */
	ReferenceApiSmall = "reference-api-small",

	/** Client or package API page with large fenced examples (multi-batch segment path) */
	ReferenceClientMedium = "reference-client-medium",

	/** Long blog post with MDX components and many segments */
	BlogMdxLarge = "blog-mdx-large",

	/** `src/content/learn/…` tutorial prose, steps, and callouts */
	LearnTutorial = "learn-tutorial",

	/** Short `warnings/` or `errors/` reference page */
	ReferenceWarning = "reference-warning",

	/** Rules or principles pages with lists and nested structure */
	LearnRules = "learn-rules",

	/** API docs whose examples stress fence JSX static text guards */
	JsxInFences = "jsx-static-in-fences",

	/** Shorter blog or recap article */
	BlogShort = "blog-short",
}

/** How mocked GitHub should treat an open translation pull request for this path */
export enum WorkflowFixturePrScenario {
	/** No open PR; runner opens a new upstream pull request */
	New = "new",

	/** Open PR behind base with merge conflicts; runner refreshes branch and updates the PR */
	OutOfSync = "out_of_sync",

	/** Open PR already in sync with translated fork content; runner skips LLM work */
	ValidSkip = "valid_skip",
}

/** Mock GitHub knobs for smoke and integration artifact capture */
export interface WorkflowFixtureSmoke {
	pullRequestNumber: number;
	pullRequestScenario?: WorkflowFixturePrScenario;

	/** Fork branch markdown returned by `getForkFileContentAtBranch` for existing-PR scenarios */
	forkContent?: string;
}

/**
 * Static upstream candidate metadata for one fixture `.md` basename.
 *
 * `tree` mirrors a {@link PatchedRepositoryTreeItem} entry from `getRepositoryTree` (without
 * `filename`, which the runner derives from `path`). Markdown body bytes are loaded from disk.
 */
export type WorkflowFixtureManifestEntry = Readonly<{
	profile?: WorkflowFixtureProfile;
	tree: WorkflowFixtureTree;
	smoke?: Partial<WorkflowFixtureSmoke>;
}>;

/**
 * Loaded workflow fixture: upstream tree item, fetched blob, and smoke-only mock metadata.
 *
 * Matches the objects produced by discovery (`PatchedRepositoryTreeItem`) and
 * {@link GitHubService.getFile} (`RepositoryMarkdownBlob`) before translation starts.
 */
export type WorkflowFixtureFile = Readonly<{
	treeItem: PatchedRepositoryTreeItem;
	blob: RepositoryMarkdownBlob;
	smoke: WorkflowFixtureSmoke;
}>;

/**
 * Patches a fixture tree row the same way {@link RunnerService} patches GitHub tree items.
 *
 * @param tree Repository tree fields for one markdown blob
 *
 * @returns Tree item with `filename` derived from `path`
 */
export function patchWorkflowFixtureTreeItem(tree: WorkflowFixtureTree): PatchedRepositoryTreeItem {
	const filename = tree.path.split("/").pop() ?? "";

	return {
		...tree,
		filename,
		type: tree.type,
		mode: tree.mode,
	};
}

/**
 * Builds the markdown blob shape returned by {@link GitHubService.getFile}.
 *
 * @param treeItem Patched repository tree item for the blob
 * @param content UTF-8 markdown body loaded from the fixture file
 *
 * @returns Upstream markdown blob metadata
 */
export function buildWorkflowFixtureBlob(
	treeItem: PatchedRepositoryTreeItem,
	content: string,
): RepositoryMarkdownBlob {
	return {
		content,
		filename: treeItem.filename,
		path: treeItem.path,
		sha: treeItem.sha,
	};
}

/**
 * Assembles a loaded integration workflow file from manifest metadata and fixture content.
 *
 * @param tree Repository tree fields for the candidate
 * @param content UTF-8 markdown loaded from `tests/fixtures/md/<basename>`
 * @param smoke Optional smoke-only overrides for mocked GitHub responses
 *
 * @returns Fixture file aligned with production discovery inputs
 */
export function buildWorkflowFixtureFile(
	tree: WorkflowFixtureTree,
	content: string,
	smoke?: Partial<WorkflowFixtureSmoke>,
): WorkflowFixtureFile {
	const treeItem = patchWorkflowFixtureTreeItem(tree);
	const blob = buildWorkflowFixtureBlob(treeItem, content);

	return {
		treeItem,
		blob,
		smoke: {
			pullRequestNumber: smoke?.pullRequestNumber ?? 1,
			pullRequestScenario: smoke?.pullRequestScenario ?? WorkflowFixturePrScenario.New,
			forkContent: smoke?.forkContent,
		},
	};
}

/**
 * Builds a Git tree blob URL for fixture SHAs (upstream `pt-br.react.dev` shape).
 *
 * @param sha Git blob SHA from the manifest tree row
 *
 * @returns REST URL for `git/blobs/{sha}`
 */
export function workflowFixtureBlobUrl(sha: string) {
	return `https://api.github.com/repos/reactjs/pt-br.react.dev/git/blobs/${sha}`;
}

/**
 * Default Portuguese fork-branch body for existing-PR smoke scenarios.
 *
 * Long enough for real CLD target-language detection in workflow integration tests.
 *
 * @param filename Display filename for the translated page
 *
 * @returns Markdown body stored on the fork `translate/…` branch
 */
export function defaultWorkflowFixtureForkContent(filename: string) {
	return `\
---
title: Título de exemplo
description: Descrição em português para simular conteúdo já traduzido no fork durante testes locais.
---

## Seção de exemplo {/*exemplo*/}

Este parágrafo em português simula o arquivo \`${filename}\` já traduzido no branch do fork.
O detector de idioma precisa de texto suficiente em português brasileiro para marcar a página como traduzida.
`;
}

/**
 * Default manifest entry when a basename has no explicit row in `workflow.manifest.ts`.
 *
 * @param basename Fixture filename under `tests/fixtures/md/`
 *
 * @returns Tree metadata for a flat `src/content/<basename>` candidate
 */
export function defaultWorkflowFixtureManifestEntry(
	basename: string,
): WorkflowFixtureManifestEntry {
	return {
		tree: {
			path: `src/content/${basename}`,
			sha: `sha-fixture-${basename}`,
			type: "blob",
			mode: "100644",
		},
	};
}
