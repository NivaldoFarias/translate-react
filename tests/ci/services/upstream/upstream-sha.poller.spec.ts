import { beforeEach, describe, expect, mock, test } from "bun:test";
import pino from "pino";

import type { Octokit } from "@octokit/rest";

import type { UpstreamLocaleConfig } from "@/ci/services/upstream/types";
import type { UpstreamShaVariableReader } from "@/ci/services/upstream/upstream-sha-variable.reader";

import { UpstreamShaPoller } from "@/ci/services/upstream/upstream-sha.poller";

const ptBrLocale: UpstreamLocaleConfig = {
	lang: "pt-br",
	upstream_owner: "reactjs",
	upstream_name: "pt-br.react.dev",
	fork_name: "pt-br.react.dev",
	translation_guidelines_file: "GLOSSARY.md",
};

const testLogger = pino({ level: "silent" });

function createTestPoller(options?: { storedSha?: string | undefined; headSha?: string }) {
	const storedSha = options?.storedSha;
	const headSha = options?.headSha ?? "upstream-head-sha";

	const reposGet = mock(() => Promise.resolve({ data: { default_branch: "main" } }));
	const reposListCommits = mock(() => Promise.resolve({ data: [{ sha: headSha }] }));

	const octokit = {
		rest: {
			repos: {
				get: reposGet,
				listCommits: reposListCommits,
			},
		},
	} as unknown as Octokit;

	const variableReader = {
		readStoredSha: mock(() => Promise.resolve(storedSha)),
	} as unknown as UpstreamShaVariableReader;

	const poller = new UpstreamShaPoller(octokit, variableReader, testLogger);

	return { poller, reposGet, reposListCommits, variableReader };
}

describe("UpstreamShaPoller", () => {
	beforeEach(() => {
		mock.restore();
	});

	test("includes locale when stored SHA is missing", async () => {
		const { poller } = createTestPoller({ storedSha: undefined });

		const result = await poller.poll([ptBrLocale], "fork-owner");

		expect(result.hasChanges).toBe(true);
		expect(result.matrix).toHaveLength(1);
		expect(result.matrix[0]).toMatchObject({
			lang: "pt-br",
			fork_owner: "fork-owner",
			upstream_sha: "upstream-head-sha",
		});
	});

	test("includes locale when upstream SHA changed", async () => {
		const { poller } = createTestPoller({
			storedSha: "old-sha",
			headSha: "new-sha",
		});

		const result = await poller.poll([ptBrLocale], "fork-owner");

		expect(result.hasChanges).toBe(true);
		expect(result.matrix[0]?.upstream_sha).toBe("new-sha");
	});

	test("returns empty matrix when upstream SHA matches stored SHA", async () => {
		const { poller } = createTestPoller({
			storedSha: "same-sha",
			headSha: "same-sha",
		});

		const result = await poller.poll([ptBrLocale], "fork-owner");

		expect(result.hasChanges).toBe(false);
		expect(result.matrix).toEqual([]);
	});

	test("uses per-locale fork_owner on changed rows", async () => {
		const { poller } = createTestPoller({ storedSha: undefined, headSha: "new-sha" });
		const localeWithOwner: UpstreamLocaleConfig = {
			...ptBrLocale,
			fork_owner: "locale-specific-owner",
		};

		const result = await poller.poll([localeWithOwner], "default-owner");

		expect(result.matrix[0]?.fork_owner).toBe("locale-specific-owner");
	});
});
