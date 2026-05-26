# Project Structure

Layout of the `translate-react` repository. For behavior and call order, see [WORKFLOW.md](./WORKFLOW.md) and [ARCHITECTURE.md](./ARCHITECTURE.md).

## Source tree

```plaintext
src/
├── main.ts                 # CLI entry
├── composition.ts          # wires service singletons (import from here in app code)
├── domain/workflow/        # shared PR/tree/workflow types (not runner-specific)
├── clients/                # Octokit, OpenAI client, rate-limit queue
├── errors/
├── locales/                # PR/issue copy per target language
├── services/
│   ├── runner/workflow/    # discovery, batch translate, PR manager
│   ├── translator/
│   │   ├── chunking/       # ChunksManager, token budgets
│   │   ├── llm/            # TranslationLlmClient, prompts
│   │   ├── markdown/       # frontmatter, artifacts, regexes
│   │   ├── pipeline/       # validation retry loop
│   │   ├── postprocess/
│   │   └── validation/     # post-translation guards
│   ├── github/
│   ├── language-detector/
│   ├── comment-builder/
│   ├── locale/
│   └── cache/
└── utils/                  # env, logger, constants; markdown-verbatim-fences stays here
```

## Import rules

- **`github/`** and **`locales/`** use `@/domain/workflow/` for shared workflow types. They must not import `@/services/runner/`.
- **New singletons** belong in [`composition.ts`](../src/composition.ts), not at the bottom of individual service files.
- Prefer `@/services/<name>/` or `@/domain/workflow/` over deep relative paths across packages.

## Tests

`tests/` mirrors `src/` where practical (e.g. `tests/services/translator/chunking/`). Shared fixtures: `tests/fixtures/md/`. Mocks: `tests/mocks/`.

## Commands

| Task       | Command                      |
| ---------- | ---------------------------- |
| Run        | `bun run start`              |
| Dev        | `bun run dev`                |
| Test       | `bun run test`               |
| Type check | `bun run type-check`         |
| Lint       | `bun run lint`               |
| LLM smoke  | `bun run smoke:llm-workflow` |
