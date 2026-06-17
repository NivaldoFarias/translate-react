import { describe, expect, test } from "bun:test";

import { loadSegmentFixture } from "@tests/fixtures/segment-extraction/load-fixture.util";
import { mockTranslateWithProductionCleanup } from "@tests/helpers/segment-round-trip.util";

describe("reinsertSegments", () => {
	test("preserves spacing around link labels when translation length changes", () => {
		const source = "Written by [Matt Carroll](https://example.com) and team.";
		const output = mockTranslateWithProductionCleanup(source, (text) =>
			text.includes("[") ? text : text.trim().replace("Written by", "Escrito por"),
		);

		expect(output).toContain("por [Matt Carroll]");
	});

	test("preserves space before MDX slug comments in headings", () => {
		const source = loadSegmentFixture("S2");
		const output = mockTranslateWithProductionCleanup(source, (text) =>
			text.trim() === "Agenda" ? "Pauta" : text,
		);

		expect(output).toMatch(/## Pauta \{.*agenda.*\}/i);
	});

	test("does not duplicate heading markers when segment output repeats them", () => {
		const source = "## How to migrate {/*how-to-migrate*/}\n\nBody.";
		const output = mockTranslateWithProductionCleanup(source, (text) =>
			text.trim() === "How to migrate" ? "## Como migrar" : text,
		);

		expect(output).toContain("## Como migrar {/*how-to-migrate*/}");
		expect(output).not.toContain("## ##");
	});

	test("round-trips S2 fixture with variable-length mock translations", () => {
		const source = loadSegmentFixture("S2");
		const output = mockTranslateWithProductionCleanup(source, (text) => `${text.trim()}ü`);

		expect(output).toContain("ü");
		expect(output).not.toMatch(/\S\{\/\*/);
	});

	test("round-trips S6 fixture without gluing slug comments to heading text", () => {
		const source = loadSegmentFixture("S6");
		const output = mockTranslateWithProductionCleanup(source, (text) =>
			text.trim().length > 0 ? `${text.trim()}ü` : text,
		);

		expect(output).not.toMatch(/\S\{\/\*/);
		expect(output).not.toMatch(/##\s+##/);
	});

	test("round-trips S4 fixture while preserving JSX static text segments", () => {
		const source = loadSegmentFixture("S4");
		const output = mockTranslateWithProductionCleanup(source, suffixMockTranslate);

		expect(output).toContain("ü");
		expect(output).not.toMatch(/##\s+##/);
	});
});

/**
 * Appends ü to trimmed translatable prose for structure-preserving mock output.
 *
 * @param text Segment source text
 *
 * @returns Mock translation
 */
function suffixMockTranslate(text: string) {
	const trimmed = text.trim();
	return trimmed.length === 0 ? text : `${text.trim()}ü`;
}
