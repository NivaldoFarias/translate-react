# translate-react 🌐

> Automate React documentation translation from English to Brazilian Portuguese (pt-BR) using OpenAI's GPT models.

[![License](https://img.shields.io/github/license/NivaldoFarias/translate-react)](LICENSE)
[![GitHub package.json version](https://img.shields.io/github/package-json/v/NivaldoFarias/translate-react)](package.json)
[![Bun](https://img.shields.io/badge/runtime-bun-black)](https://bun.sh)

## Overview

This CLI tool streamlines the React documentation translation process to Brazilian Portuguese, currently at 42% completion _(2025-01-17)_. Built with TypeScript and powered by Bun, it leverages OpenAI's GPT models for high-quality translations while maintaining technical accuracy.

> [!TIP]
> Check out our [Contributing](#contributing) section if you want to help improve the translations!

### Key Features

- 🤖 **AI-Powered Translation**: Uses OpenAI's GPT models with strict glossary rules
- 🔄 **State Management**: Handles interruptions gracefully through snapshots
- 🌐 **GitHub Integration**: Automated PR creation and issue tracking
- 🔍 **Quality Control**: Preserves markdown, code blocks, and technical terms
- 📦 **Batch Processing**: Configurable batch sizes with progress tracking
- 🛠️ **Error Recovery**: Resume from failures without losing progress

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) runtime
- GitHub Personal Access Token (with repo scope)
- OpenAI API Key
- Node.js v18+

> [!IMPORTANT]
> Make sure your GitHub token has the `repo` scope enabled. This is required for creating branches and submitting PRs.

### Quick Setup

1. **Clone and Install**

```bash
git clone https://github.com/NivaldoFarias/translate-react.git
cd translate-react
bun install
```

2. **Configure Environment**

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Required
GITHUB_TOKEN=your_github_token
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4
REPO_OWNER=target_repo_owner
REPO_NAME=target_repo_name
ORIGINAL_REPO_OWNER=original_repo_owner
TRANSLATION_ISSUE_NUMBER=123

# Optional (with defaults)
NODE_ENV=development
BUN_ENV=development
MAX_FILES=10
GITHUB_SINCE=2024-01-01
```

> [!NOTE]
> All environment variables are validated at runtime using Zod. Check `src/utils/env.ts` for the validation schema.

### Development Workflow

1. **Start Development Server**

```bash
bun run dev     # Watch mode
```

2. **Run Tests**

```bash
bun test        # Run test suite
```

3. **Production Build**

```bash
bun run build   # Build for production
bun run start   # Start production server
```

> [!WARNING]
> Always run tests before deploying to production to ensure translations maintain quality standards.

4. **State Recovery**

The tool automatically manages state through snapshots:

- Saves progress every time a file is processed
- Loads most recent snapshot if within TTL window (default: 1 hour)
- Configurable TTL for different environments
- Graceful handling of interruptions and failures

Example of custom TTL configuration:

```typescript
// 30 minutes TTL
const snapshotManager = new SnapshotManager(logger, 30 * 60 * 1000);
```

> [!NOTE]
> Snapshots older than the TTL window are ignored to prevent using outdated translation state.

## How It Works

### Translation Workflow

1. **File Discovery**
   1.1 Fetches untranslated markdown files from React docs
   1.2 Filters based on configured criteria (date, issue numbers)

2. **Translation Process**
   2.1 Splits content into manageable chunks
   2.2 Applies strict glossary rules
   2.3 Preserves formatting and technical terms
   2.4 Maintains code block integrity

> [!IMPORTANT]
> The translation process strictly follows the glossary rules to maintain consistency across all translations.

3. **GitHub Integration**
   3.1 Creates feature branches per file
   3.2 Submits PRs with translations
   3.3 Updates tracking issues
   3.4 Handles branch cleanup

4. **State Management**
   4.1 Saves progress in `.snapshots/`
   4.2 Enables interruption recovery
   4.3 Tracks translation metrics
   4.4 Auto-loads snapshots within TTL window (default: 1 hour)
   4.5 Configurable TTL via constructor options

## Project Structure

```
src/
├── services/           # Core business logic
│   ├── github.ts         # GitHub API integration
│   ├── translator.ts     # OpenAI translation service
│   ├── branch-manager.ts # Git branch management
│   └── snapshot-manager.ts # State persistence
├── utils/             # Helper functions
│   ├── logger.ts        # Console logging
│   ├── env.ts          # Environment config
│   └── errors.ts       # Error handling
└── types.d.ts        # Type definitions
```

> [!TIP]
> The modular architecture makes it easy to extend functionality or add support for new languages.

## Contributing

Contributions are welcome! Here's how you can help:

1. Fork the repository
2. Create your feature branch (`git switch -c feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

> [!NOTE]
> Please follow our commit convention and include tests for new features.

## License

This project is MIT licensed - see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/NivaldoFarias">Nivaldo Farias</a></sub>
</div>
