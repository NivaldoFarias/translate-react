/** One line-level search-and-replace pair from a maintainer `diff` block or suggestion */
export interface MechanicalLineReplacement {
	/** Exact substring to remove from the translated file */
	readonly search: string;

	/** Replacement text */
	readonly replace: string;
}

/**
 * Parses unified-diff hunks and suggestion blocks from maintainer comment bodies.
 *
 * @param commentBodies Maintainer issue comment markdown bodies
 *
 * @returns De-duplicated line replacements in comment order
 */
export function parseMechanicalLineReplacements(
	commentBodies: readonly string[],
): MechanicalLineReplacement[] {
	const replacements: MechanicalLineReplacement[] = [];
	const seen = new Set<string>();

	for (const body of commentBodies) {
		for (const replacement of [
			...parseDiffBlockReplacements(body),
			...parseSuggestionBlockReplacements(body),
		]) {
			const key = `${replacement.search}\0${replacement.replace}`;

			if (seen.has(key)) {
				continue;
			}

			seen.add(key);
			replacements.push(replacement);
		}
	}

	return replacements;
}

/**
 * Applies line replacements to translated content when each `search` occurs exactly once.
 *
 * @param content Current translated markdown on the fork branch
 * @param replacements Parsed mechanical replacements
 *
 * @returns Updated content and how many replacements were applied
 */
export function applyMechanicalLineReplacements(
	content: string,
	replacements: readonly MechanicalLineReplacement[],
): { content: string; appliedCount: number } {
	let updated = content;
	let appliedCount = 0;

	for (const { search, replace } of replacements) {
		if (!search.length || search === replace || !updated.includes(search)) {
			continue;
		}

		const firstIndex = updated.indexOf(search);

		if (updated.includes(search, firstIndex + 1)) {
			continue;
		}

		updated = `${updated.slice(0, firstIndex)}${replace}${updated.slice(firstIndex + search.length)}`;
		appliedCount++;
	}

	return { content: updated, appliedCount };
}

/**
 * Parses diff-fenced blocks in maintainer comments into line replacements.
 *
 * @param body Maintainer comment markdown
 *
 * @returns Line replacements extracted from diff fences
 */
function parseDiffBlockReplacements(body: string): MechanicalLineReplacement[] {
	const replacements: MechanicalLineReplacement[] = [];
	const diffBlockPattern = /```diff\n([\s\S]*?)```/g;

	for (const match of body.matchAll(diffBlockPattern)) {
		const block = match[1] ?? "";
		const lines = block.split("\n");

		for (let index = 0; index < lines.length; index++) {
			const line = lines[index] ?? "";

			if (!line.startsWith("-") || line.startsWith("---")) {
				continue;
			}

			const nextLine = lines[index + 1] ?? "";

			if (!nextLine.startsWith("+")) {
				continue;
			}

			replacements.push({
				search: line.slice(1),
				replace: nextLine.slice(1),
			});
			index++;
		}
	}

	return replacements;
}

/**
 * Parses maintainer before/after code blocks into one block replacement.
 *
 * @param body Maintainer comment markdown
 *
 * @returns A single block replacement when both excerpts are present
 */
function parseSuggestionBlockReplacements(body: string): MechanicalLineReplacement[] {
	const buggyMatch = /\*\*Traduzido[^*]*\*\*:?\s*```[^\n]*\n([\s\S]*?)```/.exec(body);
	const fixMatch = /Sugestão de correção:\s*```[^\n]*\n([\s\S]*?)```/.exec(body);

	if (!buggyMatch?.[1] || !fixMatch?.[1]) {
		return [];
	}

	return [
		{
			search: buggyMatch[1].trim(),
			replace: fixMatch[1].trim(),
		},
	];
}
