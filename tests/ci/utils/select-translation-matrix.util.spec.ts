import { describe, expect, test } from "bun:test";

import { selectTranslationMatrix } from "@/ci/utils/select-translation-matrix.util";
import { ApplicationError } from "@/shared/errors/";

const PT_BR_ROW = {
	lang: "pt-br",
	upstream_owner: "reactjs",
	upstream_name: "pt-br.react.dev",
	fork_name: "pt-br.react.dev",
	fork_owner: "example",
	translation_guidelines_file: "GLOSSARY.md",
	scheduled: true,
	upstream_sha: "abc123",
};

const RU_ROW = {
	...PT_BR_ROW,
	lang: "ru",
	upstream_name: "ru.react.dev",
	fork_name: "ru.react.dev",
	translation_guidelines_file: "TRANSLATION.md",
	upstream_sha: "def456",
};

describe("selectTranslationMatrix", () => {
	describe("polled matrix (workflow_call from poll.yml)", () => {
		test("uses matrix_json when supplied, ignoring the resolved matrix", () => {
			const selected = selectTranslationMatrix({
				polledMatrixJson: JSON.stringify([PT_BR_ROW]),
				resolvedMatrixJson: JSON.stringify([PT_BR_ROW, RU_ROW]),
			});

			expect(selected).toEqual({ source: "polled", matrix: [PT_BR_ROW], hasMatrix: true });
		});

		test("uses matrix_json even when the resolve step was skipped", () => {
			const selected = selectTranslationMatrix({
				polledMatrixJson: `  ${JSON.stringify([RU_ROW])}\n`,
			});

			expect(selected.source).toBe("polled");
			expect(selected.hasMatrix).toBe(true);
			expect(selected.matrix.map((row) => row.lang)).toEqual(["ru"]);
		});

		test("throws when matrix_json is an empty array", () => {
			expect(() => selectTranslationMatrix({ polledMatrixJson: "[]" })).toThrow(
				"matrix_json was supplied but contains no rows",
			);
		});

		test("throws when matrix_json is invalid JSON", () => {
			expect(() => selectTranslationMatrix({ polledMatrixJson: "[{lang:" })).toThrow(
				ApplicationError,
			);
		});

		test("throws when matrix_json is not an array", () => {
			expect(() =>
				selectTranslationMatrix({ polledMatrixJson: JSON.stringify(PT_BR_ROW) }),
			).toThrow("The polled translation matrix has invalid rows");
		});

		test("throws when a row is missing required fields", () => {
			const { upstream_sha: _omitted, ...rowWithoutSha } = PT_BR_ROW;

			expect(() =>
				selectTranslationMatrix({ polledMatrixJson: JSON.stringify([rowWithoutSha]) }),
			).toThrow("The polled translation matrix has invalid rows");
		});
	});

	describe("resolved matrix (manual workflow_dispatch)", () => {
		test("uses the resolved matrix when matrix_json is empty", () => {
			const selected = selectTranslationMatrix({
				polledMatrixJson: "",
				resolvedMatrixJson: JSON.stringify([PT_BR_ROW, RU_ROW]),
			});

			expect(selected).toEqual({
				source: "resolved",
				matrix: [PT_BR_ROW, RU_ROW],
				hasMatrix: true,
			});
		});

		test("reports no matrix when the resolved matrix is empty", () => {
			expect(selectTranslationMatrix({ resolvedMatrixJson: "[]" })).toEqual({
				source: "resolved",
				matrix: [],
				hasMatrix: false,
			});
		});

		test("throws when neither source is available", () => {
			expect(() =>
				selectTranslationMatrix({ polledMatrixJson: " ", resolvedMatrixJson: "" }),
			).toThrow("No translation matrix available");
		});

		test("throws when the resolved matrix is invalid JSON", () => {
			expect(() => selectTranslationMatrix({ resolvedMatrixJson: "not json" })).toThrow(
				"The resolved translation matrix is not valid JSON",
			);
		});
	});
});
