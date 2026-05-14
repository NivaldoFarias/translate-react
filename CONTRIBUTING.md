# Contributing

MIT. Not a hosted app: forks use their own API keys and Actions config.

- Bun only (`bun install`, `bun run …`); see `engines` in [`package.json`](./package.json).
- TypeScript strict; match patterns in [`src/`](./src/).
- Tests: `bun test`; mock GitHub and LLM.
- Before push: `bun run lint`, `bun run format`.
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) (see repo rules).
- If you bump `package.json` `version`, add a matching `## [version]` section to [`CHANGELOG.md`](./CHANGELOG.md); CI enforces this.
- Docs: [`docs/WORKFLOW.md`](./docs/WORKFLOW.md) (run order, forks, pinning, releases, repo settings), [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), [`CHANGELOG.md`](./CHANGELOG.md), [`SECURITY.md`](./SECURITY.md).
- Automated PRs still need human review on locale repos. Mention this repo’s version (log line, `package.json`, or CI ref) when debugging a run.
- Shared material belongs in [`docs/`](./docs/) or the root readme.
