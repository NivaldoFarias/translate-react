import { isMap, isScalar, parseDocument } from "yaml";

import { REGEXES } from "./managers/managers.constants";

/**
 * Result of splitting a markdown document into a leading YAML frontmatter block and the rest.
 */
export interface LeadingYamlFrontmatterSplit {
	/** Matched `---` … `---` prefix when present at document start; otherwise empty */
	readonly block: string;
	/** Document text after the frontmatter block, or the full `source` when none was split */
	readonly rest: string;
}

/**
 * Splits a leading YAML frontmatter block from markdown when it matches {@link REGEXES.frontmatter} at position 0.
 *
 * @param source Full markdown source (possibly masked) used as the translation input
 *
 * @returns The matched block and remainder; `rest` is the full `source` when no leading block exists or the body after `---` would be empty
 *
 * @example
 * ```typescript
 * const { block, rest } = splitLeadingYamlFrontmatter("---\ntitle: x\n---\n\n# Hi");
 * // block: "---\ntitle: x\n---"
 * // rest: "\n\n# Hi"
 * ```
 */
export function splitLeadingYamlFrontmatter(source: string): LeadingYamlFrontmatterSplit {
	const match = REGEXES.frontmatter.exec(source);
	if (match?.index !== 0) {
		return { block: "", rest: source };
	}

	const block = match[0];
	const rest = source.slice(block.length);
	if (rest.length === 0) {
		return { block: "", rest: source };
	}

	return { block, rest };
}

/**
 * Extracts the inner YAML payload and optional BOM from a full leading frontmatter block.
 *
 * @param fullBlock Markdown starting with a frontmatter fence (e.g. `---\n...\n---`)
 *
 * @returns BOM prefix and inner YAML, or `null` when the block does not match {@link REGEXES.frontmatter} at the start
 *
 * @example
 * ```typescript
 * extractFrontmatterParts("---\na: b\n---\n");
 * // { bom: "", inner: "a: b" }
 * ```
 */
export function extractFrontmatterParts(fullBlock: string): { bom: string; inner: string } | null {
	const match = REGEXES.frontmatter.exec(fullBlock);
	const inner = match?.groups?.["content"];
	if (inner === undefined) {
		return null;
	}
	const bom = fullBlock.startsWith("\uFEFF") ? "\uFEFF" : "";
	return { bom, inner };
}

/**
 * Builds a full frontmatter fence from inner YAML and an optional BOM.
 *
 * @param bom Leading UTF-8 BOM when the source document had one
 * @param innerYaml YAML lines between the opening and closing `---` delimiters (no fences)
 *
 * @returns A markdown prefix starting with `---` and ending with `---`
 *
 * @example
 * ```typescript
 * buildFrontmatterBlock("", "title: X");
 * // "---\ntitle: X\n---"
 * ```
 */
export function buildFrontmatterBlock(bom: string, innerYaml: string): string {
	const normalized = innerYaml.replace(/\r\n/g, "\n");
	const body = normalized.endsWith("\n") ? normalized : `${normalized}\n`;

	return `${bom}---\n${body}---`;
}

/**
 * Returns the trimmed `title` scalar from inner frontmatter YAML when the document root is a mapping
 * and `title` resolves to a non-empty string.
 *
 * @param innerYaml YAML between the opening and closing `---` delimiters (no fences)
 *
 * @returns The trimmed title, or `undefined` when absent, not a string scalar, parse errors occur, or the root is not a map
 *
 * @example
 * ```typescript
 * extractTitleScalarFromInnerYaml(`title: "a: b"\nother: 1`);
 * // ^? "a: b"
 * ```
 */
export function extractTitleScalarFromInnerYaml(innerYaml: string): string | undefined {
	let doc;
	try {
		doc = parseDocument(innerYaml);
	} catch {
		return undefined;
	}

	if (doc.errors.length > 0) return undefined;
	if (!isMap(doc.contents)) return undefined;

	const title = doc.get("title");
	if (typeof title !== "string") return undefined;

	const trimmed = title.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Collects top-level keys from inner frontmatter YAML when the document root is a mapping.
 *
 * Used to compare source vs translated metadata shape without treating `:` inside quoted values as key separators.
 *
 * @param innerYaml YAML between the opening and closing `---` delimiters (no fences)
 *
 * @returns A set of top-level key names; empty when the YAML is invalid, has parse errors, or the root is not a plain mapping
 *
 * @example
 * ```typescript
 * collectTopLevelKeysFromInnerYaml(`title: "x"\ndescription: "a: b"`);
 * // ^? Set { "title", "description" }
 * ```
 */
export function collectTopLevelKeysFromInnerYaml(innerYaml: string): Set<string> {
	let doc;
	try {
		doc = parseDocument(innerYaml);
	} catch {
		return new Set();
	}

	if (doc.errors.length > 0) return new Set();
	const root = doc.contents;
	if (!isMap(root)) return new Set();

	const keys = new Set<string>();
	for (const pair of root.items) {
		const keyNode = pair.key;
		if (!isScalar(keyNode)) continue;
		const raw = keyNode.value;
		if (typeof raw === "string") {
			keys.add(raw);
		} else if (typeof raw === "number" && Number.isFinite(raw)) {
			keys.add(String(raw));
		}
	}

	return keys;
}

export function mergePreservedYamlFrontmatter(preservedBlock: string, translated: string) {
	if (!preservedBlock) {
		return translated;
	}

	let body = translated;
	const duplicate = REGEXES.frontmatter.exec(body);
	if (duplicate?.index === 0) {
		body = body.slice(duplicate[0].length);
	}

	if (body.length === 0) {
		return preservedBlock;
	}

	const needsLeadingNewline = !body.startsWith("\n") && !body.startsWith("\r\n");
	const normalizedBody = needsLeadingNewline ? `\n${body}` : body;

	return preservedBlock + normalizedBody;
}
