/** How a document region is handled during segment extraction */
export type SegmentKind = "translate" | "preserve" | "policy";

/** Optional context attached to translatable segments for future batching */
export interface SegmentContext {
	/** Nearest heading text when the segment sits under a heading */
	readonly heading?: string;
	/** Fence language tag when the segment is inside a code block */
	readonly fenceLang?: string;
	/** Policy rule label when the segment is policy-classified */
	readonly rule?: string;
}

/** A single extractable region with source offsets for byte-stable reinsertion */
export interface TranslatableSegment {
	/** Stable segment identifier used in LLM payloads and reinsertion */
	readonly id: string;
	/** mdast path string locating the segment in the document */
	readonly path: string;
	/** Whether the segment is translated, preserved verbatim, or policy-handled */
	readonly kind: SegmentKind;
	/** Source markdown substring for this segment */
	readonly sourceText: string;
	/** Inclusive start byte offset in the document body */
	readonly start: number;
	/** Exclusive end byte offset in the document body */
	readonly end: number;
	/** Optional heading, fence, or policy metadata for prompting */
	readonly context?: SegmentContext;
}

/** Result of walking a markdown body (no frontmatter) for translatable regions */
export interface BodySegmentExtractionResult {
	/** Extracted translatable segments from the body */
	readonly segments: readonly TranslatableSegment[];
	/** Non-fatal parser warnings collected during extraction */
	readonly parseWarnings: readonly string[];
}

/** Result of walking a markdown document for translatable regions */
export interface SegmentExtractionResult {
	/** Extracted translatable segments from the full document */
	readonly segments: readonly TranslatableSegment[];
	/** Raw YAML frontmatter block, including delimiters */
	readonly frontmatterBlock: string;
	/** Markdown body without frontmatter */
	readonly body: string;
	/** Non-fatal parser warnings collected during extraction */
	readonly parseWarnings: readonly string[];
	/** Parser toolchain identifier for diagnostics */
	readonly tooling: "remark-mdx";
}

/** Map of segment id to translated text for reinsertion */
export type SegmentTranslationMap = Readonly<Record<string, string>>;
