import { isMap, isScalar, parseDocument } from "yaml";

import { leadingNewlineRunLength } from "./artifacts";
import { MARKDOWN_REGEXES } from "./markdown.regexes";

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
 * Splits a leading YAML frontmatter block from markdown when it matches {@link MARKDOWN_REGEXES.frontmatter} at position 0.
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
	const match = MARKDOWN_REGEXES.frontmatter.exec(source);
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
 * @returns BOM prefix and inner YAML, or `null` when the block does not match {@link MARKDOWN_REGEXES.frontmatter} at the start
 *
 * @example
 * ```typescript
 * extractFrontmatterParts("---\na: b\n---\n");
 * // { bom: "", inner: "a: b" }
 * ```
 */
export function extractFrontmatterParts(fullBlock: string): { bom: string; inner: string } | null {
	const match = MARKDOWN_REGEXES.frontmatter.exec(fullBlock);
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

/**
 * Normalizes spacing between the closing frontmatter fence and the first body line.
 *
 * @param body Translated body after duplicate leading frontmatter removal
 * @param sourceBodyAfterFrontmatter When set, leading newline depth is padded to match this prefix
 *
 * @returns Body text safe to concatenate immediately after a closing `---` fence
 */
function normalizeBodyAfterFrontmatterMerge(body: string, sourceBodyAfterFrontmatter?: string) {
	if (sourceBodyAfterFrontmatter !== undefined) {
		const sourceNewlines = leadingNewlineRunLength(sourceBodyAfterFrontmatter);
		const bodyNewlines = leadingNewlineRunLength(body);
		if (sourceNewlines > bodyNewlines) {
			return "\n".repeat(sourceNewlines - bodyNewlines) + body;
		}

		return body;
	}

	const needsLeadingNewline = !body.startsWith("\n") && !body.startsWith("\r\n");
	return needsLeadingNewline ? `\n${body}` : body;
}

/**
 * Reattaches preserved YAML frontmatter to translated body output, optionally restoring the same
 * leading newline depth as the source body had after the closing fence (so blank lines before the
 * first heading are not collapsed when the model omits them).
 *
 * @param preservedBlock Full leading `---` … `---` block (rebuilt or original) to prepend
 * @param translated Model output for the body (may include a duplicate leading frontmatter block)
 * @param sourceBodyAfterFrontmatter When set, the original markdown body slice that was translated;
 * used only to compare leading newline runs against `translated` after duplicate frontmatter removal
 *
 * @returns Full document string with frontmatter plus body
 */
export function mergePreservedYamlFrontmatter(
	preservedBlock: string,
	translated: string,
	sourceBodyAfterFrontmatter?: string,
) {
	if (!preservedBlock) {
		return translated;
	}

	let body = translated;
	const duplicate = MARKDOWN_REGEXES.frontmatter.exec(body);
	if (duplicate?.index === 0) {
		body = body.slice(duplicate[0].length);
	}

	if (body.length === 0) {
		return preservedBlock;
	}

	return preservedBlock + normalizeBodyAfterFrontmatterMerge(body, sourceBodyAfterFrontmatter);
}
