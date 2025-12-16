import type { Environment } from "@/utils";

declare global {
    namespace globalThis {
        /** Mock environment configuration for testing */
        let mockEnv: Environment;
    }
}
