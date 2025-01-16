# translate-react

A specialized tool for automated translation of React documentation from English to Brazilian Portuguese using Claude AI. The project maintains high-quality translations while preserving technical accuracy and documentation structure.

## Features

- 🤖 Automated translation using Claude AI
- 📚 Strict glossary enforcement for technical terms
- 🎯 Single-pass high-quality translation
- 💾 Translation caching for improved performance
- 🔍 Smart language detection
- 🚦 Rate limiting for API calls
- 📊 Translation metrics and monitoring
- 🔁 Automatic retries with exponential backoff
- 🔀 GitHub integration for automated PRs

## Setup

### Prerequisites

- [Bun](https://bun.sh) >= 1.0.0
- GitHub account with repository access
- Anthropic API key for Claude

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/translate-react.git
cd translate-react

# Install dependencies
bun install
```

### Configuration

Create a `.env` file in the project root:

```env
CLAUDE_API_KEY=your_claude_api_key
CLAUDE_MODEL=claude-3-sonnet-20240229
GITHUB_TOKEN=your_github_token
REPO_OWNER=target_repo_owner
REPO_NAME=target_repo_name
MAX_FILES=10 # Optional: limit the number of files to process
```

## Usage

### Basic Usage

```bash
# Start the translation process
bun start

# Process only a specific number of files
MAX_FILES=5 bun start

# Run tests
bun test

# Run specific test suites
bun test:mock    # Run mock tests only
bun test:live    # Run live API tests
```

### Translation Process

1. **Repository Scan**:

   - Scans the React documentation repository for untranslated Markdown files
   - Identifies files based on language analysis and frontmatter

2. **Translation**:

   - Uses Claude AI with strict requirements
   - Preserves markdown formatting and code blocks
   - Follows glossary rules for technical terms
   - Maintains document structure and technical accuracy
   - Produces natural-sounding Brazilian Portuguese translations

3. **Quality Control**:

   - Automated verification during translation
   - Language pattern analysis
   - Glossary compliance check
   - Technical terminology consistency

4. **GitHub Integration**:
   - Creates feature branches
   - Automated commits
   - Rate-limited API calls

## Development

### Project Structure

```
src/
├── services/
│   ├── translator.ts      # Translation service
│   ├── fileTranslator.ts  # File handling and language detection
│   └── github.ts         # GitHub integration
├── utils/
│   ├── errors.ts         # Custom error types
│   ├── logger.ts         # Logging utility
│   └── rateLimiter.ts    # Rate limiting
└── types.ts              # TypeScript types

tests/
├── services/            # Service tests
├── utils/              # Utility tests
└── mocks/              # Test fixtures
```

### Running Tests

The project includes comprehensive tests:

```bash
# Run all tests
bun test

# Run with coverage
bun test:coverage

# Run specific test suites
bun test:mock
bun test:live
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

#### Commit Guidelines

- Use conventional commits format
- Include tests for new features
- Update documentation as needed

## Monitoring

The translation service includes built-in metrics:

- Total translations
- Success/failure rates
- Cache hit rates
- Average translation time
- API usage statistics

Access metrics programmatically:

```typescript
const translator = new TranslatorService();
const metrics = translator.getMetrics();
```

## Troubleshooting

### Common Issues

1. **Rate Limiting**

   - The service includes automatic retries
   - Check your API quota
   - Adjust rate limits in configuration

2. **Translation Quality**

   - Review glossary terms
   - Check source content formatting
   - Verify markdown preservation

3. **GitHub Integration**
   - Verify token permissions
   - Check repository access
   - Review rate limits

## License

MIT License - see [LICENSE](LICENSE) for details
