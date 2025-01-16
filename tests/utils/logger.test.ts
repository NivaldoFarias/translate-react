import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import chalk from "chalk";

import Logger from "../../src/utils/logger";

describe("Logger", () => {
	let logger: Logger;
	let originalEnv: string | undefined;
	let originalBunEnv: string | undefined;
	let mockOra: any;

	beforeEach(() => {
		originalEnv = process.env.NODE_ENV;
		originalBunEnv = process.env["BUN_ENV"];

		// Setup clean environment
		process.env.NODE_ENV = "development";
		process.env["BUN_ENV"] = undefined;

		// Mock ora with proper method tracking
		const mockMethods = {
			start: 0,
			stop: 0,
			succeed: 0,
			fail: 0,
			warn: 0,
			info: 0,
		};

		let spinnerText = "";
		let isSpinning = false;

		mockOra = {
			start: mock(() => {
				mockMethods.start++;
				isSpinning = true;
				return mockOra;
			}),
			stop: mock(() => {
				if (isSpinning) {
					mockMethods.stop++;
					isSpinning = false;
				}
				return mockOra;
			}),
			succeed: mock(() => {
				mockMethods.succeed++;
				isSpinning = false;
				return mockOra;
			}),
			fail: mock(() => {
				mockMethods.fail++;
				isSpinning = false;
				return mockOra;
			}),
			warn: mock(() => {
				mockMethods.warn++;
				isSpinning = false;
				return mockOra;
			}),
			info: mock(() => {
				mockMethods.info++;
				isSpinning = false;
				return mockOra;
			}),
			get isSpinning() {
				return isSpinning;
			},
			get text() {
				return spinnerText;
			},
			set text(value: string) {
				spinnerText = value;
			},
			_methods: mockMethods,
		};

		// Create a new mock function that returns our mockOra
		mock.module("ora", () => () => mockOra);

		logger = new Logger();
	});

	afterEach(() => {
		process.env.NODE_ENV = originalEnv;
		process.env["BUN_ENV"] = originalBunEnv;
		mock.restore();
	});

	test("should log section headers", () => {
		const spy = spyOn(console, "log");
		logger.section("Test Section");
		expect(spy).toHaveBeenCalledWith(chalk.bold.blue("\n=== Test Section ===\n"));
	});

	test("should log progress updates", () => {
		logger.progress(1, 10, "Processing");
		expect(mockOra.text).toBe("Processing (1/10 - 10%)");
		expect(mockOra._methods.start).toBe(1);
	});

	test("should format objects for logging", () => {
		const testObj = { key: "value" };
		logger.debug(`Debug object: ${JSON.stringify(testObj)}`);
		expect(mockOra._methods.info).toBe(1);
	});

	test("should handle different log levels", () => {
		logger.info("Info message");
		logger.error("Error message");
		logger.warn("Warning message");

		expect(mockOra._methods.info).toBe(1);
		expect(mockOra._methods.fail).toBe(1);
		expect(mockOra._methods.warn).toBe(1);
	});

	test("should handle debug logs based on environment", () => {
		// Test production
		process.env.NODE_ENV = "production";
		logger = new Logger();
		logger.debug("Debug in production");
		expect(mockOra._methods.info).toBe(0);

		// Test development
		process.env.NODE_ENV = "development";
		logger = new Logger();
		logger.debug("Debug in development");
		expect(mockOra._methods.info).toBe(1);
	});

	test("should respect test environment", () => {
		process.env.NODE_ENV = "test";
		const logger = new Logger();

		logger.debug("Test message");
		logger.info("Test message");
		logger.warn("Test message");
		logger.error("Test message");

		expect(mockOra._methods.info).toBe(0);
		expect(mockOra._methods.fail).toBe(0);
		expect(mockOra._methods.warn).toBe(0);
	});

	test("should format objects for logging in different environments", () => {
		const testObj = { key: "value", number: 42 };

		// Test in development
		process.env.NODE_ENV = "development";
		process.env["BUN_ENV"] = undefined;
		const devLogger = new Logger();
		const formattedDev = devLogger.formatObject(testObj);
		expect(formattedDev).toBe(`${chalk.gray("key")}: value, ${chalk.gray("number")}: 42`);

		// Test in test environment
		process.env.NODE_ENV = "test";
		const testLogger = new Logger();
		const formattedTest = testLogger.formatObject(testObj);
		expect(formattedTest).toBe("");
	});
});
