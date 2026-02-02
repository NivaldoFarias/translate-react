import { mock } from "bun:test";

import { environmentDefaults, RuntimeEnvironment, validateEnv } from "@/utils/";

export const testEnv = environmentDefaults[RuntimeEnvironment.Test];

void mock.module("@/utils/env.util", () => {
	return { env: testEnv, validateEnv };
});
