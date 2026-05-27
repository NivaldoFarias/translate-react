# Project Structure

Layout of the `translate-react` repository. For behavior and call order, see [WORKFLOW.md](./WORKFLOW.md) and [ARCHITECTURE.md](./ARCHITECTURE.md).

## Source tree

```plaintext
src/
├── app/                    # translation CLI
│   ├── main.ts
│   ├── composition.ts
│   ├── global.ts
│   ├── schemas/env.schema.ts
│   ├── constants/
│   ├── clients/
│   ├── services/
│   │   ├── runner/workflow/
│   │   ├── translator/
│   │   ├── github/types.ts
│   │   └── …
│   ├── locales/types.ts
│   └── utils/common.util.ts
├── ci/                     # GitHub Actions helpers
│   ├── actions/            # poll-upstream, resolve-matrix
│   ├── schemas/env.schema.ts
│   ├── services/upstream/
│   └── utils/
└── shared/                 # errors, logger, bare Octokit, shared Zod
    ├── schemas/
    ├── constants/
    ├── clients/octokit/
    └── utils/
```

## Import rules

- **`github/`** and **`locales/`** use `@/app/services/github/types` and `@/app/locales/types`. They must not import `@/app/services/runner/`.
- **`ci/**`** must not import `app/\*\*` runner/composition.
- **`app/**`** must not import `ci/\*\*`.
- **`shared/**`** must not import `app/**`or`ci/**`.
- New singletons belong in [`composition.ts`](../src/app/composition.ts).

## Tests

`tests/` mirrors `src/` where practical. CI specs: `tests/ci/schemas/`, `tests/ci/services/upstream/`. Fixtures: `tests/fixtures/md/`.

## Commands

| Task       | Command              |
| ---------- | -------------------- |
| Run        | `bun run start`      |
| Dev        | `bun run dev`        |
| Test       | `bun run test`       |
| Type check | `bun run type-check` |
| Lint       | `bun run lint`       |
