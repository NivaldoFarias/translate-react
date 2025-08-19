---
description: Enforces comprehensive TypeScript coding standards optimized for AI/LLM comprehension and type safety
applyTo: "*.ts,**.*.ts,*.js,*.*.js"
---

# TypeScript Coding Standards for AI-Optimized Development

## Module System and Import Management

### MUST prefix Node.js native modules with `node:` protocol for explicit disambiguation

Explicit protocol prefixes enable better AI understanding of module origins and improve tooling support.

```typescript
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const data = await fs.readFile("dir/file-path.txt", "utf8");
```

### MUST utilize path mapping aliases as defined in `tsconfig.json` for internal module imports

Path mapping provides consistent module resolution and improves AI comprehension of project structure.

```typescript
import { userSchema } from "@/schemas/user.schema";
import { DatabaseService } from "@/services/database.service";
import { ValidationError } from "@/types/errors";

// Implementation details
```

**EXCEPTION**: When `compilerOptions.paths` is not configured in `tsconfig.json`, use relative imports with explicit file extensions.

```typescript
import { UserType } from "../types/user.types.js";

import { helperFunction } from "./utils/helper.util.js";
```

### MUST import TypeScript types and interfaces separately from runtime values

Separate type imports enhance build optimization and provide clear semantic distinction for AI analysis.

```typescript
import type { DatabaseConnection } from "@/types/database.types";
import type { User, UserCreateInput, UserUpdateInput } from "@/types/user.types";

import { processUserData } from "@/services/user.service";

const user: User = await processUserData(userData);
```

### MUST use explicit import syntax for better tree-shaking and AI comprehension

Named imports provide precise dependency tracking and enable superior static analysis.

```typescript
// ✅ CORRECT - Explicit named imports
import { SessionService, UserService } from "@/services/auth.services";
import * as services from "@/services/auth.services";
import { normalizePhoneNumber, validateEmail } from "@/utils/validation.util";
// ❌ INCORRECT - Ambiguous wildcard imports
import * as utils from "@/utils/validation.util";
```

## Type System and Annotations

### MUST explicitly annotate function and method return types for AI comprehension

Explicit return type annotations enable better AI context understanding and prevent type inference ambiguity.

```typescript
/**
 * Retrieves user data from external API with comprehensive error handling.
 * Implements retry logic and response validation for robust data fetching.
 *
 * @param userId Unique identifier for the target user
 *
 * @returns Promise resolving to user data object with validated structure
 */
async function fetchUserData(userId: string): Promise<Record<string, unknown>> {
	const response = await fetch(`/api/users/${userId}`);

	return await response.json();
}
```

```typescript
/**
 * Performs generic data transformation with type-safe operations.
 * Utilizes TypeScript generics for maximum reusability across data types.
 *
 * @param data Input data of generic type T
 *
 * @returns Transformed data maintaining type safety through generic constraints
 */
async function transformData<T>(data: T): Promise<T> {
	const response = await fetch("/api/transform", {
		method: "POST",
		body: JSON.stringify(data),
	});

	return await response.json();
}
```

### MUST prioritize `unknown` over `any` for type-safe unknown value handling

The `unknown` type provides better type safety and forces explicit type checking before usage.

```typescript
/**
 * Processes untrusted external API response with type validation.
 * Uses unknown type to enforce runtime type checking before access.
 */
async function processApiResponse(): Promise<unknown> {
	const response = await fetch("/api/external");
	const data: unknown = await response.json();

	// Type checking required before usage
	if (typeof data === "object" && data !== null) {
		return data;
	}

	throw new TypeError("Invalid API response format");
}
```

### MUST utilize `Array<T>` syntax for array type annotations to enhance readability

Array type syntax provides consistent formatting and improves AI parsing capabilities.

```typescript
const userIds: Array<string> = ["user-1", "user-2", "user-3"];
const coordinates: Array<[number, number]> = [
	[0, 0],
	[1, 1],
	[2, 2],
];
const userProfiles: Array<{ id: string; name: string; email: string }> = [];
```

### MUST prefer `Record<string, T>` over index signature syntax for object types

Record type syntax provides clearer semantic meaning and better tooling support.

```typescript
// ✅ CORRECT - Semantic record type
const userPreferences: Record<string, boolean> = {
	darkMode: true,
	notifications: false,
	autoSave: true,
};

const apiEndpoints: Record<string, string> = {
	users: "/api/v1/users",
	posts: "/api/v1/posts",
	auth: "/api/v1/auth",
};

// ❌ INCORRECT - Generic index signature
const preferences: { [key: string]: boolean } = {
	darkMode: true,
	notifications: false,
};
```

### MUST employ strict null checking with explicit optional property syntax

Explicit optional properties enhance type safety and prevent runtime errors.

```typescript
interface UserProfile {
	readonly id: string;
	readonly email: string;
	readonly name: string;
	readonly avatarUrl?: string; // Explicit optional property
	readonly lastLoginDate?: Date; // May be undefined for new users
	readonly preferences: Record<string, unknown>;
}

/**
 * Updates user profile with partial data and maintains type safety.
 * Handles optional fields gracefully while preserving required properties.
 */
function updateUserProfile(
	userId: string,
	updates: Partial<Pick<UserProfile, "name" | "avatarUrl" | "preferences">>,
): Promise<UserProfile> {
	// Implementation with proper null checking
	return Promise.resolve({} as UserProfile);
}
```

### MUST utilize union types for precise value constraints and better AI understanding

Union types provide explicit value constraints and improve code documentation.

```typescript
type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type DatabaseDriver = "mysql" | "postgresql" | "sqlite" | "mongodb";

interface ApiConfiguration {
	readonly method: HttpMethod;
	readonly endpoint: string;
	readonly timeout: number;
	readonly retryCount: 0 | 1 | 2 | 3; // Explicit retry count limits
}
```

## Object-Oriented Programming Standards

### MUST utilize explicit access modifiers for all class members to enhance AI comprehension

Explicit access modifiers provide clear encapsulation semantics and improve code maintainability.

```typescript
/**
 * Service class for managing user authentication and session lifecycle.
 * Implements secure authentication patterns with proper encapsulation.
 */
class AuthenticationService {
	/**
	 * Creates authentication service instance with required dependencies.
	 * Initializes internal state and establishes database connections.
	 */
	public constructor(
		private readonly databaseClient: DatabaseClient,
		private readonly tokenService: TokenService,
		private readonly logger: Logger,
	) {}

	/**
	 * Authenticates user credentials and establishes secure session.
	 * Validates input data and creates persistent authentication state.
	 */
	public async authenticateUser(credentials: UserCredentials): Promise<AuthenticationResult> {
		this.logger.info("Starting user authentication process");

		const validatedCredentials = await this.validateCredentials(credentials);
		const authToken = await this.tokenService.generateToken(validatedCredentials.userId);

		return {
			success: true,
			token: authToken,
			expiresAt: new Date(Date.now() + 3_600_000), // 1 hour
		};
	}

	/**
	 * Validates user credentials against stored authentication data.
	 * Implements secure password comparison and account status verification.
	 */
	private async validateCredentials(credentials: UserCredentials): Promise<ValidatedUser> {
		// Private implementation details
		return {} as ValidatedUser;
	}

	/**
	 * Retrieves current authentication configuration settings.
	 * Provides read-only access to service configuration state.
	 */
	protected getAuthConfiguration(): Readonly<AuthConfiguration> {
		return this.authConfig;
	}

	private readonly authConfig: AuthConfiguration = {
		tokenExpiration: 3_600_000,
		maxLoginAttempts: 5,
		passwordMinLength: 8,
	};
}
```

### MUST implement readonly properties for immutable data and configuration

Readonly properties provide compile-time immutability guarantees and improve code safety.

```typescript
interface ApiConfiguration {
	readonly baseUrl: string;
	readonly apiKey: string;
	readonly timeout: number;
	readonly retryPolicy: Readonly<{
		maxAttempts: number;
		backoffMultiplier: number;
		initialDelay: number;
	}>;
}

class ConfigurationManager {
	public constructor(private readonly config: Readonly<ApiConfiguration>) {}

	/**
	 * Retrieves immutable configuration snapshot for external consumers.
	 * Prevents accidental configuration modification and maintains system stability.
	 */
	public getConfiguration(): Readonly<ApiConfiguration> {
		return this.config;
	}
}
```

## Code Documentation and Semantic Clarity

### MUST employ JSDoc comments exclusively for all code documentation

JSDoc comments provide structured documentation that enhances AI comprehension and enables automated tooling.

**NEVER use inline comments (`//`) anywhere in the codebase**

```typescript
/**
 * Processes payment transactions with comprehensive validation and fraud detection.
 * Implements multi-layer security checks and maintains transaction audit trails.
 *
 * @param paymentData Transaction details including amount and payment method
 * @param merchantConfig Merchant-specific configuration and credentials
 *
 * @returns Payment processing result with transaction details and status
 *
 * @throws {ValidationError} When payment data fails schema validation
 * @throws {FraudDetectionError} When transaction triggers fraud prevention rules
 * @throws {PaymentGatewayError} When external payment service fails
 */
async function processPayment(
	paymentData: PaymentTransactionData,
	merchantConfig: MerchantConfiguration,
): Promise<PaymentProcessingResult> {
	/**
	 * Validates payment data against predefined schema constraints.
	 * Ensures all required fields are present and correctly formatted.
	 */
	const validatedData = await this.validatePaymentData(paymentData);

	/**
	 * Executes fraud detection algorithms on transaction data.
	 * Analyzes patterns and flags suspicious activity for manual review.
	 */
	const fraudCheckResult = await this.performFraudDetection(validatedData);

	return { success: true, transactionId: "tx_123456" };
}
```

### MUST utilize underscore separators in large numeric literals for enhanced readability

Numeric separators improve readability and reduce counting errors in large numbers.

```typescript
/**
 * Application configuration constants with optimized readability.
 * Uses underscore separators for multi-digit numeric values.
 */
const ApplicationConstants = {
	MAX_FILE_UPLOAD_SIZE: 50_000_000, // 50MB in bytes
	DATABASE_CONNECTION_TIMEOUT: 30_000, // 30 seconds in milliseconds
	CACHE_EXPIRATION_TIME: 3_600_000, // 1 hour in milliseconds
	MAX_CONCURRENT_REQUESTS: 1_000,
	RATE_LIMIT_WINDOW: 900_000, // 15 minutes in milliseconds
} as const;

/**
 * Exception for values where readability improvement is minimal.
 * Small numbers remain without separators for clarity.
 */
const ServerConfiguration = {
	PORT: 3000,
	WORKERS: 4,
	RETRIES: 3,
} as const;
```

## Variable Naming and Semantic Conventions

### MUST employ descriptive, unabbreviated variable names for enhanced AI comprehension

Descriptive variable names improve code readability and enable better AI-assisted development.

```typescript
/**
 * User data processing with semantically meaningful variable names.
 * Prioritizes clarity over brevity for enhanced maintainability.
 */
async function processUserRegistration(userData: UserRegistrationData): Promise<User> {
	const validatedUserData = await validateUserInput(userData);
	const hashedPassword = await hashUserPassword(validatedUserData.password);
	const userProfile = await createUserProfile(validatedUserData);
	const welcomeEmailContent = await generateWelcomeEmail(userProfile);

	await sendNotificationEmail(userProfile.email, welcomeEmailContent);

	return userProfile;
}

// ❌ INCORRECT - Abbreviated variable names
async function processUser(data: UserData): Promise<User> {
	const vData = await validate(data);
	const hPwd = await hash(vData.pwd);
	const prof = await create(vData);

	return prof;
}
```

### MUST extract complex conditional logic into semantically named variables or functions

Named conditionals improve code readability and enable better AI analysis of business logic.

```typescript
/**
 * User access control with explicit conditional logic extraction.
 * Improves readability and maintains clear business rule documentation.
 */
async function authorizeUserAccess(user: User, resource: Resource): Promise<boolean> {
	const hasValidSubscription =
		user.subscription.isActive && user.subscription.expiresAt > new Date();
	const hasRequiredPermissions = user.permissions.includes(resource.requiredPermission);
	const isNotSuspended = !user.account.isSuspended;
	const hasRecentActivity = user.lastActivityDate > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

	const isUserEligibleForAccess =
		hasValidSubscription && hasRequiredPermissions && isNotSuspended && hasRecentActivity;

	if (isUserEligibleForAccess) {
		await logAccessAttempt(user.id, resource.id, "granted");
		return true;
	}

	await logAccessAttempt(user.id, resource.id, "denied");
	return false;
}

/**
 * Alternative approach for highly complex conditional logic.
 * Utilizes dedicated functions for enhanced modularity and testability.
 */
function evaluateUserEligibility(user: User): boolean {
	const subscriptionStatus = evaluateSubscriptionStatus(user.subscription);
	const permissionLevel = evaluatePermissionLevel(user.permissions);
	const accountStatus = evaluateAccountStatus(user.account);

	return subscriptionStatus && permissionLevel && accountStatus;
}
```

## Advanced Type System Features for AI Optimization

### MUST leverage conditional types for advanced type relationships and constraints

Conditional types provide sophisticated type manipulation capabilities that enhance AI understanding.

```typescript
/**
 * Conditional type utility for API response handling with type safety.
 * Enables different return types based on success/failure states.
 */
type ApiResponse<T, TSuccess extends boolean = true> =
	TSuccess extends true ?
		{
			success: true;
			data: T;
			timestamp: Date;
		}
	:	{
			success: false;
			error: string;
			errorCode: number;
			timestamp: Date;
		};

/**
 * Generic API client with conditional response types.
 * Provides type-safe handling of both success and error scenarios.
 */
async function fetchApiData<T>(endpoint: string): Promise<ApiResponse<T, boolean>> {
	try {
		const response = await fetch(endpoint);
		const data = await response.json();

		return {
			success: true,
			data,
			timestamp: new Date(),
		} as ApiResponse<T, true>;
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
			errorCode: 500,
			timestamp: new Date(),
		} as ApiResponse<T, false>;
	}
}
```

### MUST implement mapped types for systematic property transformations

Mapped types enable consistent property transformations across related type definitions.

```typescript
/**
 * Utility types for database entity transformations.
 * Provides consistent patterns for data layer type mappings.
 */
type DatabaseEntity<T> = {
	readonly [K in keyof T]: T[K];
} & {
	readonly id: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
};

type PartialUpdate<T> = {
	readonly [K in keyof T]?: T[K];
} & {
	readonly updatedAt: Date;
};

/**
 * User entity with comprehensive type safety and database integration.
 * Demonstrates practical application of mapped type utilities.
 */
interface User {
	name: string;
	email: string;
	isActive: boolean;
}

type DatabaseUser = DatabaseEntity<User>;
type UserUpdateData = PartialUpdate<Pick<User, "name" | "isActive">>;

/**
 * Type-safe user update operations with mapped type constraints.
 * Ensures data integrity and prevents unauthorized property modifications.
 */
async function updateUser(userId: string, updates: UserUpdateData): Promise<DatabaseUser> {
	// Implementation with full type safety
	return {} as DatabaseUser;
}
```

### MUST utilize template literal types for string manipulation and validation

Template literal types provide compile-time string validation and manipulation capabilities.

```typescript
/**
 * Template literal types for API endpoint management.
 * Ensures type-safe URL construction and route validation.
 */
type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";
type ApiVersion = "v1" | "v2" | "v3";
type ResourceType = "users" | "posts" | "comments" | "files";

type ApiEndpoint<
	TVersion extends ApiVersion = "v1",
	TResource extends ResourceType = ResourceType,
	TAction extends string = string,
> = `/api/${TVersion}/${TResource}${TAction extends "" ? "" : `/${TAction}`}`;

/**
 * Type-safe API client with template literal endpoint validation.
 * Prevents runtime errors from malformed URL construction.
 */
class TypeSafeApiClient {
	/**
	 * Executes API requests with compile-time endpoint validation.
	 * Ensures URL correctness and prevents common routing errors.
	 */
	public async request<T>(
		method: HttpMethod,
		endpoint: ApiEndpoint,
		data?: Record<string, unknown>,
	): Promise<T> {
		const response = await fetch(endpoint, {
			method,
			body: data ? JSON.stringify(data) : undefined,
		});

		return await response.json();
	}
}

// Usage examples with compile-time validation
const client = new TypeSafeApiClient();
await client.request("GET", "/api/v1/users"); // ✅ Valid
await client.request("POST", "/api/v2/posts/create"); // ✅ Valid
// await client.request("GET", "/invalid/endpoint"); // ❌ Type error
```

## Performance and Bundle Optimization for AI-Assisted Development

### MUST implement tree-shaking friendly exports for optimal bundle sizes

Structured exports enable better static analysis and automated optimization.

```typescript
/**
 * Email validation utility with RFC 5322 compliance checking.
 * Implements comprehensive validation logic for production use.
 */
export function validateEmailAddress(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

/**
 * Phone number normalization utility with international format support.
 * Standardizes phone number formats for consistent data storage.
 */
export function normalizePhoneNumber(phone: string): string {
	return phone.replace(/\D/g, "");
}

/**
 * Password strength evaluation with configurable complexity requirements.
 * Provides detailed feedback for user password creation guidance.
 */
export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
	return {
		score: 0,
		feedback: [],
		isValid: false,
	};
}

// Barrel export with explicit named exports
export type { PasswordStrengthResult } from "./types/validation.types";
```

### MUST employ const assertions for immutable literal types

Const assertions provide compile-time immutability and better type inference.

```typescript
/**
 * Application configuration with const assertions for type safety.
 * Prevents accidental modification and enables better tooling support.
 */
export const DATABASE_CONFIG = {
	host: "localhost",
	port: 5432,
	database: "app_production",
	ssl: true,
	connectionPool: {
		min: 2,
		max: 10,
		idle: 30_000,
	},
} as const;

export const SUPPORTED_LANGUAGES = ["en", "es", "fr", "de", "ja"] as const;
export const API_RATE_LIMITS = [10, 100, 1000, 10_000] as const;

/**
 * Type extraction from const assertions for enhanced type safety.
 * Creates derived types that maintain literal value constraints.
 */
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type RateLimitTier = (typeof API_RATE_LIMITS)[number];
export type DatabaseConfiguration = typeof DATABASE_CONFIG;
```

## Error Handling and Type Safety Patterns

### MUST implement discriminated unions for robust error handling

Discriminated unions provide type-safe error handling patterns that improve AI analysis.

```typescript
/**
 * Result type pattern for comprehensive error handling.
 * Enables type-safe error propagation without exceptions.
 */
type Result<TData, TError = Error> =
	| { readonly success: true; readonly data: TData }
	| { readonly success: false; readonly error: TError };

/**
 * Custom error types for specific failure scenarios.
 * Provides detailed error context for debugging and monitoring.
 */
interface ValidationError {
	readonly type: "validation";
	readonly field: string;
	readonly message: string;
	readonly code: string;
}

interface NetworkError {
	readonly type: "network";
	readonly status: number;
	readonly message: string;
	readonly retryable: boolean;
}

type ApiError = ValidationError | NetworkError;

/**
 * Type-safe API operation with comprehensive error handling.
 * Demonstrates practical application of discriminated union patterns.
 */
async function safeApiOperation(data: unknown): Promise<Result<User, ApiError>> {
	try {
		const validatedData = await validateUserData(data);
		const user = await createUser(validatedData);

		return { success: true, data: user };
	} catch (error) {
		if (error instanceof ValidationError) {
			return {
				success: false,
				error: {
					type: "validation",
					field: error.field,
					message: error.message,
					code: error.code,
				},
			};
		}

		return {
			success: false,
			error: {
				type: "network",
				status: 500,
				message: "Internal server error",
				retryable: true,
			},
		};
	}
}
```

### MUST utilize branded types for enhanced type safety and domain modeling

Branded types prevent primitive obsession and provide stronger type guarantees.

```typescript
/**
 * Branded type utilities for domain-specific primitive values.
 * Prevents accidental mixing of semantically different values.
 */
declare const __brand: unique symbol;
type Brand<T, TBrand extends string> = T & { readonly [__brand]: TBrand };

type UserId = Brand<string, "UserId">;
type EmailAddress = Brand<string, "EmailAddress">;
type PhoneNumber = Brand<string, "PhoneNumber">;
type Timestamp = Brand<number, "Timestamp">;

/**
 * Factory functions for creating branded type instances.
 * Provides validation and type safety for domain-specific values.
 */
function createUserId(value: string): UserId {
	if (!value || value.length < 10) {
		throw new Error("Invalid user ID format");
	}
	return value as UserId;
}

function createEmailAddress(value: string): EmailAddress {
	if (!validateEmailAddress(value)) {
		throw new Error("Invalid email address format");
	}
	return value as EmailAddress;
}

/**
 * Type-safe user operations with branded type enforcement.
 * Prevents common errors from primitive value confusion.
 */
async function getUserProfile(userId: UserId): Promise<UserProfile> {
	// Implementation guaranteed to receive valid UserId
	return {} as UserProfile;
}

// Usage demonstrates compile-time safety
const validUserId = createUserId("user_1234567890");
await getUserProfile(validUserId); // ✅ Type-safe

// const invalidUsage = await getUserProfile("raw-string"); // ❌ Type error
```

## Enforcement and Quality Assurance Standards

### MUST configure TypeScript compiler with strict mode and additional safety flags

Strict TypeScript configuration enables maximum type safety and better AI-assisted development.

```json
// tsconfig.json optimization for AI-assisted development
{
	"compilerOptions": {
		"strict": true, // Enable all strict type checking options
		"noUncheckedIndexedAccess": true, // Prevent unsafe array/object access
		"noImplicitReturns": true, // Require explicit returns in all code paths
		"noFallthroughCasesInSwitch": true, // Prevent switch case fallthrough
		"noImplicitOverride": true, // Require explicit override keywords
		"exactOptionalPropertyTypes": true, // Strict optional property handling
		"noPropertyAccessFromIndexSignature": true, // Prefer bracket notation for dynamic access
		"noUnusedLocals": true, // Flag unused local variables
		"noUnusedParameters": true, // Flag unused function parameters
		"allowUnreachableCode": false, // Flag unreachable code blocks
		"allowUnusedLabels": false // Flag unused labels
	}
}
```

### MUST implement consistent code formatting through automated tooling

Automated formatting ensures consistency and improves AI code analysis capabilities.

```typescript
/**
 * Formatting configuration example demonstrating preferred patterns.
 * Maintains consistency across team development and AI-assisted coding.
 */
const FORMATTING_PREFERENCES = {
	indentation: "tabs", // Use tabs for indentation
	lineLength: 100, // Maximum line length for readability
	trailingCommas: "es5", // Trailing commas for cleaner diffs
	semicolons: true, // Always use semicolons
	quotes: "double", // Prefer double quotes for strings
	bracketSpacing: true, // Spaces inside object literals
} as const;

/**
 * Example of properly formatted TypeScript code following project standards.
 * Demonstrates consistent spacing, line breaks, and structural organization.
 */
export class ExampleService {
	public constructor(
		private readonly logger: Logger,
		private readonly database: DatabaseClient,
		private readonly cache: CacheService,
	) {}

	public async processData(
		inputData: InputData,
		options: ProcessingOptions = {},
	): Promise<ProcessedResult> {
		const { enableCaching = true, validateInput = true } = options;

		if (validateInput) {
			await this.validateInputData(inputData);
		}

		const cachedResult = enableCaching ? await this.cache.get(inputData.id) : null;

		if (cachedResult) {
			this.logger.info("Returning cached result", { id: inputData.id });
			return cachedResult;
		}

		const result = await this.performProcessing(inputData);

		if (enableCaching) {
			await this.cache.set(inputData.id, result, { ttl: 3_600 });
		}

		return result;
	}

	private async validateInputData(data: InputData): Promise<void> {
		// Validation implementation
	}

	private async performProcessing(data: InputData): Promise<ProcessedResult> {
		// Processing implementation
		return {} as ProcessedResult;
	}
}
```

### MUST maintain type definitions synchronized with runtime implementations

Type definition accuracy ensures reliable AI-assisted development and prevents runtime errors.

```typescript
/**
 * Interface definitions that accurately reflect runtime data structures.
 * Maintains synchronization between types and actual implementation.
 */
interface ApiResponse<T> {
	readonly success: boolean;
	readonly data?: T;
	readonly error?: string;
	readonly timestamp: string; // ISO 8601 format
	readonly requestId: string;
}

/**
 * Runtime validation functions that enforce interface contracts.
 * Ensures type safety at application boundaries.
 */
function validateApiResponse<T>(response: unknown): ApiResponse<T> {
	if (typeof response !== "object" || response === null) {
		throw new TypeError("Invalid response format");
	}

	const typed = response as Record<string, unknown>;

	if (typeof typed.success !== "boolean") {
		throw new TypeError("Missing or invalid success field");
	}

	if (typeof typed.timestamp !== "string") {
		throw new TypeError("Missing or invalid timestamp field");
	}

	if (typeof typed.requestId !== "string") {
		throw new TypeError("Missing or invalid requestId field");
	}

	return typed as ApiResponse<T>;
}
```

## Integration with Modern Development Tooling

### MUST configure ESLint rules for TypeScript-specific best practices

TypeScript-specific linting rules enhance code quality and maintain consistency.

```typescript
// ✅ CORRECT - Prefer type-only imports when possible
import type { UserConfiguration } from "./types/user.types";

import { processUser } from "./services/user.service";
```

#### Example of code following TypeScript ESLint best practices.

Demonstrates preferred patterns for AI-optimized development.

```typescript
// ✅ CORRECT - Explicit function return types
async function fetchUserData(id: string): Promise<User | null> {
	const response = await this.database.findUser(id);
	return response ?? null;
}
```

```typescript
// ✅ CORRECT - Proper nullish coalescing
const userName = user.name ?? "Anonymous User";
const userAge = user.age ?? 0;
```

```typescript
// ✅ CORRECT - Explicit type parameters
const users = new Map<string, User>();
const results = new Set<ProcessingResult>();
```

### MUST utilize TypeScript project references for monorepo optimization

Project references enable better build performance and dependency management in complex projects.

### Example demonstrating proper project reference patterns.

Enables optimized builds and better AI workspace understanding.

```json
// packages/shared/tsconfig.json
{
	"compilerOptions": {
		"composite": true,
		"declaration": true,
		"declarationMap": true,
		"outDir": "./dist"
	},
	"include": ["src/**/*"]
}
```

```json
// packages/api/tsconfig.json
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": {
		"outDir": "./dist"
	},
	"references": [{ "path": "../shared" }]
}
```

### Cross-package type-safe imports with project references.

Enables better dependency tracking and build optimization.

```typescript
import { validateInput } from "@shared/utils/validation";

import type { SharedConfiguration } from "@shared/types/configuration";
```
