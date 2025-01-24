# translate-react

A CLI tool to automate the translation of React documentation from English to Brazilian Portuguese (pt-BR) using OpenAI's GPT models.

## Overview

This project aims to accelerate the translation process of React's documentation to Brazilian Portuguese, which is currently _(2025-01-17)_ only 42% complete. It automates the workflow of:

1. Fetching untranslated markdown files from the React docs repository
2. Managing translation state through snapshots to handle interruptions
3. Translating content using OpenAI's GPT models with strict glossary rules
4. Creating branches and pull requests with translations
5. Tracking progress through GitHub issues
6. Managing cleanup and error recovery

## Prerequisites

- [Bun](https://bun.sh) runtime
- GitHub Personal Access Token with repo permissions
- OpenAI API Key
- Node.js v18+

## Setup

1. Clone the repository:

```bash
git clone https://github.com/NivaldoFarias/translate-react.git
cd translate-react
```

2. Install dependencies:

```bash
bun install
```

3. Create a `.env` file with the following variables:

```env
GITHUB_TOKEN=your_github_token                  # required
OPENAI_API_KEY=your_openai_api_key              # required
OPENAI_MODEL=gpt-4                              # required
REPO_OWNER=target_repo_owner                    # required
REPO_NAME=target_repo_name                      # required
ORIGINAL_REPO_OWNER=original_repo_owner         # required
NODE_ENV=development|production|test            # optional, defaults to development
BUN_ENV=development|production|test             # optional, defaults to development
TRANSLATION_ISSUE_NUMBER=123                    # required for production
GITHUB_SINCE=2024-01-01                         # optional, filters issue comments since date
```

> [!NOTE]
> These variables are validated at runtime using Zod. Refer to the `src/utils/env.ts` file for the validation schema.

## Usage

### Development

Development mode with watch:

```bash
bun run dev
```

### Production

```bash
bun run build
bun run start
```

Or run directly using Bun:

```bash
bun run index.ts
```

## Project Structure

```
src/
├── services/
│   ├── github.ts             # GitHub API integration
│   ├── translator.ts         # OpenAI translation service
│   ├── language-detector.ts  # Language detection service
│   ├── branch-manager.ts     # Git branch management
│   └── snapshot-manager.ts   # State persistence
├── utils/
│   ├── logger.ts             # Console logging with spinners
│   ├── env.ts                # Environment validation
│   └── errors.ts             # Custom error handling
├── runner.ts                 # Main workflow orchestrator
└── types.d.ts                # Type definitions

.snapshots/                   # Persisted workflow state
```

## Features

- **Snapshot Management**: Persists workflow state to handle interruptions and failures
- **Batch Processing**: Processes files in configurable batches with progress tracking
- **Error Recovery**: Maintains state and allows resuming from failures
- **GitHub Integration**:
  - Creates branches per file
  - Submits PRs with translations
  - Comments progress on tracking issues
  - Handles cleanup of temporary branches
- **Translation Quality**:
  - Enforces strict glossary rules
  - Preserves markdown formatting
  - Maintains code blocks and technical terms
  - Supports Brazilian Portuguese localization standards

## Contributing

This project is open for contributions. Feel free to open issues, fork the project and submit pull requests for improvements.
