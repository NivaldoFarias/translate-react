import Anthropic from "@anthropic-ai/sdk";

import type { TranslationFile } from "../types";

import { ErrorCodes, TranslationError } from "../utils/errors";
import Logger from "../utils/logger";
import { RateLimiter } from "../utils/rateLimiter";
import { RetryableOperation } from "../utils/retryableOperation";

interface TranslationCache {
	content: string;
	timestamp: number;
}

interface TranslationMetrics {
	totalTranslations: number;
	successfulTranslations: number;
	failedTranslations: number;
	cacheHits: number;
	averageTranslationTime: number;
	totalTranslationTime: number;
}

export class TranslatorService {
	private claude: Anthropic;
	private model = "claude-3-sonnet-20240229";
	private cache = new Map<string, TranslationCache>();
	private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
	private logger = new Logger();
	private rateLimiter = new RateLimiter(60, "Claude API");
	private retryOperation = new RetryableOperation(3, 1000, 5000);
	private metrics: TranslationMetrics = {
		totalTranslations: 0,
		successfulTranslations: 0,
		failedTranslations: 0,
		cacheHits: 0,
		averageTranslationTime: 0,
		totalTranslationTime: 0,
	};

	constructor(apiKey: string = process.env["ANTHROPIC_API_KEY"]!) {
		this.claude = new Anthropic({ apiKey });
	}

	private async callClaudeAPI(content: string, glossary: string): Promise<string> {
		const message = await this.rateLimiter.schedule(
			() =>
				this.claude.messages.create({
					model: this.model,
					max_tokens: 4096,
					messages: [
						{
							role: "user",
							content: this.getTranslationPrompt(content, glossary),
						},
					],
				}),
			"Claude API Call",
		);

		return message.content[0].type === "text" ? message.content[0].text : "";
	}

	private async translateWithRetry(file: TranslationFile, glossary: string): Promise<string> {
		return this.retryOperation.withRetry(
			async () => this.callClaudeAPI(file.content, glossary),
			`Translation of ${file.path}`,
		);
	}

	async translateContent(file: TranslationFile, glossary: string): Promise<string> {
		const startTime = Date.now();
		this.metrics.totalTranslations++;

		try {
			const cacheKey = `${file.path}:${file.content}`;
			const cached = this.cache.get(cacheKey);

			if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
				this.metrics.cacheHits++;
				return cached.content;
			}

			if (file.content.length === 0) {
				throw new TranslationError(
					`File content is empty: ${file.path}`,
					ErrorCodes.INVALID_CONTENT,
				);
			}

			const translation = await this.translateWithRetry(file, glossary);

			// Cache the result
			this.cache.set(cacheKey, {
				content: translation,
				timestamp: Date.now(),
			});

			// Update metrics
			const translationTime = Date.now() - startTime;
			this.metrics.successfulTranslations++;
			this.metrics.totalTranslationTime += translationTime;
			this.metrics.averageTranslationTime =
				this.metrics.totalTranslationTime / this.metrics.successfulTranslations;

			return translation;
		} catch (error) {
			this.metrics.failedTranslations++;
			const message = error instanceof Error ? error.message : "Unknown error";
			throw new TranslationError(`Translation failed: ${message}`, ErrorCodes.CLAUDE_API_ERROR, {
				filePath: file.path,
			});
		}
	}

	private getTranslationPrompt(content: string, glossary: string): string {
		return `
You are a professional translator specializing in technical documentation.
Your task is to translate the following content from English to Brazilian Portuguese.

Use the following glossary for consistent translations:
${glossary}

Content to translate:
${content}

Please provide only the translated content, without any additional comments or explanations.
Maintain all Markdown formatting, code blocks, and special characters exactly as they appear in the original.
`;
	}

	public getMetrics(): TranslationMetrics {
		return { ...this.metrics };
	}
}
