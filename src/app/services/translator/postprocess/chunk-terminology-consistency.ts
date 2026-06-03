import { PT_BR_TERMINOLOGY_CONSISTENCY_RULES } from "@/app/constants/pt-br-terminology.constants";

import { stripMarkdownForTerminologyProse } from "../validation/analyzers/markdown-prose.util";

/** Drift detected across translated document slices after chunk reassembly */
export interface ChunkTerminologyDrift {
	/** English anchor that appeared in multiple source slices */
	readonly englishAnchor: string;

	/** Distinct Portuguese forms found across slices */
	readonly conflictingForms: readonly string[];

	/** Zero-based slice indices that contributed conflicting forms */
	readonly offendingChunkIndices: readonly number[];

	/** Hint for LLM retry on affected slices only */
	readonly glossaryHint: string;
}

/**
 * Maps each consistency-rule anchor to Portuguese forms present per translated slice.
 *
 * Used by {@link findChunkTerminologyConsistencyDrift}; does not run glossary forbidden-term checks.
 *
 * @param sourceChunks Original markdown slices from chunking
 * @param translatedChunks Translated slices before reassembly
 *
 * @returns Per-rule maps of slice index to forms detected in that slice
 */
export function buildTerminologyFormsByChunk(
	sourceChunks: readonly string[],
	translatedChunks: readonly string[],
) {
	const maps: {
		rule: (typeof PT_BR_TERMINOLOGY_CONSISTENCY_RULES)[number];
		formsByChunk: Map<number, readonly string[]>;
	}[] = [];

	for (const rule of PT_BR_TERMINOLOGY_CONSISTENCY_RULES) {
		const formsByChunk = new Map<number, readonly string[]>();

		for (let index = 0; index < sourceChunks.length; index++) {
			const sourceChunk = sourceChunks[index];
			const translatedChunk = translatedChunks[index];
			if (sourceChunk === undefined || translatedChunk === undefined) continue;

			const sourceProse = stripMarkdownForTerminologyProse(sourceChunk);
			if (!rule.sourcePattern.test(sourceProse)) continue;

			const translatedProse = stripMarkdownForTerminologyProse(translatedChunk);
			const forms = rule.conflictingForms.filter((form) =>
				translatedProse.toLowerCase().includes(form.toLowerCase()),
			);

			if (forms.length > 0) {
				formsByChunk.set(index, forms);
			}
		}

		if (formsByChunk.size > 0) {
			maps.push({ rule, formsByChunk });
		}
	}

	return maps;
}

/**
 * Detects pt-br terminology drift across translated chunks after reassembly.
 *
 * Complements {@link findTerminologyConsistencyViolations} on the full document: this pass
 * records which slices to re-translate. Glossary forbidden-term checks stay in the terminology guard.
 *
 * Requires at least two slices. With `CHUNKS.overlap` at zero, each source span is translated once;
 * selective slice retry avoids re-running the whole file when only boundary slices disagree.
 *
 * @param sourceChunks Original markdown slices
 * @param translatedChunks Translated slices aligned with `sourceChunks`
 *
 * @returns Drift records with slice indices for targeted LLM retries
 */
export function findChunkTerminologyConsistencyDrift(
	sourceChunks: readonly string[],
	translatedChunks: readonly string[],
) {
	if (sourceChunks.length !== translatedChunks.length || sourceChunks.length < 2) {
		return [];
	}

	const drifts: ChunkTerminologyDrift[] = [];

	for (const { rule, formsByChunk } of buildTerminologyFormsByChunk(
		sourceChunks,
		translatedChunks,
	)) {
		const allFormsLower = new Set<string>();

		for (const forms of formsByChunk.values()) {
			for (const form of forms) {
				allFormsLower.add(form.toLowerCase());
			}
		}

		if (allFormsLower.size < 2) continue;

		const conflictingForms = [
			...new Set(
				[...formsByChunk.values()].flatMap((forms) =>
					forms.filter((form) => allFormsLower.has(form.toLowerCase())),
				),
			),
		];

		const offendingChunkIndices = [...formsByChunk.keys()].sort((left, right) => left - right);
		const englishAnchor = rule.sourcePattern.source.replace(/\\b/g, "").replace(/\\/g, "");

		drifts.push({
			englishAnchor,
			conflictingForms,
			offendingChunkIndices,
			glossaryHint: rule.glossaryHint,
		});
	}

	return drifts;
}

/**
 * Builds LLM retry hints scoped to document slices that caused terminology drift.
 *
 * @param drifts Output from {@link findChunkTerminologyConsistencyDrift}
 *
 * @returns Hints merged for the translation attempt context
 */
export function buildChunkTerminologyRetryHints(drifts: readonly ChunkTerminologyDrift[]) {
	return drifts.map((drift) => {
		const sliceList = drift.offendingChunkIndices.map((index) => index + 1).join(", ");
		const forms = drift.conflictingForms.join(" vs ");
		return `DOCUMENT SLICE consistency (slices ${sliceList}): for repeated "${drift.englishAnchor}" use one form, not ${forms}. ${drift.glossaryHint}`;
	});
}
