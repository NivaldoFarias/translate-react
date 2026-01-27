import { OpenAI } from "openai";

import { env } from "@/utils";

/** Pre-configured instance of {@link OpenAI} for application-wide use */
export const openai = new OpenAI({
	baseURL: env.LLM_API_BASE_URL,
	apiKey: env.LLM_API_KEY,
	project: env.OPENAI_PROJECT_ID,
	defaultHeaders: {
		"X-Title": env.HEADER_APP_TITLE,
		"HTTP-Referer": env.HEADER_APP_URL,
	},
});
