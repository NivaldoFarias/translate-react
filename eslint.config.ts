import { defineConfig } from "@eslint/config-helpers";
import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import jsdoc from "eslint-plugin-jsdoc";
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
			jsdoc,
		},
		extends: [
			eslint.configs.recommended,
			tseslint.configs.strictTypeChecked,
			tseslint.configs.stylisticTypeChecked,
			jsdoc.configs["flat/recommended-mixed"],
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

			/* JSDoc */
			"jsdoc/no-undefined-types": ["error", { disableReporting: true, markVariablesAsUsed: true }],
			"jsdoc/tag-lines": ["error", "any", { startLines: 1 }],
			"jsdoc/sort-tags": [
				"error",
				{
					linesBetween: 1,
					reportIntraTagGroupSpacing: true,
					reportTagGroupSpacing: true,
					tagSequence: [
						{ tags: ["param", "arg", "argument"] },
						{ tags: ["returns", "return"] },
						{ tags: ["throws", "exception"] },
						{ tags: ["see"] },
						{ tags: ["example"] },
						{ tags: ["-other"] },
					],
				},
			],
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
							allowTypeImports: true,
						},
						{
							group: ["@/ci", "@/ci/**"],
							message: "Shared code must not import CI helpers.",
							allowTypeImports: true,
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
							allowTypeImports: true,
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
							allowTypeImports: true,
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
							allowTypeImports: true,
						},
						{
							group: ["@/app/services/translator", "@/app/services/translator/**"],
							message:
								"GitHub layer must not import translator; use github/types DTOs and map in runner.",
							allowTypeImports: true,
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
							allowTypeImports: true,
						},
						{
							group: [
								"@/app/services/github/github.content",
								"@/app/services/github/github.repository",
								"@/app/services/github/github.branch",
							],
							message:
								"Import GitHubService from @/app/services/github instead of internal modules.",
							allowTypeImports: true,
						},
					],
				},
			],
		},
	},
	{
		files: ["tests/**"],
		rules: Object.fromEntries(
			Object.keys(jsdoc.rules ?? {}).map((rule) => [`jsdoc/${rule}`, "off"]),
		),
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
