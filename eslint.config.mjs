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
		files: ["src/services/github/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["@/services/runner", "@/services/runner/**"],
							message: "GitHub layer must use @/domain/workflow, not runner.",
						},
					],
				},
			],
		},
	},
	{
		files: ["src/locales/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["@/services/runner", "@/services/runner/**"],
							message: "Locales must use @/domain/workflow, not runner.",
						},
						{
							group: [
								"@/services/github/github.content",
								"@/services/github/github.repository",
								"@/services/github/github.branch",
							],
							message: "Import GitHubService from @/services/github instead of internal modules.",
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
