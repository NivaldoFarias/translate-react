import { RequestError } from "@octokit/request-error";
import { describe, expect, test } from "bun:test";
import { APIError } from "openai/error";
import pino from "pino";

import { loggerFieldOptions } from "@/shared/utils/create-logger.util";

/**
 * Logs `error` the way call sites do and returns the raw JSON line.
 *
 * @param error Value logged under the `error` key
 *
 * @returns Serialized log line
 */
function logErrorLine(error: unknown): string {
	const lines: string[] = [];
	const logger = pino(loggerFieldOptions, { write: (line: string) => void lines.push(line) });

	logger.error({ error }, "File processing failed");

	return lines.join("");
}

describe("loggerFieldOptions", () => {
	test("removes response headers from LLM API errors and keeps the message and status", () => {
		const error = new APIError(403, { message: "Key limit exceeded" }, undefined, new Headers());
		Object.assign(error, { headers: { "set-cookie": "session-cookie-value" } });

		const line = logErrorLine(error);

		expect(line).not.toContain("session-cookie-value");
		expect(line).toContain("Key limit exceeded");
		expect(line).toContain('"status":403');
	});

	test("removes headers from nested errors", () => {
		const wrapped = Object.assign(new Error("wrapped"), {
			original: { headers: { "set-cookie": "session-cookie-value" } },
		});

		expect(logErrorLine(wrapped)).not.toContain("session-cookie-value");
	});

	test("removes request and response objects from GitHub API errors", () => {
		const error = new RequestError("Not Found", 404, {
			request: {
				method: "GET",
				url: "https://api.github.com/repos/o/r",
				headers: { "x-request-marker": "request-header-value" },
			},
			response: {
				status: 404,
				url: "https://api.github.com/repos/o/r",
				headers: { "x-github-request-id": "response-header-value" },
				data: {},
			},
		});
		const line = logErrorLine(error);

		expect(line).not.toContain("request-header-value");
		expect(line).not.toContain("response-header-value");
		expect(line).toContain("Not Found");
		expect(error.request.headers["x-request-marker"]).toBe("request-header-value");
	});
});
