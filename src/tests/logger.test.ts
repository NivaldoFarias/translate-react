import { expect, test, describe, beforeEach, afterEach, spyOn, mock } from "bun:test";
import Logger from "../utils/logger";
import log from "loglevel";

describe("Logger", () => {
  let logger: Logger;
  let originalEnv: string | undefined;
  let originalBunEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    originalBunEnv = process.env.BUN_ENV;

    // Setup clean environment
    process.env.NODE_ENV = 'development';
    process.env.BUN_ENV = undefined;

    // Mock loglevel
    mock.module('loglevel', () => ({
      default: {
        setLevel: mock(() => { }),
        info: mock(() => { }),
        error: mock(() => { }),
        warn: mock(() => { }),
        debug: mock(() => { }),
        levels: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }
      }
    }));

    logger = new Logger();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.env.BUN_ENV = originalBunEnv;
    mock.restore();
  });

  test("should log section headers", () => {
    const spy = spyOn(log, "info");
    logger.section("Test Section");
    expect(spy).toHaveBeenCalled();
  });

  test("should log progress updates", () => {
    const spy = spyOn(process.stdout, "write");
    logger.progress(1, 10, "Processing");
    expect(spy).toHaveBeenCalled();
  });

  test("should format objects for logging", () => {
    const spy = spyOn(log, "debug");
    const testObj = { key: "value" };
    logger.debug(`Debug object: ${JSON.stringify(testObj)}`);
    expect(spy).toHaveBeenCalled();
  });

  test("should handle different log levels", () => {
    const spyInfo = spyOn(log, "info");
    const spyError = spyOn(log, "error");
    const spyWarn = spyOn(log, "warn");

    logger.info("Info message");
    logger.error("Error message");
    logger.warn("Warning message");

    expect(spyInfo).toHaveBeenCalled();
    expect(spyError).toHaveBeenCalled();
    expect(spyWarn).toHaveBeenCalled();
  });

  test("should handle debug logs based on environment", () => {
    const spy = spyOn(log, "debug");

    // Test production
    process.env.NODE_ENV = "production";
    logger = new Logger();
    logger.debug("Debug in production");
    expect(spy).not.toHaveBeenCalled();

    // Test development
    process.env.NODE_ENV = "development";
    logger = new Logger();
    logger.debug("Debug in development");
    expect(spy).toHaveBeenCalled();
  });

  test("should respect test environment", () => {
    process.env.NODE_ENV = "test";
    const logger = new Logger();
    const spy = spyOn(log, "debug");

    logger.debug("Test message");
    logger.info("Test message");
    logger.warn("Test message");
    logger.error("Test message");

    expect(spy).not.toHaveBeenCalled();
  });

  test("should format objects for logging in different environments", () => {
    const testObj = { key: "value", number: 42 };

    // Test in development
    process.env.NODE_ENV = "development";
    process.env.BUN_ENV = undefined;
    const devLogger = new Logger();
    const formattedDev = devLogger.formatObject(testObj);
    expect(formattedDev).toBe("\u001B[90mkey\u001B[39m: value, \u001B[90mnumber\u001B[39m: 42");

    // Test in test environment
    process.env.NODE_ENV = "test";
    const testLogger = new Logger();
    const formattedTest = testLogger.formatObject(testObj);
    expect(formattedTest).toBe("");
  });
}); 