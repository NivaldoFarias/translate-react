# translate-react

A specialized tool for automated translation of React documentation from English to Brazilian Portuguese using Claude AI. The project maintains high-quality translations while preserving technical accuracy and documentation structure.

## Workflow

1. **Repository Scan**: Scans the React documentation repository for untranslated Markdown files
2. **Translation Process**:
   - Uses Claude AI for initial translation
   - Enforces strict glossary rules for technical terms
   - Preserves all markdown formatting, code blocks, and HTML tags
   - Maintains original document structure and links
3. **Quality Control**:
   - Automated verification of translation quality
   - Language pattern analysis to detect untranslated content
   - Refinement pass to ensure consistency with glossary terms
4. **GitHub Integration**:
   - Creates feature branches for each translation
   - Automated commits with translated content
   - Rate-limiting for API calls

## Setup

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

## Environment Variables

Required environment variables:
- `CLAUDE_API_KEY`: Anthropic Claude API key
- `GITHUB_TOKEN`: GitHub access token
- `REPO_OWNER`: Target repository owner
- `REPO_NAME`: Target repository name

This project was created using `bun init` in bun v1.1.42. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
