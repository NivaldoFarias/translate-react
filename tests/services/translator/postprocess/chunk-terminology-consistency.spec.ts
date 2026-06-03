import { describe, expect, test } from "bun:test";

import {
	buildChunkTerminologyRetryHints,
	buildTerminologyFormsByChunk,
	findChunkTerminologyConsistencyDrift,
} from "@/app/services/translator/postprocess/chunk-terminology-consistency";

describe("chunk-terminology-consistency", () => {
	test("findChunkTerminologyConsistencyDrift flags wiring drift across slices (pt-br #1206)", () => {
		const sourceChunks = [
			"## Wiring state\n\nIntro to wiring.",
			"Later sections discuss wiring again.",
		];
		const translatedChunks = [
			"## Lógica de estado\n\nIntro.",
			"Mais adiante, a lógica de conexão aparece de novo.",
		];

		const drifts = findChunkTerminologyConsistencyDrift(sourceChunks, translatedChunks);

		expect(drifts.length).toBeGreaterThan(0);
		expect(drifts[0]?.offendingChunkIndices).toEqual([0, 1]);
		expect(drifts[0]?.conflictingForms.some((form) => form.includes("lógica"))).toBe(true);
	});

	test("findChunkTerminologyConsistencyDrift flags Effect Event drift across slices (pt-br #1208)", () => {
		const sourceChunks = ["## Effect Event\n", "Limitations of Effect Events.\n"];
		const translatedChunks = ["## Evento de Effect\n", "Limitações dos Eventos de Efeito.\n"];

		const drifts = findChunkTerminologyConsistencyDrift(sourceChunks, translatedChunks);

		expect(drifts.length).toBeGreaterThan(0);
		expect(drifts[0]?.offendingChunkIndices).toEqual([0, 1]);
	});

	test("returns no drift for a single slice or matching forms across slices", () => {
		const sourceChunks = ["## Effect Event\n", "More Effect Event text."];
		const consistent = ["## Evento de Effect\n", "Mais texto sobre Evento de Effect."];

		expect(findChunkTerminologyConsistencyDrift(["only one"], ["único"])).toEqual([]);
		expect(findChunkTerminologyConsistencyDrift(sourceChunks, consistent)).toEqual([]);
	});

	test("buildChunkTerminologyRetryHints names slice numbers for LLM retries", () => {
		const drifts = findChunkTerminologyConsistencyDrift(
			["## Wiring\n", "wiring again"],
			["## Lógica", "lógica de conexão"],
		);

		const hints = buildChunkTerminologyRetryHints(drifts);

		expect(hints[0]).toContain("DOCUMENT SLICE consistency");
		expect(hints[0]).toMatch(/slices? 1, 2/);
	});

	test("buildTerminologyFormsByChunk maps forms per slice without glossary forbidden checks", () => {
		const maps = buildTerminologyFormsByChunk(
			["reset state", "reset again"],
			["resetar estado", "redefinir de novo"],
		);

		const wiringMap = maps.find((entry) => entry.rule.sourcePattern.test("wiring"));
		expect(wiringMap).toBeUndefined();
	});
});
