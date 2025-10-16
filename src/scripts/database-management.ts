#!/usr/bin/env bun
import { z } from "zod";

import { DatabaseService } from "@/services/database/";

/** Available database management actions */
export enum DatabaseAction {
	/** Validate database integrity */
	Validate = "validate",

	/** Clean old snapshots */
	Clean = "clean",

	/** Inspect database statistics */
	Inspect = "inspect",

	/** Show database file size */
	Size = "size",
}

/**
 * CLI arguments schema for parsing raw command line input.
 *
 * Validates and transforms string arguments into properly typed values.
 */
const cliArgsSchema = z.object({
	/** Action name from command line */
	action: z.string(),

	/** Optional keep count flag value */
	keep: z.string().optional(),

	/** Optional JSON output flag */
	json: z.literal("true").optional(),
});

/** CLI options schema for runtime validation after parsing */
const cliOptionsSchema = z.object({
	action: z.enum(DatabaseAction),
	keep: z.number().int().positive().optional(),
	json: z.boolean().optional().default(false),
});

/** Parsed and validated CLI options */
export type CliOptions = z.infer<typeof cliOptionsSchema>;

if (import.meta.main) {
	void main();
}

/**
 * Parses and validates command line arguments using Zod schemas.
 *
 * Extracts action and flags from {@link process.argv}, validates them against
 * defined schemas, and returns typed CLI options. Exits with error code 1
 * if validation fails or arguments are malformed.
 *
 * @returns Validated and typed CLI options
 *
 * @example
 * ```typescript
 * // Command: bun run db:clean -- --keep 5 --json
 * const options = parseArgs();
 * // ^? { action: "clean", keep: 5, json: true }
 * ```
 *
 * @see {@link cliArgsSchema} for raw argument parsing
 * @see {@link cliOptionsSchema} for typed validation
 */
function parseArgs(): CliOptions {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.error("Error: No action specified");
		printUsage();
		process.exit(1);
	}

	const rawArgs: Record<string, string> = {
		action: args[0] ?? "",
	};

	for (let index = 1; index < args.length; index++) {
		const arg = args[index];

		if (arg === "--keep") {
			rawArgs["keep"] = args[index + 1] ?? "";
			index++;
		} else if (arg === "--json") {
			rawArgs["json"] = "true";
		}
	}

	try {
		const parsedArgs = cliArgsSchema.parse(rawArgs);
		const options = cliOptionsSchema.parse({
			action: parsedArgs.action,
			keep: parsedArgs.keep ? Number.parseInt(parsedArgs.keep, 10) : undefined,
			json: parsedArgs.json === "true",
		});

		return options;
	} catch (error) {
		if (error instanceof z.ZodError) {
			console.error("Error: Invalid arguments");
			for (const issue of error.issues) {
				console.error(`  ${issue.path.join(".")}: ${issue.message}`);
			}
		} else {
			console.error("Error:", error instanceof Error ? error.message : "Unknown error");
		}
		printUsage();
		process.exit(1);
	}
}

/**
 * Prints CLI usage information to console.
 *
 * Displays comprehensive help text including available actions, options,
 * and usage examples for the database management CLI.
 */
function printUsage(): void {
	console.log(`
Database Management CLI

Usage:
  bun run db:<action> [options]

Actions:
  db:validate    - Check database integrity
  db:clean       - Remove old snapshots (keeps last 10 by default)
  db:inspect     - Show database statistics
  db:size        - Show database file size

Options:
  --keep <n>  - Number of snapshots to keep (for clean action)
  --json      - Output in JSON format

Examples:
  bun run db:validate
  bun run db:clean -- --keep 5
  bun run db:inspect -- --json
  bun run db:size
  `);
}

/**
 * Formats byte count to human-readable size string.
 *
 * Converts raw byte values to appropriate units (Bytes, KB, MB, GB) with
 * two decimal precision for improved readability.
 *
 * @param bytes Number of bytes to format
 *
 * @returns Formatted size string with appropriate unit
 *
 * @example
 * ```typescript
 * formatBytes(0);        // "0 Bytes"
 * formatBytes(1024);     // "1.00 KB"
 * formatBytes(1048576);  // "1.00 MB"
 * formatBytes(5242880);  // "5.00 MB"
 * ```
 */
function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 Bytes";

	const BYTES_PER_UNIT = 1024;
	const UNIT_NAMES = ["Bytes", "KB", "MB", "GB"] as const;
	const unitIndex = Math.floor(Math.log(bytes) / Math.log(BYTES_PER_UNIT));
	const formattedValue = (bytes / Math.pow(BYTES_PER_UNIT, unitIndex)).toFixed(2);

	return `${formattedValue} ${UNIT_NAMES[unitIndex]}`;
}

/**
 * Validates database integrity and outputs results.
 *
 * Performs comprehensive validation checks on all database tables and outputs
 * results in either human-readable or JSON format. Exits with code 1 if
 * validation fails.
 *
 * @param db Database service instance to validate
 * @param options CLI options including output format preference
 *
 * @example
 * ```bash
 * bun run db:validate
 * # Console output: "✅ Database is valid"
 * ```
 *
 * @see {@link DatabaseService.validateDatabase}
 */
function validateDatabase(db: DatabaseService, options: CliOptions): void {
	const result = db.validateDatabase();

	if (options.json) {
		console.log(JSON.stringify(result));
	} else {
		if (result.valid) {
			console.log("✅ Database is valid");
		} else {
			console.error("❌ Database validation failed");
			console.error(`Error: ${result.error}`);
			process.exit(1);
		}
	}
}

/**
 * Removes old snapshots from database and outputs cleanup summary.
 *
 * Deletes old snapshots while retaining the most recent ones based on the
 * `--keep` option (defaults to 10). Performs VACUUM operation to reclaim
 * disk space after deletion.
 *
 * @param db Database service instance to clean
 * @param options CLI options including snapshot retention count and output format
 *
 * @example
 * ```bash
 * # Keep default 10 snapshots
 * bun run db:clean
 *
 * # Keep only last 5 snapshots
 * bun run db:clean -- --keep 5
 * ```
 *
 * @see {@link DatabaseService.cleanOldSnapshots}
 * @see {@link DatabaseService.getDatabaseStats}
 */
function cleanDatabase(db: DatabaseService, options: CliOptions): void {
	const DEFAULT_KEEP_COUNT = 10;
	const keepCount = options.keep ?? DEFAULT_KEEP_COUNT;
	const stats = db.getDatabaseStats();
	const beforeCount = stats.snapshots.count;

	console.log(`Snapshots before cleaning: ${beforeCount}`);
	console.log(`Keeping last ${keepCount} snapshots...`);

	const deletedCount = db.cleanOldSnapshots(keepCount);
	const afterCount = beforeCount - deletedCount;

	if (options.json) {
		console.log(
			JSON.stringify({
				before: beforeCount,
				after: afterCount,
				deleted: deletedCount,
				kept: keepCount,
			}),
		);
	} else {
		console.log(`\n✅ Cleanup complete`);
		console.log(`Snapshots after cleaning: ${afterCount}`);
		console.log(`Removed: ${deletedCount} snapshots`);
	}
}

/**
 * Retrieves and displays comprehensive database statistics.
 *
 * Outputs table counts, recent snapshots, and recently processed files in
 * either human-readable table format or JSON structure.
 *
 * @param db Database service instance to inspect
 * @param options CLI options including output format preference
 *
 * @example
 * ```bash
 * # Human-readable output
 * bun run db:inspect
 *
 * # JSON output
 * bun run db:inspect -- --json
 * ```
 *
 * @see {@link DatabaseService.getDatabaseStats}
 */
function inspectDatabase(db: DatabaseService, options: CliOptions): void {
	const stats = db.getDatabaseStats();

	if (options.json) {
		console.log(JSON.stringify(stats));
		return;
	}

	console.log("\n=== Database Statistics ===\n");
	console.log(`Total Snapshots: ${stats.snapshots.count}`);
	console.log(`Repository Tree Entries: ${stats.repositoryTree.count}`);
	console.log(`Files to Translate: ${stats.filesToTranslate.count}`);
	console.log(`Processed Results: ${stats.processedResults.count}`);
	console.log(`Failed Translations: ${stats.failedTranslations.count}`);
	console.log(`Language Cache Entries: ${stats.languageCache.count}`);

	if (stats.recentSnapshots.length > 0) {
		console.log("\n=== Recent Snapshots ===\n");
		console.table(stats.recentSnapshots);
	}

	if (stats.recentProcessed.length > 0) {
		console.log("\n=== Recent Processed Files ===\n");
		console.table(stats.recentProcessed);
	}
}

/**
 * Retrieves and displays database file size.
 *
 * Checks if the SQLite database file exists and outputs its size in both
 * human-readable format and raw bytes. Exits with code 1 if file not found.
 *
 * @param db Database service instance to check
 * @param options CLI options including output format preference
 *
 * @example
 * ```bash
 * # Human-readable output
 * bun run db:size
 * # Console output: "Database Size: 5.23 MB (5,484,032 bytes)"
 *
 * # JSON output
 * bun run db:size -- --json
 * ```
 *
 * @see {@link DatabaseService.getDatabaseSize}
 */
function showDatabaseSize(db: DatabaseService, options: CliOptions): void {
	const stats = db.getDatabaseSize();

	if (stats === null) {
		if (options.json) {
			console.log(JSON.stringify({ exists: false }));
		} else {
			console.log("❌ Database file not found");
		}
		process.exit(1);
	}

	if (options.json) {
		console.log(
			JSON.stringify({ exists: true, bytes: stats.size, formatted: formatBytes(stats.size) }),
		);
	} else {
		console.log(`Database Size: ${formatBytes(stats.size)} (${stats.toLocaleString()} bytes)`);
	}
}

/**
 * Main CLI entry point for database management operations.
 *
 * Provides command-line tools for database operations including validation,
 * cleanup, inspection, and size reporting capabilities. Parses command line
 * arguments, initializes database service, and delegates to appropriate action
 * handler. Exits with code 0 on success or 1 on error.
 *
 * @example
 * ```bash
 * # Validate database integrity
 * bun run db:validate
 *
 * # Clean old snapshots (keeps last 10 by default)
 * bun run db:clean
 *
 * # Clean old snapshots, keeping last 5
 * bun run db:clean -- --keep 5
 *
 * # Inspect database with human-readable output
 * bun run db:inspect
 *
 * # Inspect database with JSON output
 * bun run db:inspect -- --json
 *
 * # Check database file size
 * bun run db:size
 * ```
 *
 * @see {@link DatabaseService} for database service implementation
 */
function main(): Promise<void> {
	const options = parseArgs();

	try {
		const db = new DatabaseService();

		switch (options.action) {
			case DatabaseAction.Size:
				showDatabaseSize(db, options);
				break;
			case DatabaseAction.Validate:
				validateDatabase(db, options);
				break;
			case DatabaseAction.Clean:
				cleanDatabase(db, options);
				break;
			case DatabaseAction.Inspect:
				inspectDatabase(db, options);
				break;
		}

		process.exit(0);
	} catch (error) {
		if (options.json) {
			console.error(
				JSON.stringify({
					error: true,
					message: error instanceof Error ? error.message : "Unknown error",
				}),
			);
		} else {
			console.error("❌ Error:", error instanceof Error ? error.message : error);
		}

		process.exit(1);
	}
}
