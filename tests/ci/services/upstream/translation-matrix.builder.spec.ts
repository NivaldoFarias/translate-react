import { beforeEach, describe, expect, mock, test } from "bun:test";
import pino from "pino";

import type { Octokit } from "@octokit/rest";

import type { UpstreamLocaleConfig } from "@/ci/services/upstream/types";

import { TranslationMatrixBuilder } from "@/ci/services/upstream/translation-matrix.builder";

const ptBrLocale: UpstreamLocaleConfig = {
	lang: "pt-br",
	upstream_owner: "reactjs",
	upstream_name: "pt-br.react.dev",
	fork_name: "pt-br.react.dev",
	translation_guidelines_file: "GLOSSARY.md",
};

const ruLocaleWithOwner: UpstreamLocaleConfig = {
	lang: "ru",
	upstream_owner: "reactjs",
	upstream_name: "ru.react.dev",
	fork_name: "ru.react.dev",
	translation_guidelines_file: "TRANSLATION.md",
	fork_owner: "custom-fork-org",
};

const testLogger = pino({ level: "silent" });

function createTestBuilder(headSha = "upstream-head-sha") {
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

	return {
		builder: new TranslationMatrixBuilder(octokit, testLogger),
		reposGet,
		reposListCommits,
	};
}

describe("TranslationMatrixBuilder", () => {
	beforeEach(() => {
		mock.restore();
	});

	test("uses default fork owner when locale row omits fork_owner", async () => {
		const { builder } = createTestBuilder();

		const matrix = await builder.build([ptBrLocale], "default-owner");

		expect(matrix).toHaveLength(1);
		expect(matrix[0]).toMatchObject({
			lang: "pt-br",
			fork_owner: "default-owner",
			upstream_sha: "upstream-head-sha",
		});
	});

	test("uses per-locale fork_owner when configured in registry row", async () => {
		const { builder } = createTestBuilder("ru-head-sha");

		const matrix = await builder.build([ptBrLocale, ruLocaleWithOwner], "default-owner");

		expect(matrix).toHaveLength(2);
		expect(matrix[0]?.fork_owner).toBe("default-owner");
		expect(matrix[1]).toMatchObject({
			lang: "ru",
			fork_owner: "custom-fork-org",
			upstream_sha: "ru-head-sha",
		});
	});
});
