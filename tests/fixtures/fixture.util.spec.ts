import { describe, expect, test } from "bun:test";

import { TranslationFile } from "@/app/services/translator/translation-file";

import { WORKFLOW_FIXTURE_MANIFEST } from "@tests/fixtures/md/workflow.manifest";
import {
	buildWorkflowFixtureBlob,
	buildWorkflowFixtureFile,
	defaultWorkflowFixtureManifestEntry,
	patchWorkflowFixtureTreeItem,
	WorkflowFixturePrScenario,
} from "@tests/fixtures/workflow-fixture.util";

describe("workflow fixture utilities", () => {
	test("manifest tree rows patch into PatchedRepositoryTreeItem", () => {
		const entry = WORKFLOW_FIXTURE_MANIFEST["use-memo.md"];
		const treeItem = patchWorkflowFixtureTreeItem(entry.tree);

		expect(treeItem.path).toBe("src/content/reference/react/use-memo.md");
		expect(treeItem.filename).toBe("use-memo.md");
		expect(treeItem.sha).toBe("sha-fixture-use-memo.md");
		expect(treeItem.type).toBe("blob");
	});

	test("buildWorkflowFixtureFile mirrors getFile + fromRepositoryBlob inputs", () => {
		const entry = WORKFLOW_FIXTURE_MANIFEST["hydrateRoot.md"];
		const fixture = buildWorkflowFixtureFile(entry.tree, "# Title\n", entry.smoke);
		const translationFile = TranslationFile.fromRepositoryBlob(fixture.blob);

		expect(fixture.treeItem.path).toBe(fixture.blob.path);
		expect(fixture.treeItem.filename).toBe(fixture.blob.filename);
		expect(translationFile.path).toBe(fixture.blob.path);
		expect(translationFile.content).toBe("# Title\n");
		expect(fixture.smoke.pullRequestNumber).toBe(102);
		expect(fixture.smoke.pullRequestScenario).toBe(WorkflowFixturePrScenario.New);
	});

	test("manifest workflow scenarios are defined for PR branch coverage", () => {
		expect(WORKFLOW_FIXTURE_MANIFEST["lazy.md"].smoke.pullRequestScenario).toBe(
			WorkflowFixturePrScenario.OutOfSync,
		);
		expect(WORKFLOW_FIXTURE_MANIFEST["react-19.md"].smoke.pullRequestScenario).toBe(
			WorkflowFixturePrScenario.New,
		);
		expect(WORKFLOW_FIXTURE_MANIFEST["react-conf-2021-recap.md"].smoke.pullRequestScenario).toBe(
			WorkflowFixturePrScenario.ValidSkip,
		);
	});

	test("default manifest entry uses flat src/content path", () => {
		const entry = defaultWorkflowFixtureManifestEntry("new-doc.md");

		expect(entry.tree.path).toBe("src/content/new-doc.md");
		expect(buildWorkflowFixtureBlob(patchWorkflowFixtureTreeItem(entry.tree), "x").path).toBe(
			"src/content/new-doc.md",
		);
	});
});
