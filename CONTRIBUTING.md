# Contributing

MIT. Not a hosted app: forks use their own API keys and Actions config.

- Bun only (`bun install`, `bun run …`); see `engines` in [`package.json`](./package.json).
- TypeScript strict; match patterns in [`src/`](./src/).
- Layout and services: [Wiki: Codebase](https://github.com/NivaldoFarias/translate-react/wiki/Codebase); run order: [Wiki: Workflow](https://github.com/NivaldoFarias/translate-react/wiki/Workflow). App wiring: [`src/app/composition.ts`](./src/app/composition.ts).
- Tests: `bun test`; mirror `src/` paths under `tests/`; mock GitHub and LLM.
- Before push: `bun run lint`, `bun run format`.
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) (see repo rules).
- If you bump `package.json` `version`, add a matching `## [version]` section to [`CHANGELOG.md`](./CHANGELOG.md); CI enforces this.
- Docs: [Wiki](https://github.com/NivaldoFarias/translate-react/wiki) (drafts in `.cursor/wiki/`). [`CHANGELOG.md`](./CHANGELOG.md), [`SECURITY.md`](./SECURITY.md) stay in the repo.
- Automated PRs still need human review on locale repos. Mention this repo’s version when debugging a run.
