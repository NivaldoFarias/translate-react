---
description: Enforces comprehensive TypeScript coding standards optimized for AI/LLM comprehension and type safety
applyTo: "**/*.ts, **/*.js, **/*.mts, **/*.cts, **/*.mjs, **/*.cjs"
---

# TypeScript Coding Standards for AI-Optimized Development

This document outlines the structure and conventions for writing TypeScript code within this project. Each rule is defined with a clear description and an optional link to the official documentation for further reference.

Auxiliary files to refer to for more context:

- [Project's TypeScript Config File](../../tsconfig.json): to contextualize on Project-specific TypeScript options and settings.
- [Workspace Copilot Instructions](../copilot-instructions.md): for general AI-assisted coding guidelines.

## Module System and Import Management

### Node.js Native Modules with Protocol Prefix [P1]

MUST prefix Node.js native modules with `node:` protocol for explicit disambiguation and better AI understanding of module origins.

```typescript
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
```

### Path Mapping Aliases [P1]

MUST use `@/` path aliases for internal imports per tsconfig.json configuration.

### Separate Type Imports [P2]

MUST separate type imports from runtime value imports using `import type`.

### Explicit Import Syntax [P2]

MUST use named imports for better tree-shaking and dependency tracking.

## Type System and Annotations

### Explicit Function Return Types [P0]

- **WHEN**: Writing any TypeScript function (regular, async, arrow functions)
- **WHAT**: MUST annotate explicit return types for all function declarations
- **WHY**: Improves AI comprehension, enables better IntelliSense, prevents type inference errors
- **HOW**:

```typescript
// ✅ Correct
function getUserById(id: string): Promise<User | null> { ... }
const processData = (input: Data): ProcessedResult => { ... }
async function fetchUser(id: string): Promise<User> { ... }

// ❌ Incorrect
function getUserById(id: string) { ... } // Missing return type
```

**EXCEPT**: Simple utility functions with obvious primitive returns (< 3 lines)

### Unknown Over Any [P0]

MUST use `unknown` over `any` for type-safe handling of unknown values.

### Array Type Syntax [P2]

MUST use `T[]` syntax for array types for better readability and consistency with TypeScript conventions.

### Record Types for Object Types [P2]

MUST prefer `Record<string, T>` over index signatures for object types.

### Strict Null Checking [P0]

MUST use strict null checking with explicit optional property syntax.

### Union Types [P1]

MUST use union types for precise value constraints.

## Object-Oriented Programming Standards

### Explicit Access Modifiers [P1]

MUST use explicit access modifiers for all class members.

### Readonly Properties [P2]

MUST implement readonly properties for immutable data.

## Code Documentation and Semantic Clarity

### JSDoc Comments for Documentation [P1]

- **WHEN**: Documenting TypeScript functions, classes, and complex logic
- **WHAT**: MUST use JSDoc comments exclusively for structured documentation
- **WHY**: Enhances AI comprehension and enables automated tooling
- **HOW**:

```typescript
/**
 * Processes user data and returns formatted result
 * @param userData - Raw user information from API
 * @returns Formatted user data for display
 * @throws When user data is invalid
 */
function processUserData(userData: RawUser): FormattedUser { ... }
```

**EXCEPT**: NEVER include type annotations in JSDoc for TypeScript files - types are provided by TypeScript

### Numeric Separators [P2]

MUST use underscore separators in large numeric literals for readability.

## Variable Naming and Semantic Conventions

### Descriptive Variable Names [P1]

MUST employ descriptive, unabbreviated variable names for enhanced AI comprehension and code readability.

### Named Conditional Logic [P1]

- **WHEN**: Working with complex conditional expressions
- **WHAT**: MUST extract complex logic into semantically named variables or functions
- **WHY**: Improves readability and enables better AI analysis of business logic
- **HOW**:

```typescript
// ✅ Correct
const isValidTravelDate = endDate > startDate && endDate <= maxDate;
const hasRequiredPermissions = user.role === 'admin' || user.canEdit;

if (isValidTravelDate && hasRequiredPermissions) { ... }

// ❌ Incorrect
if (endDate > startDate && endDate <= maxDate && (user.role === 'admin' || user.canEdit)) { ... }
```

## Advanced Type System Features

### Conditional Types [P2]

MUST leverage conditional types for advanced type relationships and constraints that enhance AI understanding.

### Mapped Types [P2]

MUST implement mapped types for systematic property transformations across related type definitions.

### Template Literal Types [P2]

MUST utilize template literal types for string manipulation and validation with compile-time safety.

## Performance and Bundle Optimization

### Tree-Shaking Friendly Exports [P2]

MUST implement tree-shaking friendly exports for optimal bundle sizes and better static analysis.

### Const Assertions [P2]

MUST employ const assertions for immutable literal types to provide compile-time immutability and better type inference.

## Error Handling and Type Safety Patterns

### Discriminated Unions [P1]

- **WHEN**: Handling multiple related types or states (success/error, different response types)
- **WHAT**: MUST implement discriminated unions with literal type discriminators
- **WHY**: Enables exhaustive type checking, improves error handling, and provides better AI analysis
- **HOW**:

```typescript
// ✅ Correct
type ApiResponse<T> = { success: true; data: T } | { success: false; error: string };

function handleResponse<T>(response: ApiResponse<T>): T | null {
	if (response.success) {
		return response.data; // TypeScript knows this is T
	}
	console.error(response.error); // TypeScript knows this is string
	return null;
}
```

### Explicit `enum` or `as const` usage [P1]

MUST use `enum` or `as const` for fixed sets of related constants to enhance type safety and AI comprehension.

```typescript
export enum UserRole {
	Admin = "admin",
	Editor = "editor",
	Viewer = "viewer",
}

export const userConfigMap = {
	[UserRole.Admin]: { canEdit: true, canDelete: true },
	[UserRole.Editor]: { canEdit: true, canDelete: false },
	[UserRole.Viewer]: { canEdit: false, canDelete: false },
} as const;
```

### Branded Types [P2]

MUST utilize branded types for enhanced type safety and domain modeling to prevent primitive obsession.

## Enforcement and Quality Assurance Standards

### Strict TypeScript Configuration [P0]

MUST configure TypeScript compiler with strict mode and additional safety flags. SHOULD ensure `tsconfig.json` includes, AT LEAST:

```json
{
	"compilerOptions": {
		"strict": true,
		"noUncheckedIndexedAccess": true,
		"exactOptionalPropertyTypes": true,
		"noImplicitReturns": true,
		"noFallthroughCasesInSwitch": true
	}
}
```

### Consistent Code Formatting [P1]

MUST implement consistent code formatting through automated tooling to ensure consistency and improve AI code analysis. Use workspace's configured formatter (e.g., Prettier).

### Synchronized Type Definitions [P1]

MUST maintain type definitions synchronized with runtime implementations to ensure reliable AI-assisted development.

### Branded Types for Domain Modeling [P2]

MUST utilize branded types for enhanced type safety and domain modeling to prevent primitive obsession and provide stronger type guarantees.

## Quality Assurance Standards

### Code Quality Metrics [P2]

SHOULD track code quality metrics:

- Cyclomatic complexity
- Test coverage percentage
- Type coverage percentage
- ESLint/TypeScript error counts

## Integration with Modern Development Tooling

### ESLint Rules for TypeScript [P1]

MUST configure ESLint rules for TypeScript-specific best practices to enhance code quality and maintain consistency (if the config is already setup, ensure it includes relevant rules).

### TypeScript Project References [P2]

MUST utilize TypeScript project references for monorepo optimization to enable better build performance and dependency management.
