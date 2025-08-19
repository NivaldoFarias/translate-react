---
description: enforces commit message conventions
---

# Git Commit Message Rules

## Commit Message Guidelines

Commit messages **must** follow the Conventional Commits specification to maintain a clear and structured version history.

### **Commit Message Format**

A commit message **must** be structured as follows:

```plaintext
<type>(optional scope): <description>

[optional body]

[optional footer(s)]
```

- **`<type>`** (required): Specifies the purpose of the change.
- **`(scope)`** (optional but recommended): Identifies the area of the codebase affected.
- **`<description>`** (required): A short, imperative sentence summarizing the change. should format text whenever possible _(ex.: "fix(db): remove deprecated `env` prefix")_
- **`[optional body]`**: Additional context about the change.
- **`[optional footer(s)]`**: Metadata, such as breaking changes or issue references.

### **Allowed Commit Types**

The `<type>` field **must** be one of the following:

- **feat**: Introduces a new feature
- **fix**: Fixes a bug
- **docs**: Updates or improves documentation
- **style**: Changes that do not affect functionality (e.g., formatting, whitespace)
- **refactor**: Code restructuring without changing behavior
- **test**: Adds or updates tests
- **chore**: Routine tasks, maintenance, or dependencies updates

### **Description Rules**

- Must be **clear and concise**.
- Written in the **imperative mood** (e.g., "add", "fix", "update").
- Limited to **72 characters** or fewer.

### **Examples**

#### **Basic Examples**

```plaintext
chore(i18n): Add `i18n-js` gem
```

```plaintext
feature(auth): Reduce complexity in JWT creation async function
```

```plaintext
docs: update API documentation
```

#### **Commit with a Body**

```plaintext
fix(db): handle race condition in user creation

Previously, concurrent requests could cause duplicate users due to a missing unique constraint.
This fix adds a database-level constraint and ensures the app handles conflicts gracefully.
```

#### **Breaking Change**

```plaintext
refactor(api): remove deprecated `/v1` endpoints

The old API endpoints under `/v1` have been removed in favor of `/v2`.

BREAKING CHANGE: Applications relying on `/v1` routes must migrate to `/v2`.
```
