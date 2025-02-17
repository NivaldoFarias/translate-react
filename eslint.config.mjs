import eslint from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
	eslintPluginPrettier,
	{
		files: ["**/*.{js,ts}"],
		plugins: {
			"@typescript-eslint": tseslint.plugin,
		},
		languageOptions: {
			globals: {
				...globals.node,
				Bun: "readonly",
			},
			parser: tseslint.parser,
			parserOptions: {
				project: ["./tsconfig.json"],
			},
		},
		rules: {
			...eslint.configs.recommended.rules,
			"no-unused-vars": "off",
			"no-console": ["error", { allow: ["warn", "error", "table"] }],

			"prettier/prettier": "off",

			// typescript-eslint rules
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
			"@typescript-eslint/no-namespace": "off",
			"@typescript-eslint/dot-notation": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-extraneous-class": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
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
);
