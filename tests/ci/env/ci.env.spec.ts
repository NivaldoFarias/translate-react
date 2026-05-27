import { describe, expect, test } from "bun:test";

import { resolveCiWorkflowScriptContext } from "@/ci/env/ci-script-context";
import { parseCiEnvironment } from "@/ci/env/ci.env";

describe("ci.env", () => {
	test("parseCiEnvironment accepts valid workflow script variables", () => {
		const environment = parseCiEnvironment({
			GH_TOKEN: "a".repeat(20),
			GITHUB_REPOSITORY: "my-org/translate-react",
			GITHUB_OUTPUT: "/tmp/github-output",
			GITHUB_REPOSITORY_OWNER: "my-org",
		});

		expect(environment.GITHUB_REPOSITORY).toBe("my-org/translate-react");
	});

	test("parseCiEnvironment rejects malformed GITHUB_REPOSITORY", () => {
		expect(() =>
			parseCiEnvironment({
				GH_TOKEN: "a".repeat(20),
				GITHUB_REPOSITORY: "not-a-slug",
				GITHUB_OUTPUT: "/tmp/github-output",
			}),
		).toThrow();
	});
});

describe("ci-script-context", () => {
	test("resolveCiWorkflowScriptContext parses repository and fork owner", () => {
		const context = resolveCiWorkflowScriptContext(
			parseCiEnvironment({
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

	test("resolveCiWorkflowScriptContext defaults fork owner to repository owner", () => {
		const context = resolveCiWorkflowScriptContext(
			parseCiEnvironment({
				GH_TOKEN: "a".repeat(20),
				GITHUB_REPOSITORY: "my-org/translate-react",
				GITHUB_OUTPUT: "/tmp/github-output",
			}),
		);

		expect(context.forkOwner).toBe("my-org");
	});
});
