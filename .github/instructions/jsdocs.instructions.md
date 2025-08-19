---
description: Enforces comprehensive documentation standards optimized for AI/LLM comprehension and code maintenance
applyTo: "*.ts,*.*.ts,*.js,*.*.js"
---

# Documentation Standards for AI-Optimized Code Understanding

## Core JSDoc Requirements

### MUST document ALL public functions, methods, classes, interfaces, types, and exported variables

All publicly accessible code elements require comprehensive JSDoc documentation to enable proper AI understanding and automated tooling.

```typescript
/**
 * Calculates the total price of items including applicable tax rate.
 * Performs validation on input parameters and handles edge cases for empty arrays.
 *
 * @param items Array of items containing price property for calculation
 * @param taxRate Tax rate as decimal between 0 and 1 (e.g., 0.07 for 7% tax)
 *
 * @returns Total price including tax, rounded to 2 decimal places
 *
 * @throws {Error} When items array is empty or contains invalid price values
 * @throws {RangeError} When taxRate is negative or exceeds 1
 */
function calculateTotal(items: { price: number }[], taxRate: number): number {
	if (items.length === 0) throw new Error("Items array cannot be empty");
	if (taxRate < 0 || taxRate > 1) throw new RangeError("Tax rate must be between 0 and 1");

	return Math.round(items.reduce((sum, item) => sum + item.price, 0) * (1 + taxRate) * 100) / 100;
}
```

### MUST use single-line JSDoc format ONLY for trivial functions without parameters or side effects

Single-line format is permitted exclusively for simple utility functions with self-evident behavior and no parameters.

```typescript
/** Converts input string to uppercase format */
function toUpper(text: string): string {
	return text.toUpperCase();
}
```

### MUST provide comprehensive documentation structure with explicit semantic clarity

Every JSDoc comment must include these elements in the specified order for optimal AI parsing:

1. **Primary description** - Clear, action-oriented summary of function purpose
2. **Detailed explanation** - Additional context, algorithms, or business logic (when applicable)
3. **Parameter documentation** - Complete `@param` descriptions with constraints and examples
4. **Return value documentation** - Detailed `@returns` description explaining output format and meaning
5. **Exception documentation** - All `@throws` declarations with specific conditions
6. **Usage examples** - Practical `@example` demonstrations showing real-world usage
7. **Cross-references** - Related `@see` and `@link` references for additional context

```typescript
/**
 * Computes the square root of a positive number with error handling.
 * Implements input validation and provides detailed error messaging for debugging.
 *
 * @param x The numeric input value for square root calculation
 *
 * @returns The positive square root of the input number
 *
 * @throws {TypeError} When input parameter is not of type number
 * @throws {RangeError} When input value is negative (square root undefined for negative numbers)
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = sqrt(16);
 * console.log(result); // => 4
 *
 * // Error handling
 * try {
 *   sqrt(-1);
 * } catch (error) {
 *   console.error(error.message); // => "Cannot calculate square root of negative number"
 * }
 * ```
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/sqrt|MDN Math.sqrt}
 */
function sqrt(x: number): number {
	if (typeof x !== "number") throw new TypeError("Input must be a number");
	if (x < 0) throw new RangeError("Cannot calculate square root of negative number");

	return Math.sqrt(x);
}
```

### MUST exclude TypeScript type annotations from JSDoc in `.ts` files to avoid redundancy

TypeScript files provide static type information, making JSDoc type annotations redundant and potentially conflicting.

**❌ INCORRECT - Redundant type information in TypeScript:**

```typescript
/**
 * Computes the square root of a number.
 *
 * @param {number} x The input number
 * @returns {number} The square root
 */
function sqrt(x: number): number {
	return Math.sqrt(x);
}
```

**✅ CORRECT - Clean documentation without type redundancy:**

```typescript
/**
 * Computes the square root of a positive number with validation.
 *
 * @param x The numeric input value for calculation
 * @returns The positive square root of the input
 */
function sqrt(x: number): number {
	return Math.sqrt(x);
}
```

### MUST use structured markdown formatting for enhanced readability and AI parsing

Employ consistent markdown syntax with proper hierarchy, lists, and emphasis to improve documentation clarity.

```typescript
/**
 * Processes user data through a **multi-stage validation pipeline**.
 *
 * ## Processing Workflow
 * 1. **Input Validation** - Verify data format using *Zod schema*
 * 2. **Data Normalization** - Standardize field formats and values
 * 3. **Business Rule Application** - Apply domain-specific constraints:
 *    - Age verification (`>= 18` years)
 *    - Email format validation (RFC 5322 compliant)
 *    - Phone number standardization
 * 4. **Output Preparation** - Format validated data for downstream systems
 *
 * @param userData Raw input data from external sources
 *
 * @returns Validated and normalized user data object
 *
 * @throws {ValidationError} When input data fails schema validation
 */
function processUserData(userData: UserInput): ProcessedUser {
	// Implementation details
}
```

### MUST include semantic-rich formatting with code blocks, emphasis, and proper syntax highlighting

Utilize markdown formatting features to enhance documentation structure and improve AI comprehension.

```typescript
/**
 * Parses configuration files with **multi-format support**.
 * Supports JSON, YAML, and TOML configuration formats with automatic detection.
 *
 * @param filePath Absolute or relative path to configuration file
 *
 * @returns Parsed configuration object with validated structure
 *
 * @throws {FileNotFoundError} When specified file path does not exist
 * @throws {ParseError} When file content is malformed or invalid
 *
 * @example
 * ```typescript
 * // Load JSON configuration
 * const config = parseConfig("./config.json");
 * console.log(config.apiEndpoint); // => "https://api.example.com"
 *
 * // Load YAML configuration
 * const yamlConfig = parseConfig("./config.yaml");
 * console.log(yamlConfig.database.host); // => "localhost"
 * ```
 *
 * @see {@link https://example.com/config-schema|Configuration Schema Documentation}
 */
function parseConfig(filePath: string): ConfigurationObject {
	// Implementation
}
```

### MUST specify language identifiers for all code blocks to enable proper syntax highlighting

Code blocks require explicit language identification for optimal rendering and AI understanding.

**✅ CORRECT - With language identifier:**

```typescript
/**
 * @example
 * ```typescript
 * const result = processData(input);
 * ```
 */
```

**❌ INCORRECT - Missing language identifier:**

```typescript
/**
 * @example
 * ```
 * const result = processData(input);
 * ```
 */
```

### MUST document complex business logic with detailed workflow descriptions

Complex functions require structured workflow documentation using hierarchical markdown formatting.

```typescript
/**
 * Validates environment configuration against schema with comprehensive error reporting.
 * Performs runtime validation to ensure application configuration integrity.
 *
 * ## Validation Workflow
 * 1. **Schema Parsing** - Parse environment variables using predefined Zod schema
 * 2. **Type Coercion** - Convert string values to appropriate types (numbers, booleans)
 * 3. **Constraint Validation** - Verify values meet business rule requirements
 * 4. **Environment Updates** - Update `import.meta.env` with validated configuration
 * 5. **Error Aggregation** - Collect and format validation errors for debugging
 *
 * ## Error Handling Strategy
 * - Provides **detailed error messages** with field names and validation failures
 * - Includes **suggested fixes** for common configuration mistakes
 * - Maintains **error context** for debugging purposes
 *
 * @returns Validated environment configuration object
 *
 * @throws {ValidationError} Comprehensive validation errors with field-specific details
 *
 * @example
 * ```typescript
 * try {
 *   const env = validateEnv();
 *   console.log(`API URL: ${env.API_URL}`);
 * } catch (error) {
 *   console.error("Configuration validation failed:", error.message);
 * }
 * ```
 */
export function validateEnv(): EnvironmentConfig {
	try {
		const env = envSchema.parse(import.meta.env);
		Object.assign(import.meta.env, env);
		return env;
	} catch (error) {
		if (error instanceof z.ZodError) {
			const issues = error.issues
				.map((issue) => `- **${issue.path.join(".")}**: ${issue.message}`)
				.join("\n");
			throw new ValidationError(`❌ **Environment validation failed:**\n${issues}`);
		}
		throw error;
	}
}
```

## JavaScript-Specific Requirements

### MUST include comprehensive type information in JSDoc for JavaScript files

JavaScript files require explicit type documentation through JSDoc annotations for proper tooling support.

```javascript
/**
 * Calculates total price including tax with input validation.
 * Handles edge cases for empty arrays and invalid tax rates.
 *
 * @param {Array<{price: number, id: string}>} items Array of items with price and identifier
 * @param {number} taxRate Tax rate as decimal between 0 and 1
 * @param {Object} [options] Optional calculation parameters
 * @param {boolean} [options.roundToNearestCent=true] Whether to round to nearest cent
 * @param {string} [options.currency="USD"] Currency code for formatting
 *
 * @returns {number} Total price including tax, optionally rounded
 *
 * @throws {Error} When items array is empty or contains invalid price values
 * @throws {RangeError} When taxRate is outside valid range [0, 1]
 */
function calculateTotal(items, taxRate, options = {}) {
	const { roundToNearestCent = true, currency = "USD" } = options;
	// Implementation
}
```

## Advanced Documentation Requirements for AI Optimization

### MUST include behavioral contracts and side effects documentation

Document all observable behaviors, state changes, and external interactions.

```typescript
/**
 * Manages user session lifecycle with persistent storage and event emission.
 *
 * ## Behavioral Contract
 * - **State Management**: Updates global session state and localStorage
 * - **Event Emission**: Triggers `session:created` event on successful creation
 * - **Side Effects**:
 *   - Modifies browser localStorage with session data
 *   - Updates internal user authentication state
 *   - Initiates background session refresh timer
 * - **Network Calls**: Makes HTTP request to `/api/sessions` endpoint
 *
 * @param userData Validated user credentials and metadata
 * @param sessionOptions Configuration for session behavior
 *
 * @returns Created session object with authentication tokens
 *
 * @throws {AuthenticationError} When user credentials are invalid
 * @throws {NetworkError} When session creation API call fails
 *
 * @emits session:created When session is successfully established
 * @emits session:error When session creation fails
 */
async function createUserSession(
	userData: UserCredentials,
	sessionOptions: SessionConfig,
): Promise<UserSession> {
	// Implementation
}
```

### MUST document performance characteristics and complexity for algorithms

Include Big O notation and performance considerations for algorithmic functions.

```typescript
/**
 * Performs efficient binary search on sorted array with optimized comparisons.
 *
 * ## Algorithm Characteristics
 * - **Time Complexity**: O(log n) - Logarithmic search time
 * - **Space Complexity**: O(1) - Constant additional memory usage
 * - **Preconditions**: Input array must be sorted in ascending order
 * - **Optimization**: Uses iterative approach to avoid recursion overhead
 *
 * @param sortedArray Pre-sorted array of comparable elements
 * @param targetValue Value to locate within the array
 * @param compareFn Custom comparison function for complex objects
 *
 * @returns Index of target element, or -1 if not found
 *
 * @example
 * ```typescript
 * const numbers = [1, 3, 5, 7, 9, 11, 13];
 * const index = binarySearch(numbers, 7);
 * console.log(index); // => 3
 *
 * // Custom comparison for objects
 * const users = [{id: 1, name: "Alice"}, {id: 2, name: "Bob"}];
 * const userIndex = binarySearch(users, {id: 2}, (a, b) => a.id - b.id);
 * ```
 */
function binarySearch<T>(
	sortedArray: T[],
	targetValue: T,
	compareFn?: (a: T, b: T) => number,
): number {
	// Implementation
}
```

### MUST document integration points and external dependencies

Clearly identify external system interactions and dependency requirements.

```typescript
/**
 * Synchronizes application data with external analytics service.
 * Manages batch uploads and handles connection failures gracefully.
 *
 * ## External Dependencies
 * - **Analytics API**: Requires valid API key and network connectivity
 * - **Local Storage**: Uses IndexedDB for offline event queuing
 * - **Web Workers**: Utilizes background thread for batch processing
 *
 * ## Integration Points
 * - Connects to Google Analytics 4 measurement protocol
 * - Integrates with application error monitoring system
 * - Synchronizes with user preference management service
 *
 * @param eventData Analytics events to synchronize with external service
 * @param syncOptions Configuration for synchronization behavior
 *
 * @returns Synchronization result with success/failure details
 *
 * @throws {NetworkError} When analytics service is unreachable
 * @throws {AuthenticationError} When API key is invalid or expired
 * @throws {QuotaExceededError} When rate limits are exceeded
 */
async function syncAnalyticsData(
	eventData: AnalyticsEvent[],
	syncOptions: SyncConfiguration,
): Promise<SyncResult> {
	// Implementation
}
```

### MUST include version compatibility and deprecation notices

Document API versions, compatibility requirements, and deprecation timelines.

```typescript
/**
 * Legacy user authentication method with planned deprecation.
 *
 * @deprecated Since version 2.1.0. Use `authenticateUserOAuth` instead.
 * @removal Scheduled for removal in version 3.0.0 (Q2 2024)
 *
 * ## Migration Guide
 * Replace `authenticateUser(username, password)` with:
 * ```typescript
 * const result = await authenticateUserOAuth({
 *   provider: 'local',
 *   credentials: { username, password }
 * });
 * ```
 *
 * @param username User identifier for authentication
 * @param password Plain text password (will be hashed internally)
 *
 * @returns Authentication result with session token
 */
function authenticateUser(username: string, password: string): AuthResult {
	// Legacy implementation
}
```

### MUST provide detailed examples with realistic data and error scenarios

Include comprehensive examples showing both success and failure cases.

```typescript
/**
 * Processes payment transactions with comprehensive validation and error handling.
 *
 * @param paymentData Transaction details including amount and payment method
 * @param merchantConfig Merchant-specific configuration and credentials
 *
 * @returns Payment processing result with transaction details
 *
 * @throws {PaymentError} When payment processing fails
 * @throws {ValidationError} When payment data is invalid
 *
 * @example
 * **Successful payment processing:**
 * ```typescript
 * const paymentData = {
 *   amount: 29.99,
 *   currency: 'USD',
 *   paymentMethod: {
 *     type: 'credit_card',
 *     cardNumber: '4111111111111111',
 *     expiryDate: '12/25',
 *     cvv: '123'
 *   }
 * };
 *
 * const merchantConfig = {
 *   apiKey: 'sk_test_123456789',
 *   webhookUrl: 'https://api.example.com/webhooks/payment'
 * };
 *
 * try {
 *   const result = await processPayment(paymentData, merchantConfig);
 *   console.log(`Payment successful: ${result.transactionId}`);
 * } catch (error) {
 *   if (error instanceof PaymentError) {
 *     console.error(`Payment failed: ${error.message}`);
 *     console.error(`Error code: ${error.code}`);
 *   }
 * }
 * ```
 *
 * @example
 * **Error handling scenarios:**
 * ```typescript
 * // Invalid card number
 * try {
 *   await processPayment({
 *     amount: 100,
 *     currency: 'USD',
 *     paymentMethod: { type: 'credit_card', cardNumber: 'invalid' }
 *   }, merchantConfig);
 * } catch (error) {
 *   // Throws ValidationError: Invalid credit card number format
 * }
 *
 * // Insufficient funds
 * try {
 *   await processPayment(validPaymentData, merchantConfig);
 * } catch (error) {
 *   // Throws PaymentError: Insufficient funds available
 * }
 * ```
 */
async function processPayment(
	paymentData: PaymentData,
	merchantConfig: MerchantConfig,
): Promise<PaymentResult> {
	// Implementation
}
```

## Enforcement and Quality Assurance

### MUST validate JSDoc completeness through automated tooling

All JSDoc comments must pass validation for:

- Required tag presence (`@param`, `@returns`, `@throws`)
- Description completeness and clarity
- Example code syntax validity
- Cross-reference link integrity
- Markdown formatting correctness

### MUST maintain consistency with established patterns

Follow established documentation patterns within the codebase to ensure uniform AI comprehension and developer experience.

### MUST update documentation with code changes

JSDoc comments must be updated simultaneously with code modifications to prevent documentation drift and maintain accuracy for AI-assisted development tools.
