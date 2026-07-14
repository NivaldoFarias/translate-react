import { describe, expect, test } from "bun:test";

import { applyRuLocaleMechanicalRepairs } from "@/app/locales/ru/repairs";
import {
	alignTrailingNewline,
	applyMechanicalTranslationRepairs,
	cleanupFullBodyTranslation,
	cleanupSegmentSnippet,
	cleanupTranslatedContent,
	collapseDuplicatedEnUseClientLeadIn,
	isHeadingTextSegmentPath,
	normalizeHeadingMarkerSpacing,
	normalizeInlineCodeBeforePunctuationSpacing,
	normalizeInlineCodeInteriorSpacing,
	normalizeMarkdownLinkLabelSpacing,
	preserveSegmentBoundaryWhitespace,
	repairMdxSpacing,
	repairSharedDirectiveEchoArtifacts,
	rewriteMdnLinksToLocale,
	sanitizeSegmentTranslation,
	stripEchoedHeadingMarkers,
	stripEchoedUseDirectiveGuillemets,
} from "@/app/services/translator/postprocess/translation-output-cleanup";
import { TranslationFile } from "@/app/services/translator/translation-file";

function createSnippetFile(content: string) {
	return new TranslationFile(content, "test.md#s1", "src/content/test.md", "sha", undefined, "en");
}

describe("cleanupSegmentSnippet", () => {
	test("preserves trailing space before a markdown link segment", () => {
		const file = createSnippetFile("por ");
		const cleaned = cleanupSegmentSnippet("por", "por ", file);

		expect(cleaned).toBe("por ");
	});

	test("preserves leading space after inline code in a segment", () => {
		const file = createSnippetFile(" pode ");
		const cleaned = cleanupSegmentSnippet("pode", " pode ", file);

		expect(cleaned).toBe(" pode ");
	});

	test("strips LLM prefix artifacts without removing boundary whitespace", () => {
		const file = createSnippetFile("por ");
		const cleaned = cleanupSegmentSnippet("Translation:por", "por ", file);

		expect(cleaned).toBe("por ");
	});
});

describe("cleanupFullBodyTranslation", () => {
	test("trims full-body translations", () => {
		const file = createSnippetFile("  translated body  ");
		const cleaned = cleanupFullBodyTranslation("  translated body  ", file);

		expect(cleaned).toBe("translated body");
	});

	test("removes spurious space before punctuation after inline code", () => {
		const file = createSnippetFile("x");
		const cleaned = cleanupFullBodyTranslation("No modo `annotation` , onde", file);

		expect(cleaned).toBe("No modo `annotation`, onde");
	});

	test("restores trailing newline when the source document ends with one", () => {
		const file = createSnippetFile("source\n");
		const cleaned = cleanupTranslatedContent("translated body", file);

		expect(cleaned).toBe("translated body\n");
	});
});

describe("normalizeInlineCodeBeforePunctuationSpacing", () => {
	test("collapses space before comma after inline code", () => {
		expect(normalizeInlineCodeBeforePunctuationSpacing("chamar `root.unmount` , você")).toBe(
			"chamar `root.unmount`, você",
		);
	});
});

describe("preserveSegmentBoundaryWhitespace", () => {
	test("restores dropped trailing whitespace from the source segment", () => {
		expect(preserveSegmentBoundaryWhitespace("por", "por ")).toBe("por ");
	});

	test("restores dropped leading whitespace from the source segment", () => {
		expect(preserveSegmentBoundaryWhitespace("pode", " pode ")).toBe(" pode ");
	});

	test("leaves translation unchanged when boundary whitespace already matches", () => {
		expect(preserveSegmentBoundaryWhitespace("por ", "por ")).toBe("por ");
	});
});

describe("stripEchoedHeadingMarkers", () => {
	test("removes echoed markdown heading markers", () => {
		expect(stripEchoedHeadingMarkers("## Como migrar")).toBe("Como migrar");
	});

	test("leaves heading prose without echoed markers unchanged", () => {
		expect(stripEchoedHeadingMarkers("Como migrar")).toBe("Como migrar");
	});
});

describe("isHeadingTextSegmentPath", () => {
	test("matches heading text node paths", () => {
		expect(isHeadingTextSegmentPath("root/heading[2]/text[0]")).toBe(true);
		expect(isHeadingTextSegmentPath("root/paragraph[1]/text[0]")).toBe(false);
	});
});

describe("sanitizeSegmentTranslation", () => {
	test("strips echoed heading markers for heading text segments", () => {
		const file = createSnippetFile("x");
		const cleaned = sanitizeSegmentTranslation(
			"## Como migrar",
			"How to migrate",
			"root/heading[1]/text[0]",
			file,
		);

		expect(cleaned).toBe("Como migrar");
	});

	test("preserves spacing for non-heading segments", () => {
		const file = createSnippetFile("por ");
		const cleaned = sanitizeSegmentTranslation("por", "por ", "root/paragraph[1]/text[0]", file);

		expect(cleaned).toBe("por ");
	});
});

describe("repairMdxSpacing", () => {
	describe("inline code glued to prose", () => {
		test("inserts space between closing backtick and ASCII letter", () => {
			expect(repairMdxSpacing("Use `hydrateRoot`to attach React.")).toBe(
				"Use `hydrateRoot` to attach React.",
			);
		});

		test("inserts space before upper-case letter after inline code", () => {
			expect(repairMdxSpacing("chamar `render`React no root.")).toBe(
				"chamar `render` React no root.",
			);
		});

		test("inserts space before non-ASCII letter after inline code", () => {
			expect(repairMdxSpacing("ver `useState`é um hook.")).toBe("ver `useState` é um hook.");
		});

		test("inserts space before Cyrillic letter after inline code", () => {
			expect(repairMdxSpacing("модуль `App`помечает клиентский код.")).toBe(
				"модуль `App` помечает клиентский код.",
			);
		});

		test("does not treat comma-separated inline code spans as glued prose", () => {
			expect(repairMdxSpacing("`RichTextEditor`, `formatDate` и `Button`")).toBe(
				"`RichTextEditor`, `formatDate` и `Button`",
			);
		});

		test("does not insert space when already present", () => {
			expect(repairMdxSpacing("ver `useState` é um hook.")).toBe("ver `useState` é um hook.");
		});

		test("does not insert space when followed by punctuation", () => {
			expect(repairMdxSpacing("ver `useState`.")).toBe("ver `useState`.");
		});

		test("does not insert space when followed by a digit", () => {
			expect(repairMdxSpacing("use `v8`2 times")).toBe("use `v8`2 times");
		});

		test("does not alter code across a newline boundary", () => {
			expect(repairMdxSpacing("use `foo`\nbar")).toBe("use `foo`\nbar");
		});

		test("repairs multiple occurrences in one pass", () => {
			expect(repairMdxSpacing("`a`x and `b`y")).toBe("`a` x and `b` y");
		});

		test("does not match a closing backtick through prose to the next opening backtick", () => {
			const clean = "Use `useState` and `useEffect` for state and effects.";
			expect(repairMdxSpacing(clean)).toBe(clean);
		});

		test("is idempotent", () => {
			const input = "Use `hydrateRoot`to attach.";
			expect(repairMdxSpacing(repairMdxSpacing(input))).toBe(repairMdxSpacing(input));
		});
	});

	describe("prose glued to MDX slug comment opener", () => {
		test("inserts space when prose is immediately followed by slug comment", () => {
			expect(repairMdxSpacing("## Título{/*title*/}")).toBe("## Título {/*title*/}");
		});

		test("does not insert space when preceded by whitespace", () => {
			expect(repairMdxSpacing("## Título {/*title*/}")).toBe("## Título {/*title*/}");
		});

		test("does not insert space when preceded by a newline", () => {
			expect(repairMdxSpacing("## Título\n{/*title*/}")).toBe("## Título\n{/*title*/}");
		});

		test("repairs multiple occurrences in one pass", () => {
			expect(repairMdxSpacing("a{/*x*/} b{/*y*/}")).toBe("a {/*x*/} b {/*y*/}");
		});
	});

	describe("adjacent markdown links with no separator", () => {
		test("inserts space and comma between adjacent link closers", () => {
			expect(repairMdxSpacing("[A](url1)],[B](url2)")).toBe("[A](url1)], [B](url2)");
		});

		test("repairs a chain of three adjacent links", () => {
			expect(repairMdxSpacing("[A](u1)],[B](u2)],[C](u3)")).toBe("[A](u1)], [B](u2)], [C](u3)");
		});

		test("does not modify already-separated links", () => {
			expect(repairMdxSpacing("[A](u1)], [B](u2)")).toBe("[A](u1)], [B](u2)");
		});
	});

	describe("locale-word-before-link patterns are NOT auto-repaired", () => {
		test("does not insert space between 'por' and a markdown link", () => {
			expect(repairMdxSpacing("por[Link](url)")).toBe("por[Link](url)");
		});

		test("does not insert space between 'no' and a markdown link", () => {
			expect(repairMdxSpacing("no[Link](url)")).toBe("no[Link](url)");
		});

		test("does not insert space between 'e' and a markdown link", () => {
			expect(repairMdxSpacing("e[Link](url)")).toBe("e[Link](url)");
		});

		test("does not modify English 'no' before a bracket", () => {
			expect(repairMdxSpacing("there is no[known fix]")).toBe("there is no[known fix]");
		});
	});

	describe("empty and no-op inputs", () => {
		test("returns empty string unchanged", () => {
			expect(repairMdxSpacing("")).toBe("");
		});

		test("returns clean prose unchanged", () => {
			const clean = "Use `useState` and `useEffect` for state and effects.";
			expect(repairMdxSpacing(clean)).toBe(clean);
		});
	});
});

describe("normalizeInlineCodeInteriorSpacing", () => {
	test("trims leading and trailing spaces inside inline code", () => {
		expect(normalizeInlineCodeInteriorSpacing("зависимости ` formatDate` и `Button`")).toBe(
			"зависимости `formatDate` и `Button`",
		);
	});

	test("leaves already-normalized inline code unchanged", () => {
		const clean = "Use `useState` and `useEffect`.";
		expect(normalizeInlineCodeInteriorSpacing(clean)).toBe(clean);
	});
});

describe("normalizeMarkdownLinkLabelSpacing", () => {
	test("trims leading space inside markdown link labels", () => {
		expect(
			normalizeMarkdownLinkLabelSpacing(
				"работы с [ React Server Components](/reference/rsc/server-components).",
			),
		).toBe("работы с [React Server Components](/reference/rsc/server-components).");
	});
});

describe("normalizeHeadingMarkerSpacing", () => {
	test("collapses duplicated whitespace after heading markers", () => {
		expect(normalizeHeadingMarkerSpacing("##  Справка {/*reference*/}")).toBe(
			"## Справка {/*reference*/}",
		);
	});
});

describe("rewriteMdnLinksToLocale", () => {
	test("rewrites en-US MDN docs URLs to the target locale slug", () => {
		const input = "[string](https://developer.mozilla.org/en-US/docs/Glossary/String)";
		expect(rewriteMdnLinksToLocale(input, "ru")).toBe(
			"[string](https://developer.mozilla.org/ru/docs/Glossary/String)",
		);
	});

	test("leaves URLs that already use the target locale unchanged", () => {
		const input = "[string](https://developer.mozilla.org/ru/docs/Glossary/String)";
		expect(rewriteMdnLinksToLocale(input, "ru")).toBe(input);
	});
});

describe("stripEchoedUseDirectiveGuillemets", () => {
	test("removes guillemet echoes after client directive inline code", () => {
		const input = "Добавление `'use client'` «use client» в начало файла, чтобы пометить модуль.";

		expect(stripEchoedUseDirectiveGuillemets(input)).toBe(
			"Добавление `'use client'` в начало файла, чтобы пометить модуль.",
		);
	});

	test("repairs multiple echoed directives in one document", () => {
		const input =
			"`* `'use client'` «use client» должны находиться в начале.\n* Когда `'use client'` «use client», импортируется";

		expect(stripEchoedUseDirectiveGuillemets(input)).toBe(
			"`* `'use client'` должны находиться в начале.\n* Когда `'use client'`, импортируется",
		);
	});

	test("leaves legitimate guillemet prose unchanged when not echoed after inline code", () => {
		const input = "директиву «use client» в «InspirationGenerator.js».";
		expect(stripEchoedUseDirectiveGuillemets(input)).toBe(input);
	});
});

describe("collapseDuplicatedEnUseClientLeadIn", () => {
	test("collapses duplicated English lead-in before a comma", () => {
		const input = "With `'use client'` With , you can determine";

		expect(collapseDuplicatedEnUseClientLeadIn(input)).toBe(
			"With `'use client'`, you can determine",
		);
	});
});

describe("repairSharedDirectiveEchoArtifacts", () => {
	test("repairs echoed directive guillemets and English lead-in duplicates", () => {
		const input = [
			"Add `'use client'` «use client» at the top.",
			"With `'use client'` With , you can determine",
		].join("\n");

		expect(repairSharedDirectiveEchoArtifacts(input)).toBe(
			["Add `'use client'` at the top.", "With `'use client'`, you can determine"].join("\n"),
		);
	});
});

describe("applyMechanicalTranslationRepairs", () => {
	test("repairs spacing and MDN locale regressions from segment reinsertion", () => {
		const input =
			"##  Справка\n\n`App`помечает [ React](https://developer.mozilla.org/en-US/docs/Web/API).";

		expect(applyMechanicalTranslationRepairs(input, { mdnLocaleSlug: "ru" })).toBe(
			"## Справка\n\n`App` помечает [React](https://developer.mozilla.org/ru/docs/Web/API).",
		);
	});

	test("normalizes inline code after comma-separated spans without reintroducing interior spaces", () => {
		const input = "Как зависимости `RichTextEditor`, ` formatDate` и `Button` также";

		expect(applyMechanicalTranslationRepairs(input)).toBe(
			"Как зависимости `RichTextEditor`, `formatDate` и `Button` также",
		);
	});

	test("repairs directive echo artifacts and inline code punctuation spacing together", () => {
		const input = "С помощью `'use client'` С помощью , вы можете `render` , когда";

		expect(
			applyMechanicalTranslationRepairs(input, {
				mdnLocaleSlug: "ru",
				localeRepairs: applyRuLocaleMechanicalRepairs,
			}),
		).toBe("С помощью `'use client'`, вы можете `render`, когда");
	});
});

describe("alignTrailingNewline", () => {
	test("adds trailing newline when the reference document has one", () => {
		expect(alignTrailingNewline("translated", "source\n")).toBe("translated\n");
	});

	test("removes trailing newline when the reference document does not have one", () => {
		expect(alignTrailingNewline("translated\n", "source")).toBe("translated");
	});
});
