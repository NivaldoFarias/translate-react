---
paths:
  - "src/app/locales/**"
  - ".github/locales.json"
---

# Locale modules

## Layout

Every registered locale, `pt-br` included, ships this file set under `src/app/locales/<lang>/`. `locale-module-layout.spec.ts` fails CI if any file is missing.

- `locale.ts`: wiring and registration only.
- `rules.ts`: terminology and style, as prompt content.
- `repairs/index.ts`, `repairs/constants.ts`, `repairs/definition.ts`: deterministic mechanical repairs.

Register a locale in `locales/registry.ts`, `repairs/registry.ts` and `.github/locales.json`. A parity spec checks the JSON against the registry, and `LocaleService` throws on an unregistered `TARGET_LANGUAGE`.

## Terminology is prompt-only

Locale terminology and style live in `rules.ts` as prompt text. When reviewers report meaning errors (calques, glossary terms, capitalization), add concrete before/after phrase guidance to `rules.ts`, kept separate from general style guidelines. Detection code for a single language (guards, parsers, regex heuristics) waits until a defect is production-validated and can't be handled by a prompt rule or a repair.

`rules.segmentSpecific` (resolved by `resolveLocaleSpecificRules()`) carries guidance for segment and frontmatter batches. Leave out full-document rules such as URL rewrites: segment extraction freezes link URLs and only sends label text.

## Mechanical repairs

- Add a repair only for a deterministic glitch observed in production output.
- Declare it in `repairs/definition.ts` with `createLocaleMechanicalRepairs()`, data in `repairs/constants.ts`, thin exports in `repairs/index.ts`.
- Scope it with `mapMarkdownProseRegions` / `mapOutsideFencedCodeBlocks` so fenced code stays untouched. `mapMarkdownProseRegions` also skips inline code and console output (`CONSOLE_OUTPUT_COMPONENTS`); prefer it when a pattern matches English text. For non-Latin scripts, build word boundaries explicitly rather than with `\b`.
- A language-agnostic defect goes in the shared `translation-output-cleanup.ts` pass instead.

## Onboarding

A new locale is ready for a fork operator after it has the full layout, the three registrations and a manual dry run. Expect operator tuning and maintainer review after the first real batch. The operator dispatches the first run: `workflow.yml` with `langs: <new-locale>` only.
