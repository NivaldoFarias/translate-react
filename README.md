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
GITHUB_TOKEN=your_github_token
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4 # or another compatible model
REPO_OWNER=target_repo_owner
REPO_NAME=target_repo_name
NODE_ENV=production
MAX_FILES= # optional, defaults to all files
```

## Usage

Build and run:

```bash
bun run build
bun run start
```

Development mode with watch:

```bash
bun run dev
```

## Project Structure

```
src/
├── services/
│   ├── github.ts        # GitHub API integration
│   ├── translator.ts    # OpenAI translation service
│   └── language-detector.ts
├── utils/
│   ├── branchManager.ts # Git branch management
│   ├── logger.ts        # Logging utilities
│   ├── rateLimiter.ts   # API rate limiting
│   └── errors.ts        # Custom error handling
└── index.ts            # Main runner
```

## Contributing

Feel free to open issues and pull requests for improvements.

## License

MIT
