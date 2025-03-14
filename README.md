# translate-react

A CLI tool to automate the translation of React documentation from English to any other language using Large Language Models (LLMs).

## Overview

This project automates the translation process of React's documentation to any language. It uses the following workflow:

1. Verifying GitHub token permissions and synchronizing fork with upstream
2. Managing translation state through SQLite snapshots for interruption recovery
3. Fetching repository tree and identifying files for translation
4. Processing files in batches with real-time progress tracking
5. Translating content using OpenAI models with strict glossary rules
6. Creating branches and pull requests with translations
7. Tracking progress through GitHub issues
8. Managing cleanup and error recovery

## Prerequisites

- [Bun](https://bun.sh) runtime
- GitHub Personal Access Token with repo permissions
- OpenAI API Key
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
OPENAI_API_KEY=your_openai_api_key             # required
OPENAI_BASE_URL=https://api.openai.com/v1      # optional, defaults to OpenAI API
LLM_MODEL=gpt-4                                # required
REPO_FORK_OWNER=target_fork_owner              # required
REPO_FORK_NAME=target_fork_name                # required
REPO_UPSTREAM_OWNER=upstream_owner             # required
NODE_ENV=development|production|test           # optional, defaults to development
BUN_ENV=development|production|test            # optional, defaults to development
PROGRESS_ISSUE_NUMBER=123                      # optional, only used for tracking progress
```

> [!NOTE]
> These variables are validated at runtime using Zod. Refer to the `src/utils/env.util.ts` file for the validation schema.

## Usage

### Development

Development mode with watch:

```bash
bun run dev
```

### Production

```bash
bun start
```

Or run the script directly:

```bash
bun run src/index.ts
```

### Command Line Arguments

The tool supports the following command line arguments:

```bash
bun run start --target pt --source en --batch-size 10
```

- `--target`: Target language code (default: "pt")
- `--source`: Source language code (default: "en")
- `--batch-size`: Number of files to process in each batch (default: 10)

## Project Structure

```
src/
├── errors/                              # Error handling system
│   ├── base.error.ts                    # Base error classes and types
│   ├── error.handler.ts                 # Error handler implementation
│   ├── proxy.handler.ts                 # Error handling proxy
│   └── specific.error.ts                # Specific error implementations
├── services/
│   ├── github/                          # GitHub API services
│   │   ├── base.service.ts              # Base GitHub service
│   │   ├── branch.service.ts            # Branch management
│   │   ├── content.service.ts           # Content and PR management
│   │   ├── github.service.ts            # Main GitHub service
│   │   └── repository.service.ts        # Repository operations
│   ├── runner/                          # Workflow orchestration
│   │   ├── base.service.ts              # Base runner implementation
│   │   └── runner.service.ts            # Main workflow orchestrator
│   ├── database.service.ts              # Database service
│   ├── snapshot.service.ts              # Snapshot service
│   └── translator.service.ts            # Translation service
├── utils/
│   ├── constants.util.ts                # Application constants
│   ├── env.util.ts                      # Environment validation
│   ├── language-detector.util.ts        # Language detection utility
│   ├── parse-command-args.util.ts       # Command line argument parser
│   ├── setup-signal-handlers.util.ts    # Process signal handlers
│   └── translation-file.util.ts         # Translation file utility
├── index.ts                             # Main entry point
├── types.d.ts                           # Type definitions
│
logs/                                    # Error logs directory
snapshots.sqlite                         # SQLite database for state persistence
```

## Architecture

### Core Services

1. **Runner Service** (`services/runner/`)

- Orchestrates the entire translation workflow
- Manages batch processing and progress tracking
- Handles state persistence through snapshots
- Implements error recovery and reporting

2. **GitHub Service** (`services/github/`)

- Modular architecture with specialized services:
  - **Base Service**: Common GitHub functionality and error handling
  - **Branch Service**: Branch lifecycle and cleanup management
  - **Content Service**: File operations and PR management
  - **Repository Service**: Repository and fork synchronization
- Inheritance-based design for code reuse
- Protected access modifiers for internal operations
- Unified error handling through base service

3. **Translator Service** (`services/translator.service.ts`)

- Interfaces with OpenAI's language models
- Handles content parsing and block management
- Maintains translation glossary and rules
- Implements chunking and retry mechanisms for large files

4. **Language Detector** (`utils/language-detector.util.ts`)

- Uses `franc` for language detection
- Determines if content needs translation
- Calculates language confidence scores

5. **Database Service** (`services/database.service.ts`)

- Manages persistent storage of workflow state
- Handles snapshots for interruption recovery
- Maintains translation history and results

### Error Handling System

1. **Error Handler** (`errors/error.handler.ts`)

- Centralized error management
- Severity-based filtering
- File logging capabilities
- Custom error reporting

2. **Error Proxy** (`errors/proxy.handler.ts`)

- Automatic error wrapping for services
- Context enrichment for debugging
- Method-specific error handling
- Error transformation and mapping

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
