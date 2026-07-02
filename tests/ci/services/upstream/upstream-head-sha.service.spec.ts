import { beforeEach, describe, expect, mock, test } from "bun:test";
import pino from "pino";

import type { Octokit } from "@octokit/rest";

import type { UpstreamLocaleConfig } from "@/ci/services/upstream/types";

import { UpstreamHeadShaService } from "@/ci/services/upstream/upstream-head-sha.service";

const ptBrLocale: UpstreamLocaleConfig = {
	lang: "pt-br",
	upstream_owner: "reactjs",
	upstream_name: "pt-br.react.dev",
	fork_name: "pt-br.react.dev",
	translation_guidelines_file: "GLOSSARY.md",
};

const testLogger = pino({ level: "silent" });

function createTestHeadShaService(options?: {
	defaultBranch?: string;
	headSha?: string | undefined;
}) {
	const defaultBranch = options?.defaultBranch ?? "main";
	const headSha = options?.headSha;

	const reposGet = mock(() => Promise.resolve({ data: { default_branch: defaultBranch } }));
	const reposListCommits = mock(() => Promise.resolve({ data: headSha ? [{ sha: headSha }] : [] }));

	const octokit = {
		rest: {
			repos: {
				get: reposGet,
				listCommits: reposListCommits,
			},
		},
	} as unknown as Octokit;

	const service = new UpstreamHeadShaService(octokit, testLogger);

	return { service, reposGet, reposListCommits };
}

describe("UpstreamHeadShaService", () => {
	beforeEach(() => {
		mock.restore();
	});

	test("returns the default-branch head SHA for an upstream locale", async () => {
		const { service, reposGet, reposListCommits } = createTestHeadShaService({
			headSha: "abc123upstream",
		});

		const sha = await service.fetchDefaultBranchHeadSha(ptBrLocale);

		expect(sha).toBe("abc123upstream");
		expect(reposGet).toHaveBeenCalledWith({
			owner: "reactjs",
			repo: "pt-br.react.dev",
		});
		expect(reposListCommits).toHaveBeenCalledWith({
			owner: "reactjs",
			repo: "pt-br.react.dev",
			sha: "main",
			per_page: 1,
		});
	});

	test("throws when the default branch has no commits", () => {
		const { service } = createTestHeadShaService({ headSha: undefined });

		expect(service.fetchDefaultBranchHeadSha(ptBrLocale)).rejects.toThrow(
			"No commits on reactjs/pt-br.react.dev@main",
		);
	});
});
