# translate-react

A CLI tool to automate the translation of React documentation from English to any other language using Large Language Models (LLMs).

## Overview

This project automates the translation process of React's documentation to any language. It uses the following workflow:

1. Fetching untranslated markdown files from the React docs repository
2. Managing translation state through SQLite snapshots to handle interruptions
3. Translating content using OpenRouter models with strict glossary rules
4. Creating branches and pull requests with translations
5. Tracking progress through GitHub issues
6. Managing cleanup and error recovery

## Prerequisites

- [Bun](https://bun.sh) runtime
- GitHub Personal Access Token with repo permissions
- OpenRouter API Key
- Node.js v20+
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
GITHUB_TOKEN=your_github_token                 # required
LLM_API_KEY=your_LLM_API_KEY                   # required
LLM_MODEL=gpt-4                                # required
LLM_BASE_URL=https://openrouter.ai/api/v1      # optional, defaults to openrouter.ai
REPO_OWNER=target_repo_owner                   # required
REPO_NAME=target_repo_name                     # required
ORIGINAL_REPO_OWNER=original_repo_owner        # required
NODE_ENV=development|production|test           # optional, defaults to development
BUN_ENV=development|production|test            # optional, defaults to development
TRANSLATION_ISSUE_NUMBER=123                   # optional, only used for tracking progress
GITHUB_SINCE=2024-01-01                        # optional, filters issue comments since date
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
│   ├── github/                        # GitHub API services
│   │   ├── base.service.ts            # Base GitHub service
│   │   ├── branch.service.ts          # Branch management
│   │   ├── content.service.ts         # Content and PR management
│   │   ├── repository.service.ts      # Repository operations
│   │   └── index.ts                   # Main GitHub service
│   ├── translator.service.ts          # Translation service
│   ├── database.service.ts            # Database service
│   └── snapshot.service.ts            # Snapshot service
├── utils/
│   ├── language-detector.util.ts      # Language detection utility
│   ├── content-parser.util.ts         # Content parser utility
│   ├── env.util.ts                    # Environment validation
│   └── errors.util.ts                 # Custom error handling
├── runner.ts                          # Main workflow orchestrator
└── types.d.ts                         # Type definitions

snapshots.sqlite                       # SQLite database for state persistence
```

## Architecture

### Core Services

1. **GitHub Service** (`services/github/`)

   - Modular architecture with specialized services:
     - **Base Service**: Common GitHub functionality and error handling
     - **Branch Service**: Branch lifecycle and cleanup management
     - **Content Service**: File operations and PR management
     - **Repository Service**: Repository and fork synchronization
   - Inheritance-based design for code reuse
   - Protected access modifiers for internal operations
   - Unified error handling through base service

2. **Translator Service** (`services/translator.service.ts`)

   - Interfaces with OpenAI's GPT models
   - Maintains translation glossary and rules
   - Tracks translation metrics and performance

3. **Language Detector** (`services/language-detector.service.ts`)

   - Uses `franc` for language detection
   - Determines if content needs translation
   - Calculates language confidence scores

4. **Database Service** (`services/database.service.ts`)
   - Manages persistent storage of workflow state
   - Handles snapshots for interruption recovery
   - Maintains translation history and results

### Workflow Management

1. **Runner** (`runner.ts`)

   - Orchestrates the entire translation process
   - Manages service interactions
   - Handles error recovery and reporting

2. **Branch Manager** (`services/github/branch.service.ts`)

   - Manages Git branches for translations
   - Ensures proper cleanup of temporary branches
   - Tracks active translation branches

3. **Content Parser** (`utils/content-parser.util.ts`)
   - Parses markdown content
   - Handles code blocks and special formatting
   - Maintains document structure during translation

## Features

### Translation Quality

- Enforces strict glossary rules for technical terms
- Preserves markdown formatting and structure
- Maintains code blocks and technical references
- Supports any language localization standards

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
