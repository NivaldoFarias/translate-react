/**
 * Integration touchpoint analysis for issue #57 spike close-out.
 *
 * Documents what would change if the runner adopted segment-first translation.
 */
export const SEGMENT_INTEGRATION_ANALYSIS = {
	failureModes: [
		"JSX prop string literals on MDX components (policy table required before translate)",
		"Raw HTML blocks and MDX flow expressions (`{value}`) must stay frozen",
		"GFM tables and admonitions: cell prose translatable, structure frozen",
		"Locale-specific MDN href rewrites: translate link labels only, not URLs",
		"remark stringify not used for reinsert; offset splice avoids whitespace drift",
		"MDX plugin version drift vs react.dev upstream may change node shapes",
		"Fence comment sub-segments need TypeScript parse success on non-JS fences",
		"Duplicate prose requires path+ordinal ids (S8) to avoid reinsert collisions",
	],
	touchpoints: {
		chunksManager:
			"Replace blind MarkdownTextSplitter with segment-batch token budgeting; each batch carries heading context metadata.",
		maintainerFeedback:
			"Full-file prompt injection remains for MVP; scoped re-translate by segment id is a deferred tier.",
		prMetrics:
			"Progress comments could report translatable char ratio vs full body; segment count is a new debug metric.",
		guards:
			"Structural guards on frozen regions become redundant; contentRatio and nonEmptyContent still apply to segment output quality.",
		translatorService:
			"Hybrid MVP: prose segments via AST behind a flag, fall back to current body path on parse warnings or policy nodes.",
		verbatimMask:
			"maskLargeVerbatimFences overlaps partially; segment freeze generalizes the placeholder pattern.",
	},
	recommendation: {
		decision: "hybrid" as const,
		mvpScope:
			"Prose-only mdast text nodes + link labels + frontmatter description; freeze all fences and JSX; feature flag; no maintainer scoped re-translate.",
		tShirtSize: "L" as const,
		effortNotes: [
			"Segment extractor + offset reinsert: proven on fixtures (M)",
			"TranslatorService hybrid wiring + flag + segment batch LLM client (L)",
			"Policy table for MDX attrs and fence comments (M)",
			"Production soak on pt-br/ru poll failures (M)",
		],
		riskNotes: [
			"MDX version alignment with react.dev",
			"Parse warnings on edge pages require fallback to full-body path",
			"contentRatio may need per-segment bounds instead of document-level",
		],
		deferTriggers: [
			"Identity round-trip fails on >5% of production sample",
			"Parse failure rate >10% without safe fallback",
		],
	},
} as const;
