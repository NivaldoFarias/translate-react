import { mock } from "bun:test";

import { environmentDefaults, RuntimeEnvironment, validateEnv } from "@/app/utils/";

export const testEnv = environmentDefaults[RuntimeEnvironment.Test];

void mock.module("@/app/env/app.env", () => {
	return { env: testEnv, validateEnv };
});
