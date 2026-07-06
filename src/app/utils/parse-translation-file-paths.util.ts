/**
 * Parses comma-separated repository paths from CLI or environment input.
 *
 * @param raw Comma-separated paths or `undefined` when unset
 *
 * @returns Deduplicated, trimmed paths in input order
 */
export function parseTranslationFilePaths(raw: string | undefined) {
	if (!raw?.trim()) {
		return [];
	}

	const seen = new Set<string>();
	const paths: string[] = [];

	for (const segment of raw.split(",")) {
		const path = segment.trim();

		if (!path || seen.has(path)) {
			continue;
		}

		seen.add(path);
		paths.push(path);
	}

	return paths;
}

/**
 * Merges translation path sources into one deduplicated list.
 *
 * @param sources Raw comma-separated path strings from CLI flags or environment
 *
 * @returns Combined paths in first-seen order
 */
export function collectTranslationFilePaths(...sources: (string | undefined)[]) {
	const paths: string[] = [];
	const seen = new Set<string>();

	for (const source of sources) {
		for (const path of parseTranslationFilePaths(source)) {
			if (seen.has(path)) {
				continue;
			}

			seen.add(path);
			paths.push(path);
		}
	}

	return paths;
}
