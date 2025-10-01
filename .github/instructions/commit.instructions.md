---
description: Enforces commit message conventions optimized for AI-assisted development and project maintainability
---

# Git Commit Message Standards

Commit message standards for the project, optimized for AI-assisted development and semantic versioning.

Auxiliary files to refer to for more context:

- [Workspace Copilot Instructions](../copilot-instructions.md): for general AI-assisted coding guidelines.

## Core Commit Requirements [P0]

### Conventional Commits Compliance [P0]

- **WHEN**: Creating any commit in the repository
- **WHAT**: MUST follow the Conventional Commits specification for all commit messages
- **WHY**: Maintains clear version history, enables automated tooling, and improves AI comprehension of changes
- **HOW**: Use the structured format: `<type>(scope): <description>` with optional body and footers

### Commit Message Structure [P0]

- **WHEN**: Writing commit messages for any code change
- **WHAT**: MUST structure commit messages with required type, optional scope, and clear description
- **WHY**: Enables automated tooling, semantic versioning, and clear change tracking
- **HOW**:

```plaintext
<type>(scope): <description>

[optional body]

[optional footer(s)]
```

**Components**:

- **`<type>`** (required): Specifies the purpose of the change
- **`(scope)`** (recommended): project-specific area affected (e.g., `services`, `utils`, `errors`)
- **`<description>`** (required): Imperative sentence, 72 characters max
- **`[body]`** (optional): Additional context for complex changes
- **`[footer]`** (optional): Breaking changes, issue references

### Allowed Commit Types [P0]

MUST use one of these standardized commit types:

- **feat**: New features (e.g., new components, API endpoints)
- **fix**: Bug fixes and error corrections
- **docs**: Documentation updates (README, API docs, comments)
- **style**: Code formatting, whitespace, missing semicolons
- **refactor**: Code restructuring without behavior changes
- **test**: Adding or updating tests
- **chore**: Dependencies, build tools, maintenance tasks

### Project-Specific Scopes [P1]

SHOULD use these project-specific scopes when applicable:

- **services**: Service layer, business logic
- **utils**: Utility functions, helpers
- **errors**: Error handling and logging

### Description Requirements [P0]

- **WHEN**: Writing the commit description (the part after the colon)
- **WHAT**: MUST follow imperative mood, concise formatting rules
- **WHY**: Ensures consistency, readability, and compatibility with automated tools
- **HOW**:
  - Use **imperative mood** ("add", "fix", "update", not "adding", "fixed", "updates")
  - Keep **72 characters or fewer** for the description line
  - Be **specific and descriptive** about the actual change
  - **Lowercase** the first letter (except proper nouns)
  - **No period** at the end of the description

### **Examples**

#### **project-Specific Examples**

```plaintext
feat(api): add travel itinerary generation endpoint
```

```plaintext
fix(db): resolve rate limiting concurrent access issue
```

```plaintext
docs(readme): update Docker setup instructions
```

```plaintext
refactor(frontend): extract travel form validation logic
```

#### **Commit with a Body**

```plaintext
fix(db): handle race condition in user creation

- Previously, concurrent requests could cause duplicate users due to a missing unique constraint.
- This fix adds a database-level constraint and ensures the app handles conflicts gracefully.
```

#### **Breaking Change**

```plaintext
refactor(api): remove deprecated `/v1` endpoints

- The old API endpoints under `/v1` have been removed in favor of `/v2`.
- BREAKING CHANGE: Applications relying on `/v1` routes must migrate to `/v2`.
```

## AI-Assisted Commit Guidelines [P0]

### AI-Generated Commit Messages [P0]

- **WHEN**: Using AI assistance to generate commit messages
- **WHAT**: MUST review and validate all AI-generated commit messages for accuracy and specificity
- **WHY**: AI can generate generic or inaccurate commit messages that don't reflect actual changes
- **HOW**:
  - Verify the commit type matches the actual changes made
  - Ensure the scope accurately reflects the affected area
  - Check that the description is specific to project functionality
  - Validate that examples or technical details are project-appropriate
  - Review for proper imperative mood and character limits

### Multi-File Change Commits [P1]

- **WHEN**: Committing changes that span multiple files or areas
- **WHAT**: SHOULD create focused, atomic commits rather than large multi-scope commits
- **WHY**: Improves git history readability and enables better rollback capabilities
- **HOW**:
  - Group related changes into separate commits
  - Use the most significant scope if changes cross boundaries
  - Consider splitting large changes into multiple logical commits
  - Use commit body to explain relationships between files when necessary

### Commit Message Templates [P2]

Common project commit patterns:

### New feature implementation

```plaintext
feat(scope): add [feature name] with [key capability]
```

### Bug fix with context

```plaintext
fix(scope): resolve [specific issue] in [component/area]
```

### Database changes

```plaintext
feat(db): add [model/table] for [business purpose]
```

```plaintext
chore(db): migrate [specific change] for [reason]
```

### Documentation updates

```plaintext
docs(area): update [specific documentation] with [new information]
```
