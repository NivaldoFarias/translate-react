import type { WorkflowFixtureManifestEntry } from "@tests/fixtures/workflow-fixture.util";

import {
	workflowFixtureBlobUrl,
	WorkflowFixtureProfile,
	WorkflowFixturePrScenario,
} from "@tests/fixtures/workflow-fixture.util";

/**
 * Upstream translation candidates for smoke and integration workflow runs.
 *
 * Drop English source from `reactjs/en.react.dev` into `tests/fixtures/md/<basename>`.
 * Only basenames with a matching `.md` file on disk are loaded; manifest rows without a file
 * are ignored until you add the fixture.
 *
 * - `profile`: which translation surface or guard set to exercise (output quality).
 * - `tree`: {@link PatchedRepositoryTreeItem} fields from `getRepositoryTree` (`filename` derived from `path`).
 * - `smoke`: mocked GitHub only ({@link WorkflowFixturePrScenario} drives Created vs Updated vs skip).
 *
 * @param path The path to the fixture file
 *
 * @returns The {@link PatchedRepositoryTreeItem} fixture
 */
function fixtureTree(path: string) {
	const filename = path.split("/").pop() ?? path;
	const sha = `sha-fixture-${filename}`;

	return {
		path,
		sha,
		type: "blob" as const,
		mode: "100644" as const,
		url: workflowFixtureBlobUrl(sha),
	};
}

export const WORKFLOW_FIXTURE_MANIFEST = {
	// --- Translation output coverage (smoke: new PR / Created section) ---

	"use-memo.md": {
		profile: WorkflowFixtureProfile.ReferenceApiSmall,
		tree: fixtureTree("src/content/reference/react/use-memo.md"),
		smoke: {
			pullRequestNumber: 101,
			pullRequestScenario: WorkflowFixturePrScenario.New,
		},
	},
	"hydrateRoot.md": {
		profile: WorkflowFixtureProfile.ReferenceClientMedium,
		tree: fixtureTree("src/content/reference/react-dom/client/hydrateRoot.md"),
		smoke: {
			pullRequestNumber: 102,
			pullRequestScenario: WorkflowFixturePrScenario.New,
		},
	},
	"react-labs-view-transitions-activity-and-more.md": {
		profile: WorkflowFixtureProfile.BlogMdxLarge,
		tree: fixtureTree("src/content/blog/2025/03/react-labs-view-transitions-activity-and-more.md"),
		smoke: {
			pullRequestNumber: 103,
			pullRequestScenario: WorkflowFixturePrScenario.New,
		},
	},
	"describing-the-ui.md": {
		profile: WorkflowFixtureProfile.LearnTutorial,
		tree: fixtureTree("src/content/learn/describing-the-ui.md"),
		smoke: {
			pullRequestNumber: 104,
			pullRequestScenario: WorkflowFixturePrScenario.New,
		},
	},
	"invalid-hook-call-warning.md": {
		profile: WorkflowFixtureProfile.ReferenceWarning,
		tree: fixtureTree("src/content/reference/react/warnings/invalid-hook-call-warning.md"),
		smoke: {
			pullRequestNumber: 105,
			pullRequestScenario: WorkflowFixturePrScenario.New,
		},
	},
	"rules-of-hooks.md": {
		profile: WorkflowFixtureProfile.LearnRules,
		tree: fixtureTree("src/content/reference/react/rules/rules-of-hooks.md"),
		smoke: {
			pullRequestNumber: 106,
			pullRequestScenario: WorkflowFixturePrScenario.New,
		},
	},
	"Children.md": {
		profile: WorkflowFixtureProfile.JsxInFences,
		tree: fixtureTree("src/content/reference/react/Children.md"),
		smoke: {
			pullRequestNumber: 107,
			pullRequestScenario: WorkflowFixturePrScenario.New,
		},
	},

	// --- Workflow branch coverage (add `.md` when exercising PR logic locally) ---

	"lazy.md": {
		profile: WorkflowFixtureProfile.ReferenceApiSmall,
		tree: fixtureTree("src/content/reference/react/lazy.md"),
		smoke: {
			pullRequestNumber: 201,
			pullRequestScenario: WorkflowFixturePrScenario.OutOfSync,
		},
	},
	"react-19.md": {
		profile: WorkflowFixtureProfile.BlogShort,
		tree: fixtureTree("src/content/blog/2024/12/05/react-19.md"),
		smoke: {
			pullRequestNumber: 202,
			pullRequestScenario: WorkflowFixturePrScenario.New,
		},
	},
	"react-conf-2021-recap.md": {
		profile: WorkflowFixtureProfile.BlogShort,
		tree: fixtureTree("src/content/blog/2021/12/17/react-conf-2021-recap.md"),
		smoke: {
			pullRequestNumber: 203,
			pullRequestScenario: WorkflowFixturePrScenario.ValidSkip,
		},
	},
} as const satisfies Record<string, WorkflowFixtureManifestEntry>;
