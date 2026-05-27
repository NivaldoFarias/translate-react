import { describe, expect, test } from "bun:test";

import {
	parseCiPollResolveEnvironment,
	resolveCiScriptContext,
} from "@/ci/schemas/env.schema";

describe("ci env.schema", () => {
	test("parseCiPollResolveEnvironment accepts valid workflow script variables", () => {
		const environment = parseCiPollResolveEnvironment({
			GH_TOKEN: "a".repeat(20),
			GITHUB_REPOSITORY: "my-org/translate-react",
			GITHUB_OUTPUT: "/tmp/github-output",
			GITHUB_REPOSITORY_OWNER: "my-org",
		});

		expect(environment.GITHUB_REPOSITORY).toBe("my-org/translate-react");
	});

	test("parseCiPollResolveEnvironment rejects malformed GITHUB_REPOSITORY", () => {
		expect(() =>
			parseCiPollResolveEnvironment({
				GH_TOKEN: "a".repeat(20),
				GITHUB_REPOSITORY: "not-a-slug",
				GITHUB_OUTPUT: "/tmp/github-output",
			}),
		).toThrow();
	});
});

describe("resolveCiScriptContext", () => {
	test("resolveCiScriptContext parses repository and fork owner", () => {
		const context = resolveCiScriptContext(
			parseCiPollResolveEnvironment({
				GH_TOKEN: "a".repeat(20),
				GITHUB_REPOSITORY: "my-org/translate-react",
				GITHUB_OUTPUT: "/tmp/github-output",
				GITHUB_REPOSITORY_OWNER: "my-org",
			}),
		);

		expect(context.repository).toEqual({ owner: "my-org", repo: "translate-react" });
		expect(context.forkOwner).toBe("my-org");
		expect(context.githubOutputPath).toBe("/tmp/github-output");
	});

	test("resolveCiScriptContext defaults fork owner to repository owner", () => {
		const context = resolveCiScriptContext(
			parseCiPollResolveEnvironment({
				GH_TOKEN: "a".repeat(20),
				GITHUB_REPOSITORY: "my-org/translate-react",
				GITHUB_OUTPUT: "/tmp/github-output",
			}),
		);

		expect(context.forkOwner).toBe("my-org");
	});
});
