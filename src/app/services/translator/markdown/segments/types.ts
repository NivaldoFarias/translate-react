/** How a document region is handled during segment extraction */
export type SegmentKind = "translate" | "preserve" | "policy";

/** Optional context attached to translatable segments for future batching */
export interface SegmentContext {
	readonly heading?: string;
	readonly fenceLang?: string;
	readonly rule?: string;
}

/** A single extractable region with source offsets for byte-stable reinsertion */
export interface TranslatableSegment {
	readonly id: string;
	readonly path: string;
	readonly kind: SegmentKind;
	readonly sourceText: string;
	readonly start: number;
	readonly end: number;
	readonly context?: SegmentContext;
}

/** Result of walking a markdown body (no frontmatter) for translatable regions */
export interface BodySegmentExtractionResult {
	readonly segments: readonly TranslatableSegment[];
	readonly parseWarnings: readonly string[];
}

/** Result of walking a markdown document for translatable regions */
export interface SegmentExtractionResult {
	readonly segments: readonly TranslatableSegment[];
	readonly frontmatterBlock: string;
	readonly body: string;
	readonly parseWarnings: readonly string[];
	readonly tooling: "remark-mdx";
}

/** Map of segment id to translated text for reinsertion */
export type SegmentTranslationMap = Readonly<Record<string, string>>;
