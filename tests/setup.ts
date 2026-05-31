import { mock } from "bun:test";

import { environmentDefaults, RuntimeEnvironment, validateEnv } from "@/app/utils/";

export const testEnv = environmentDefaults[RuntimeEnvironment.Test];

void mock.module("@/app/schemas/env.schema", () => {
	return { env: testEnv, validateEnv };
});
