# translate-react

A CLI tool to automate the translation of React documentation from English to Brazilian Portuguese (pt-BR) using OpenAI's GPT models.

## Overview

This project aims to accelerate the translation process of React's documentation to Brazilian Portuguese, which is currently _(2025-01-17)_ only 42% complete. It automates the workflow of:

1. Fetching untranslated markdown files from the React docs repository
2. Managing translation state through SQLite snapshots to handle interruptions
3. Translating content using OpenAI's GPT models with strict glossary rules
4. Creating branches and pull requests with translations
5. Tracking progress through GitHub issues
6. Managing cleanup and error recovery

## Prerequisites

- [Bun](https://bun.sh) runtime
- GitHub Personal Access Token with repo permissions
- OpenAI API Key
- Node.js v18+
- SQLite3

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
LLM_API_KEY=your_LLM_API_KEY                   # required
LLM_MODEL=gpt-4                                # required
REPO_OWNER=target_repo_owner                   # required
REPO_NAME=target_repo_name                     # required
ORIGINAL_REPO_OWNER=original_repo_owner        # required
NODE_ENV=development|production|test           # optional, defaults to development
BUN_ENV=development|production|test            # optional, defaults to development
TRANSLATION_ISSUE_NUMBER=123                   # required for production
GITHUB_SINCE=2024-01-01                        # optional, filters issue comments since date
TARGET_LANGUAGE=pt                             # required, target language code
SOURCE_LANGUAGE=en                             # required, source language code
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
│   ├── language-detector.ts  # Language detection using franc
│   ├── branch-manager.ts     # Git branch management
│   ├── database.ts           # SQLite state persistence
│   └── snapshot-manager.ts   # Workflow state management
├── utils/
│   ├── content-parser.ts     # Markdown content parsing
│   ├── env.ts                # Environment validation
│   └── errors.ts             # Custom error handling
├── runner.ts                 # Main workflow orchestrator
└── types.d.ts                # Type definitions

snapshots.sqlite              # SQLite database for state persistence
```

## Architecture

### Core Services

1. **GitHub Service** (`services/github.ts`)

   - Manages all GitHub API interactions
   - Handles repository access, branch creation, and PR management
   - Integrates with branch manager for version control

2. **Translator Service** (`services/translator.ts`)

   - Interfaces with OpenAI's GPT models
   - Maintains translation glossary and rules
   - Tracks translation metrics and performance

3. **Language Detector** (`services/language-detector.ts`)

   - Uses `franc` for language detection
   - Determines if content needs translation
   - Calculates language confidence scores

4. **Database Service** (`services/database.ts`)
   - Manages persistent storage of workflow state
   - Handles snapshots for interruption recovery
   - Maintains translation history and results

### Workflow Management

1. **Runner** (`runner.ts`)

   - Orchestrates the entire translation process
   - Manages service interactions
   - Handles error recovery and reporting

2. **Branch Manager** (`services/branch-manager.ts`)

   - Manages Git branches for translations
   - Ensures proper cleanup of temporary branches
   - Tracks active translation branches

3. **Content Parser** (`utils/content-parser.ts`)
   - Parses markdown content
   - Handles code blocks and special formatting
   - Maintains document structure during translation

## Features

### Translation Quality

- Enforces strict glossary rules for technical terms
- Preserves markdown formatting and structure
- Maintains code blocks and technical references
- Supports Brazilian Portuguese localization standards

### State Management

- SQLite-based snapshot system
- Interruption recovery
- Progress tracking
- Error state persistence

### Process Management

- Batch processing with configurable sizes
- Progress tracking with CLI spinners
- Detailed error reporting
- Performance metrics tracking

### GitHub Integration

- Branch per file strategy
- Automated PR creation
- Issue progress tracking
- Branch cleanup management

### Error Handling

- Custom error types for different scenarios
- Graceful failure recovery
- Detailed error context
- Cleanup on failure

## Contributing

This project is open for contributions. Feel free to open issues, fork the project and submit pull requests for improvements.

### Development Guidelines

1. All code is written in TypeScript
2. Use Bun as the runtime
3. Follow the established error handling patterns
4. Maintain comprehensive JSDoc documentation
5. Use conventional commits for version control

## License

MIT License - see LICENSE file for details
