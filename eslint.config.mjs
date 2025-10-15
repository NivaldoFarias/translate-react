import { defineConfig } from "@eslint/config-helpers";
import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
	{
		ignores: ["node_modules/**", "dist/**", "out/**", "prettier.config.mjs"],
	},
	{
		files: ["**/*.{js,cjs,mjs,ts,mts,cts}"],
		plugins: {
			"@typescript-eslint": tseslint.plugin,
		},
		languageOptions: {
			globals: {
				...globals.node,
				Bun: "readonly",
				NodeJS: "readonly",
			},
			parser: tseslint.parser,
			parserOptions: {
				project: ["./tsconfig.json"],
				ecmaVersion: "latest",
				sourceType: "module",
			},
		},
		rules: {
			...eslint.configs.recommended.rules,

			/* ESLint */
			"no-unused-vars": "off",
			"no-console": "error",

			/* TypeScript */
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
		},
	},
	{
		files: ["scripts/**/*.{js,ts}", "src/build.ts"],
		rules: {
			"no-console": "off",
		},
	},
	{
		files: ["*.cjs"],
		languageOptions: {
			globals: globals.commonjs,
		},
	},
	{
		files: ["*.mjs"],
		languageOptions: {
			globals: globals.node,
		},
	},
	eslintConfigPrettier,
);
