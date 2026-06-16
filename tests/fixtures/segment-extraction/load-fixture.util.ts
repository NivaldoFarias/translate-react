import { readFileSync } from "node:fs";
import { join } from "node:path";

import { reactLabsMd } from "../react-docs-fixtures";

const FIXTURE_DIR = import.meta.dir;

/** Segment extraction scenario fixtures S1–S10 */
export const SEGMENT_FIXTURE_REGISTRY = [
	{ id: "S1", file: "s1-baseline-prose.md" },
	{ id: "S2", file: "s2-links-anchors.md" },
	{ id: "S3", file: "s3-fence-function-identifiers.md" },
	{ id: "S4", file: "s4-fence-jsx-static-text.md" },
	{ id: "S5", file: "s5-fence-comments-only.md" },
	{ id: "S6", file: "s6-mdx-components-slug.md" },
	{ id: "S7", file: "s7-frontmatter-keys.md" },
	{ id: "S8", file: "s8-duplicate-sentence.md" },
	{ id: "S9", file: "react-labs-view-transitions-activity-and-more.md", external: true },
	{ id: "S10", file: "s10-maintainer-feedback-shape.md" },
] as const;

/**
 * Loads a segment extraction scenario fixture by id.
 *
 * @param fixtureId Scenario id such as `S1`
 *
 * @returns Raw markdown source
 */
export function loadSegmentFixture(fixtureId: string) {
	const entry = SEGMENT_FIXTURE_REGISTRY.find((item) => item.id === fixtureId);
	if (!entry) {
		throw new Error(`Unknown segment fixture: ${fixtureId}`);
	}

	if (entry.id === "S9") {
		return reactLabsMd;
	}

	return readFileSync(join(FIXTURE_DIR, entry.file), "utf8");
}
