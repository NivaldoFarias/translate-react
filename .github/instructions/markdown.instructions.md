---
description: Enforces strict Markdown and GitHub Flavored Markdown (GFM) standards for clarity, consistency, and AI comprehension.
applyTo: "**/*.md"
---

# Markdown and GFM Documentation Standards

This document outlines the structure and conventions for writing Markdown files within this project. Each rule is defined with a clear description and an optional link to the official GitHub documentation for further reference.

Auxiliary files to refer to for more context:

- [Workspace Copilot Instructions](../copilot-instructions.md): for general AI-assisted coding guidelines.

## Core Principles

### Clarity, Structure, and Consistency [P0]

MUST prioritize clarity, structure, and consistency. All Markdown files must be authored to be easily readable in both raw and rendered forms. The structure must be logical and predictable to aid AI/LLM parsing and developer comprehension.

### GitHub Flavored Markdown (GFM) [P0]

MUST use GitHub Flavored Markdown (GFM). All Markdown files must adhere to the GFM specification, which extends the CommonMark standard.

### Priority Levels for AI Processing [P0]

To help automated agents (like Copilot) focus on the most important rules first, each rule is suffixed with a priority tag:

- **[P0] Critical**: MUST follow. Essential for correctness, accessibility, or preventing rendering issues. Models should prioritize P0 rules first.
- **[P1] High**: SHOULD follow. Important for consistency, maintainability, and good UX. Satisfy P1 after P0 rules.
- **[P2] Medium/Low**: NICE to have. Helpful guidelines and stylistic preferences; satisfy these last.

###### [GitHub Docs: Basic writing and formatting syntax](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax)

## Document Structure

### Document Title [P1]

MUST use a single Level 1 Heading (`#`) for the document title. Each document must begin with a single, unique `#` heading. All other Level 1 headings should appear ONLY as section separators.

### Heading Hierarchy [P0]

MUST maintain a logical heading hierarchy. Heading levels must not be skipped (e.g., a `###` must follow a `##`). This is critical for document structure and accessibility.

### Table of Contents [P2]

SHOULD include a Table of Contents (ToC) for documents longer than 200 LoC or containing multiple sections. The ToC should be placed immediately after the main title and before any other content.

### Collapsible Sections [P2]

SHOULD use collapsible sections to manage large blocks of content, such as long code snippets or logs.

```markdown
<details>
<summary>Click to expand</summary>

This is the hidden content.

</details>
```

###### [GitHub Docs: Creating a collapsible section](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-a-collapsible-section)

## Text Formatting

| Style               | Syntax             |
| ------------------- | ------------------ |
| Bold                | `** **` or `__ __` |
| Italic              | `* *` or `_ _`     |
| Code                | `~~ ~~` or `~ ~`   |
| All bold and italic | `*** ***`          |
| Subscript           | `<sub> </sub>`     |
| Superscript         | `<sup> </sup>`     |
| Underline           | `<ins> </ins>`     |

### Emphasis [P1]

MUST use text formatting syntax for emphasis (e.g., warnings), using the appropriate style for the text *(ex.: `**bold**` for strong emphasis and `*italic*` for regular emphasis or introducing new terminology).*

### Inline Code [P1]

MUST use backticks (`\``) for inline code, file names, function names, command line texts, and other technical identifiers.

### Quoting Text [P2]

MUST use blockquotes (`>`) for quoting text, ensuring proper indentation and formatting. However, prioritize using GFM alert syntax for notes, tips, warnings, and important information, since it better highlights the content.

### Color Models [P2]

SHOULD use HEX, RGB or HSL formats for color representation.

###### [GitHub Docs: Supported color models](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#supported-color-models)

### Footnotes [P2]

SHOULD use footnotes to provide additional context or references without cluttering the main text.

###### [GitHub Docs: Footnotes](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#footnotes)

## Lists

### Unordered and Ordered Lists [P1]

MUST use hyphens (`-`) for unordered lists and `1.` for ordered lists to maintain consistency.

###### [GitHub Docs: Lists](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#lists)

### Task Lists [P1]

MUST use GFM task lists for actionable items in issues, pull requests, and documentation to track progress.

```markdown
- [x] Design the database schema
- [ ] Implement the `Alutrip Responde` endpoint
```

###### [GitHub Docs: About task lists](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/about-task-lists)

## Code and Content Blocks

### Fenced Code Blocks [P0]

- **WHEN**: Including code examples, command-line instructions, or configuration snippets
- **WHAT**: MUST use fenced code blocks with explicit language identifiers for proper syntax highlighting
- **WHY**: Enables correct syntax highlighting, improves readability, and helps AI understand code context
- **HOW**:
  - Use triple backticks (\`\`\`) with language identifier (e.g., `typescript`, `bash`, `json`)
  - For nested code blocks, use quadruple backticks (\`\`\`\`) for the outer block
  - Always specify language even for simple text to prevent rendering issues

###### [GitHub Docs: Creating and highlighting code blocks](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-and-highlighting-code-blocks)

### Blockquotes [P1]

MUST use blockquotes (`>`) to draw attention to notes, warnings, or important information. GFM alert syntax is preferred.

```markdown
> [!NOTE]
> Useful information that users should know, even when skimming content.

> [!TIP]
> Helpful advice for doing things better or more easily.

> [!IMPORTANT]
> Key information users need to know to achieve their goal.

> [!WARNING]
> Urgent info that needs immediate user attention to avoid problems.

> [!CAUTION]
> Advises about risks or negative outcomes of certain actions.
```

This is specially useful since GFM blockquotes allow content INSIDE of it to be formatted in Markdown.

```markdown
> [!NOTE]
> This is a note with a table:
> | Column 1 | Column 2 |
> |----------|----------|
> | Data 1 | Data 2 |
> | `inline-data-3` | ~~strikethrough-data-4~~ |
```

### Diagrams [P2]

SHOULD use Mermaid syntax to create diagrams directly within Markdown files for visualizing workflows, architectures, or sequences.

###### [GitHub Docs: Creating diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams)

### Mathematical Expressions [P2]

SHOULD use the `$` and `$$` delimiters to write mathematical expressions inline or as blocks.

###### [GitHub Docs: Writing mathematical expressions](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/writing-mathematical-expressions)

## Links & Attachments

### Descriptive Links [P1]

MUST use descriptive text for links that clearly describes the destination. **AVOID** generic text like "click here".

### Section links [P2]

SHOULD use section links to reference specific sections within the same document or other documents for easy navigation.

###### [GitHub Docs: Section links](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#section-links)

### Relative Links [P1]

MUST use relative links for internal references within the repository to ensure link stability across branches and forks.

###### [GitHub Docs: Relative links](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#relative-links)

### Autolinked References [P2]

GFM automatically creates links for URLs and specific references like issue numbers (`#123`) or commit SHAs. Rely on this feature for brevity.

###### [GitHub Docs: Autolinked references and URLs](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/autolinked-references-and-urls)

### Permanent Links to Code [P1]

MUST use permanent links when referencing specific lines of code in a file or pull request to avoid links breaking on future commits.

###### [GitHub Docs: Creating a permanent link to a code snippet](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-a-permanent-link-to-a-code-snippet)

### Attaching Files [P2]

SHOULD attach files by dragging and dropping, selecting, or pasting them directly into the text area to generate the necessary Markdown.

###### [GitHub Docs: Attaching files](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)

## Advanced GFM Features

### Tables [P1]

MUST use GFM table syntax to present structured data. Column alignment must be explicitly defined.

###### [GitHub Docs: Organizing information with tables](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-tables)

### Strikethrough [P2]

MUST use strikethrough (`~~text~~`) to mark content as obsolete or no longer relevant.

### Using Keywords in Issues and Pull Requests [P2]

MUST use keywords like `closes`, `fixes`, or `resolves` in pull request descriptions to automatically link and close corresponding issues upon merging.

###### [GitHub Docs: Using keywords in issues and pull requests](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/using-keywords-in-issues-and-pull-requests)

## General Style

### Blank Lines [P1]

MUST use a blank line to separate block-level elements like headings, lists, and code blocks to ensure proper rendering.

### Line Length [P2]

SHOULD keep line length under 100 characters to improve readability in raw Markdown files.

## AI-Generated Documentation Guidelines [P0]

### AI-Generated Markdown Quality [P0]

- **WHEN**: Using AI assistance to generate or update Markdown documentation
- **WHAT**: MUST review and validate all AI-generated Markdown for accuracy, structure, and compliance
- **WHY**: AI can generate improperly formatted Markdown, incorrect links, or inconsistent structure
- **HOW**:
  - Verify all links are functional and use proper relative paths
  - Check that code blocks have correct language identifiers
  - Ensure heading hierarchy is logical and follows document structure
  - Validate that examples are relevant to AluTrip project context
  - Review table formatting and alignment

### Documentation Maintenance [P1]

- **WHEN**: Updating code that affects documented features or APIs
- **WHAT**: MUST update corresponding Markdown documentation simultaneously
- **WHY**: Prevents documentation drift and maintains accuracy for users and AI tools
- **HOW**:
  - Update README files when adding new features or changing setup procedures
  - Modify API documentation when endpoints change
  - Update architectural diagrams when system design changes
  - Keep installation and configuration instructions current
