---
description: LLM-optimized instructions for development assistance
applyTo: "**"
---

[global copilot instructions](/opt/copilot/copilot.instructions.md)

# Workspace Development Context

Auxiliary files to refer to for more context:

- [Project's `package.json` file](../package.json): to contextualize on the project's scripts, dependencies, and metadata.

## Instruction Files Structure Standard

Instruction files in this project follow a hybrid rule structure format optimized.

### Rule Format Types

#### Simple Rules (Tier 1)

```markdown
### <Rule Title> [P0/P1/P2]

<Concise rule description with MUST/SHOULD/AVOID/NEVER directives>
```

#### Complex Rules (Tier 2 - SOAP-like Structure)

```markdown
### <Rule Title> [P0/P1/P2]

- **WHEN**: [Context/Conditions when this rule applies]
- **WHAT**: [Specific requirement/action to take]
- **WHY**: [Rationale/reasoning behind the rule]
- **HOW**: [Implementation examples/templates]
  - [Optional sub-points for clarity]
- **EXCEPT**: [Optional exceptions]
```

### Priority Levels for AI Processing

To help automated agents _(like Copilot)_ focus on the most important rules first, each rule is suffixed with a priority tag:

- **[P0] Critical**: MUST follow. These are essential for correctness, preventing issues, or enabling tooling that would otherwise fail. Models should prioritize satisfying P0 rules first.
- **[P1] High**: SHOULD follow. Important for maintainability, clarity, and automated parsing. Satisfy P1 after P0 rules.
- **[P2] Medium/Low**: NICE to have. Helpful guidelines and stylistic preferences; satisfy these last.

This standardized structure ensures consistent rule application across all development areas while enabling AI assistants to prioritize critical requirements appropriately.

## Development Environment [P0]

### Package Manager & Runtime [P0]

CRITICAL: This project uses Bun as both package manager and runtime, NOT npm/yarn/pnpm. ALWAYS use `bun` commands and the `bun.lock` file to ensure reproducible installs and the expected runtime behavior.

Common Bun commands:

| Script               | Command             | Description                                                 |
| -------------------- | ------------------- | ----------------------------------------------------------- |
| Install Dependencies | `bun install`       | Install all dependencies from `bun.lock` and `package.json` |
| Run Script           | `bun run <script>`  | Run any defined script in `package.json`                    |
| Add Dependency       | `bun add <package>` | Add a new dependency and update `bun.lock`                  |

### Essential Package Scripts [P0]

The project defines several npm-style scripts in `package.json`. Use `bun run <script>` to execute them (or `bun <script>` when Bun exposes the script directly).

#### Development Workflow

| Script      | Command              | Description                                         |
| ----------- | -------------------- | --------------------------------------------------- |
| Development | `bun run dev`        | Start the app in watch/dev mode (uses `--watch`)    |
| Start       | `bun run start`      | Start the application (production/run mode)         |
| Linting     | `bun run lint`       | Run ESLint across the codebase                      |
| Auto-fix    | `bun run lint:fix`   | Run ESLint with `--fix` to automatically fix issues |
| Formatting  | `bun run format`     | Format code with Prettier                           |
| Type Check  | `bun run type-check` | Run TypeScript type checking (`tsc`)                |

> [!NOTE]
>
> - use `bun install` instead of other package manager commands to avoid lockfile drift.
> - When adding or removing dependencies, use `bun add` / `bun remove` so `bun.lock` stays accurate.
> - For local development use the `dev` script; for CI and production builds, run `type-check` and `lint` as part of pipelines.

## LLM Interaction Guidelines

### Multi-Task Management [P0]

For prompts containing multiple separate tasks, especially complex ones:

1. **Sequential Processing**: Complete ONE task fully before proceeding to the next
2. **Explicit Confirmation**: Only proceed to next task AFTER user explicitly says "continue", "proceed", or similar clear command
3. **Clear Boundaries**: Clearly describe what was accomplished and pause for confirmation before moving to next task
4. **No Assumptions**: Never assume user wants to proceed to next task automatically
5. **Complex Task Priority**: MUST prioritize focusing on one complex task at a time, providing complete summary before requesting permission to continue

This prevents token waste on unintended work and ensures controlled, focused development.

### Prioritize Atomic Changes [P1]

When suggesting code changes, ALWAYS prioritize small, focused, atomic changes over large, sweeping modifications. This approach offers several benefits:

- **Small, Focused Changes**: Prefer atomic commits and changes over large modifications
- **Token Efficiency**: Smaller changes require fewer tokens for context and processing
- **Reduced Risk**: Atomic changes are easier to review, test, and debug
- **Better Granularity**: Aligns with assessment requirement for commit granularity
- **Cost Control**: Helps control LLM API costs by reducing context window usage

### When to Make Larger Changes [Only When Necessary] [P1]

Larger, more comprehensive changes should only be suggested in specific scenarios:

- Only when logically inseparable (e.g., renaming across multiple files)
- When user explicitly requests comprehensive refactoring
- For initial project setup or major architectural decisions
- When addressing critical bugs that span multiple components
