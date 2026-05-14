import fs from "node:fs/promises";
import path from "node:path";

import { spyOn } from "bun:test";

import type { RestEndpointMethodTypes } from "@octokit/rest";
import type OpenAI from "openai";
import type PQueue from "p-queue";

import type { CacheService } from "@/services/cache/";
import type { GitHubService } from "@/services/github/";
import type { LanguageDetectorService } from "@/services/language-detector/";
import type { LanguageCacheEntry, RunnerServiceDependencies } from "@/services/runner/runner.types";

import { localeService } from "@/services/";
import { openRouterModelLimitsService } from "@/services/openrouter/";
import { RunnerService } from "@/services/runner/runner.service";
import { TranslationFile, TranslatorService } from "@/services/translator/";

import {
	createMockGitHubService,
	createMockLanguageCacheService,
	createMockLanguageDetectorService,
	createMockOpenAI,
	createMockQueue,
	createPassthroughChatCompletionsMock,
} from "@tests/mocks";

type GitTree = RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"];

/** Describes the single upstream markdown file exercised by a workflow integration run */
export type IntegrationWorkflowFile = Readonly<{
	repoPath: string;
	filename: string;
	content: string;
	sha: string;
}>;

/** Small markdown fixture for workflow integration tests */
export const INTEGRATION_SMALL_MARKDOWN = `---
title: "Integration"
---

# Section

See [example](https://example.com).

\`\`\`js
const x = 1;
\`\`\`
`;

let openRouterLimitsSpy: { mockRestore: () => void } | undefined;

/** Avoids real HTTP to OpenRouter during `TranslatorService.testConnectivity` in tests */
export function installOpenRouterModelLimitsStub() {
	openRouterLimitsSpy = spyOn(
		openRouterModelLimitsService,
		"fetchLimitsForModel",
	).mockResolvedValue(null) as { mockRestore: () => void };
}

/** Restores the OpenRouter limits spy installed by {@link installOpenRouterModelLimitsStub} */
export function restoreOpenRouterModelLimitsStub() {
	openRouterLimitsSpy?.mockRestore();
	openRouterLimitsSpy = undefined;
}

/**
 * Reads a UTF-8 markdown fixture relative to the `tests/` directory (e.g. `fixtures/foo.md`).
 *
 * @param relativePath Path under `tests/`, beginning with `fixtures/`
 */

export async function readTestsFixtureUtf8(relativePath: `fixtures/${string}`) {
	const absolutePath = path.resolve(import.meta.dir, "..", relativePath);

	return fs.readFile(absolutePath, "utf8");
}

/**
 * Builds a GitHub mock whose tree and `getFile` results match one markdown document.
 *
 * @param file Repository path, display filename, raw content, and blob sha for the scenario
 */
export function createWorkflowGitHubService(file: IntegrationWorkflowFile) {
	const github = createMockGitHubService();

	github.getRepositoryTree.mockResolvedValue([
		{
			path: file.repoPath,
			type: "blob",
			sha: file.sha,
			mode: "100644",
		},
	] satisfies GitTree);

	github.getFile.mockImplementation(() =>
		Promise.resolve(new TranslationFile(file.content, file.filename, file.repoPath, file.sha)),
	);

	github.getPullRequestFiles.mockResolvedValue([file.repoPath]);

	return github;
}

/**
 * Creates a mock TranslatorService for testing.
 *
 * Uses a passthrough chat-completions mock that echoes the last user message as assistant content.
 *
 * @returns Mocked TranslatorService instance
 */
export function createIntegrationTranslator() {
	const chatMock = createPassthroughChatCompletionsMock();

	const translator = new TranslatorService({
		openai: createMockOpenAI(chatMock) as unknown as OpenAI,
		model: "gpt-4o",
		localeService,
		languageDetectorService:
			createMockLanguageDetectorService() as unknown as LanguageDetectorService,
		queue: createMockQueue() as unknown as PQueue,
		retryConfig: {
			retries: 0,
			factor: 1,
			minTimeout: 1,
			maxTimeout: 10,
			randomize: false,
		},
	});

	return { translator, chatMock };
}

export function createIntegrationRunner(file: IntegrationWorkflowFile) {
	const github = createWorkflowGitHubService(file);
	const { translator, chatMock } = createIntegrationTranslator();

	const runner = new RunnerService(
		{
			github: github as unknown as GitHubService,
			translator,
			languageCache:
				createMockLanguageCacheService() as unknown as CacheService<LanguageCacheEntry>,
			locale: localeService,
			languageDetector: createMockLanguageDetectorService() as unknown as LanguageDetectorService,
		} as RunnerServiceDependencies,
		{ batchSize: 1 },
	);

	return { runner, github, translator, chatMock };
}
