# translate-react

A CLI tool to automate the translation of React documentation from English to Brazilian Portuguese (pt-BR) using OpenAI's GPT models.

## Overview

This project aims to accelerate the translation process of React's documentation to Brazilian Portuguese, which is currently *(2025-01-17)* only 42% complete. It automates the workflow of:

1. Fetching untranslated markdown files from the React docs repository
2. Translating content using OpenAI's GPT models
3. Creating branches and pull requests with translations
4. Managing the translation workflow with rate limiting and error handling

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
OPENAI_MODEL=gpt-4                              # optional, defaults to gpt-4o
REPO_OWNER=target_repo_owner                    # required
REPO_NAME=target_repo_name                      # required
ORIGINAL_REPO_OWNER=original_repo_owner         # required
NODE_ENV=production                             # optional, defaults to production
BUN_ENV=test                                    # optional, defaults to development
MAX_FILES=                                      # optional, defaults to all files
TRANSLATION_ISSUE_NUMBER=                       # optional, defaults to no issue comment
```

> [!NOTE]
> These variables are also checked during runtime. Refer to the `src/utils/env.ts` file for more details.

## Usage

### Development

Development mode with watch:

```bash
bun run dev
```

### Production

> [!WARNING]
> This project is not meant to be run in production. It's a proof of concept and should not be used in production environments.

```bash
bun run build
bun run start
```

Or just run using bun without building:

```bash
bun run index.ts
```

## Project Structure

```
src/
├── services/
│   ├── github.ts             # GitHub API integration
│   ├── translator.ts         # OpenAI translation service
│   └── language-detector.ts  # Language detection service
├── utils/
│   ├── branchManager.ts      # Git branch management
│   ├── logger.ts             # Logging utilities
│   ├── rateLimiter.ts        # API rate limiting
│   ├── env.ts                # Environment variables
│   └── errors.ts             # Custom error handling
├── runner.ts                 # Main workflow runner
└── types.d.ts                # Local type definitions
```

## Contributing

This project is still WIP *(Work In Progress)* and there are many possible parallel use cases that are not covered yet. Feel free to open issues, fork the project and send pull requests for improvements.
