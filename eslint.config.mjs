import { defineConfig } from "@eslint/config-helpers";
import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
	{
		ignores: [
			"**/node_modules/**",
			"**/out/**",
			"**/dist/**",
			"**/build/**",
			"**/*.tsbuildinfo",
			"**/logs/**",
			"**/.env*",
			"**/coverage/**",
			"**/docs/**",
			"**/*.md",
			"**/*.json",
			"**/*.yml",
			"**/*.yaml",
			"src/ci/smoke-llm.ts",
		],
	},
	{
		files: ["**/*.{js,cjs,mjs,ts,mts,cts,d.ts}"],
		plugins: {
			"@typescript-eslint": tseslint.plugin,
		},
		extends: [
			eslint.configs.recommended,
			tseslint.configs.strictTypeChecked,
			tseslint.configs.stylisticTypeChecked,
		],
		languageOptions: {
			globals: {
				...globals.node,
				Bun: "readonly",
				NodeJS: "readonly",
			},
			parser: tseslint.parser,
			parserOptions: {
				project: true,
				tsconfigRootDir: import.meta.dirname,
				ecmaVersion: "latest",
				sourceType: "module",
			},
		},
		rules: {
			/* ESLint */
			"no-unused-vars": "off",
			"no-unsafe-finally": "off",
			"no-console": "error",

			/* TypeScript */
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
			"@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
		},
	},
	{
		files: ["src/shared/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["@/app", "@/app/**"],
							message: "Shared code must not import the app runtime.",
						},
						{
							group: ["@/ci", "@/ci/**"],
							message: "Shared code must not import CI helpers.",
						},
					],
				},
			],
		},
	},
	{
		files: ["src/app/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["@/ci", "@/ci/**"],
							message: "App must not import ci helpers.",
						},
					],
				},
			],
		},
	},
	{
		files: ["src/ci/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["@/app/composition", "@/app/services/runner", "@/app/services/runner/**"],
							message: "CI must not import runner.",
						},
					],
				},
			],
		},
	},
	{
		files: ["src/app/services/github/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["@/app/services/runner", "@/app/services/runner/**"],
							message: "GitHub layer must use @/app/services/github/types, not runner.",
						},
					],
				},
			],
		},
	},
	{
		files: ["src/app/locales/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["@/app/services/runner", "@/app/services/runner/**"],
							message: "Locales must use @/app/services/github/types, not runner.",
						},
						{
							group: [
								"@/app/services/github/github.content",
								"@/app/services/github/github.repository",
								"@/app/services/github/github.branch",
							],
							message:
								"Import GitHubService from @/app/services/github instead of internal modules.",
						},
					],
				},
			],
		},
	},
	{
		files: ["tests/**"],
		rules: {},
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
