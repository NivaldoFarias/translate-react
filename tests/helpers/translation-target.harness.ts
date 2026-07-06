import { afterEach, beforeEach } from "bun:test";

import { testEnv } from "../setup";

/**
 * Sets `TRANSLATION_FILE_PATHS` on the shared test env for targeted re-translation specs.
 *
 * @param paths Repository paths to expose as configured translation targets
 */
export function useTranslationTargetPaths(...paths: string[]) {
	beforeEach(() => {
		testEnv.TRANSLATION_FILE_PATHS = paths.join(",");
	});

	afterEach(() => {
		delete testEnv.TRANSLATION_FILE_PATHS;
	});
}
