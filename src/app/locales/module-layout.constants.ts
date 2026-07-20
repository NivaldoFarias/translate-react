/**
 * Required files under `src/app/locales/<lang>/` for every registered translation locale.
 *
 * Enforced by `tests/app/locales/locale-module-layout.spec.ts`.
 */
export const LOCALE_MODULE_REQUIRED_RELATIVE_FILES = [
	"locale.ts",
	"rules.ts",
	"repairs/index.ts",
	"repairs/constants.ts",
	"repairs/definition.ts",
] as const;
