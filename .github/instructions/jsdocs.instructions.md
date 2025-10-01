---
description: Enforces comprehensive documentation standards optimized for AI/LLM comprehension and code maintenance
applyTo: "**/*.ts, **/*.js, **/*.mts, **/*.cts, **/*.mjs, **/*.cjs"
---

# Documentation Standards for AI-Optimized Code Understanding

This document outlines the structure and conventions for writing JSDoc documentation within this project. Each rule is defined with a clear description and an optional link to the official documentation for further reference.

Auxiliary files to refer to for more context:

- [Workspace Copilot Instructions](../copilot-instructions.md): for general AI-assisted coding guidelines.

## Core JSDoc Requirements

### Document All Public Elements [P0]

MUST document ALL public functions, methods, classes, interfaces, types, and exported variables to enable proper AI understanding and automated tooling.

### Required JSDoc Tags Structure [P0]

- **WHEN**: Documenting functions, methods, classes, or exported variables
- **WHAT**: MUST include ALL required JSDoc tags with proper formatting and structure
- **WHY**: Enables proper AI understanding, automated tooling, and comprehensive code navigation
- **HOW**: For functions and methods, include these MANDATORY tags:
  - `@param` for each parameter with detailed description
  - `@returns` for return values with type and description
  - `@example` with realistic usage showing actual project patterns
  - Use proper spacing and formatting for optimal user and AI comprehension
- **EXCEPT**: Simple methods/variables without parameters or side effects. See section `Single-Line Format for Trivial Functions` for details.

#### Examples

##### TypeScript

````typescript
/**
 * Creates a travel itinerary based on user preferences and generates a PDF.
 *
 * @remarks Processes user travel data, applies rate limiting, generates AI-powered
 * itinerary content, and stores the result in the database with PDF path.
 *
 * @param request The incoming NextJS request containing travel planning data
 *
 * @returns Promise resolving to NextResponse with itinerary generation status and ID
 *
 * @example
 * ```typescript
 * const response = await POST(mockRequest);
 * const data = await response.json();
 *
 * console.log(data.data.id);
 * // ^? "travel-plan-uuid"
 * ```
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
	// ...
}
````

##### JavaScript

````javascript
/**
 * Calculates the total budget breakdown for a travel itinerary
 *
 * Takes travel preferences and duration to estimate costs across
 * accommodation, meals, activities, and transportation categories.
 *
 * @param {object} travelData The travel planning data
 * @param {string} travelData.destination Travel destination name
 * @param {number} travelData.budget Total budget amount
 * @param {number} duration Trip duration in days
 *
 * @returns {Object} Budget breakdown with category allocations
 * @returns {number} returns.accommodation Accommodation costs
 * @returns {number} returns.meals Food and dining costs
 * @returns {number} returns.activities Entertainment and activity costs
 *
 * @example
 * ```javascript
 * const breakdown = calculateBudget({
 *   destination: "Tokyo",
 *   budget: 5000
 * }, 7);
 * console.log(breakdown.accommodation);
 * // ^? 2000
 * ```
 */
function calculateBudget(travelData, duration) {
	// ...
}
````

### Single-Line Format for Trivial Functions [P0]

MUST use single-line JSDoc format for:

- trivial functions **without** parameters or side effects
- local variables/constants that are self-explanatory and do not require additional context
- Class/Interface/etc attributes that are self-explanatory

```typescript
/** Pauses execution for one second */
function pause(): void {
	setTimeout(() => {}, 1000);
}
```

```javascript
/** Maximum number of retries for API calls */
const MAX_RETRIES = 3;
```

### No Type Annotations in TypeScript [P1]

MUST exclude TypeScript type annotations from JSDoc in `.ts` files to avoid redundancy. TypeScript files provide static type information, making JSDoc type annotations redundant.

### Structured Markdown Formatting [P2]

MUST use structured markdown formatting for enhanced readability and AI parsing. Employ consistent markdown syntax with proper hierarchy, lists, and emphasis.

### Language Identifiers in Code Blocks [P1]

MUST specify language identifiers for all code blocks to enable proper syntax highlighting and optimal AI understanding.

### Cross-References and Links [P1]

- **WHEN**: Documenting functions, classes, or concepts that relate to other code elements, external documentation, or resources
- **WHAT**: MUST use `@see` and `{@link}` tags to create proper cross-references and links
- **WHY**: Enables navigation between related code elements, improves AI understanding of code relationships, and provides context for maintainers
- **HOW**:
  - Use `@see` for standalone references to related functions, classes, or external resources
  - Use `{@link}` for inline references within descriptions
  - For internal references, use the symbol name directly (e.g., `@see functionName`)
  - For external links, use the full URL with optional display text (e.g., `{@link https://example.com|Example}`)

#### Examples

```javascript
/**
 * Validates user authentication token and returns user data.
 *
 * @param {string} token JWT authentication token
 * @returns {Promise<UserData>} User information if token is valid
 *
 * @see {@link generateAuthToken} for creating tokens
 * @see {@link refreshToken} for token renewal
 * @see {@link https://jwt.io|JWT Documentation}
 */
function validateAuthToken(token) {
	// ...
}

/**
 * Creates a new authentication token for the user.
 *
 * @remarks Uses {@link validateAuthToken} to verify the generated token.
 *
 * @param {UserData} userData User information to encode
 * @returns {string} JWT authentication token
 *
 * @see {@link https://github.com/auth0/node-jsonwebtoken|JWT Library Docs}
 */
function generateAuthToken(userData) {
	// ...
}
```

### Complex Business Logic Documentation [P1]

MUST document complex business logic with detailed workflow descriptions using hierarchical markdown formatting.

## JavaScript-Specific Requirements

### Comprehensive Type Information [P1]

MUST include comprehensive type information in JSDoc for JavaScript files. JavaScript files require explicit type documentation through JSDoc annotations for proper tooling support.

## Advanced Documentation Requirements

### Behavioral Contracts and Side Effects [P1]

MUST include behavioral contracts and side effects documentation. Document all observable behaviors, state changes, and external interactions.

### Performance Characteristics [P2]

MUST document performance characteristics and complexity for algorithms. Include Big O notation and performance considerations for algorithmic functions.

### Integration Points and Dependencies [P1]

MUST document integration points and external dependencies. Clearly identify external system interactions and dependency requirements.

### Version Compatibility and Deprecation [P2]

MUST include version compatibility and deprecation notices. Document API versions, compatibility requirements, and deprecation timelines.

### Detailed Examples with Error Scenarios [P2]

SHOULD provide detailed examples with realistic data and error scenarios. Include comprehensive examples showing both success and failure cases. Exception: For trivial functions, no examples are required.

## Enforcement and Quality Assurance

### Consistency with Established Patterns [P1]

MUST maintain consistency with established patterns. Follow established documentation patterns within the codebase to ensure uniform AI comprehension.

### Documentation Updates with Code Changes [P0]

MUST update documentation with code changes. JSDoc comments must be updated simultaneously with code modifications to prevent documentation drift.

### AI-Generated Documentation Quality [P0]

- **WHEN**: Using AI assistance to generate or update JSDoc documentation
- **WHAT**: MUST review and validate all AI-generated documentation for accuracy and completeness
- **WHY**: AI can generate generic, incorrect, or misleading documentation that doesn't match actual implementation
- **HOW**:
  - Verify parameter descriptions match actual function behavior
  - Ensure examples use realistic project data (not generic placeholders)
  - Check that error conditions and side effects are accurately documented
  - Validate that return value descriptions match implementation
- **EXCEPT**: Simple getter/setter functions may use standard AI-generated patterns

## Enforcement and Quality Assurance

### JSDoc Completeness Validation [P1]

MUST validate JSDoc completeness through automated tooling for required tag presence, description completeness, example code syntax validity, cross-reference link integrity, and markdown formatting correctness.

### Pattern Consistency [P1]

MUST maintain consistency with established documentation patterns within the codebase to ensure uniform AI comprehension and developer experience.

### Documentation Currency [P0]

MUST update documentation simultaneously with code changes to prevent documentation drift and maintain accuracy for AI-assisted development tools.
