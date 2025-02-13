import { franc } from "franc";
import langs from "langs";
import OpenAI from "openai";

import type { ParsedContent, TranslationFile } from "../types";

import { parseContent, reconstructContent } from "../utils/content-parser";
import { ErrorCodes, TranslationError } from "../utils/errors";

/**
 * Translation performance and success rate metrics.
 *
 * ## Tracked Metrics
 * - Total translations attempted
 * - Success and failure counts
 * - Average translation time
 * - Total processing time
 */
export interface TranslationMetrics {
	totalTranslations: number;
	successfulTranslations: number;
	failedTranslations: number;
	averageTranslationTime: number;
	totalTranslationTime: number;
}

/**
 * # Translation Service
 *
 * Core service for translating content using OpenAI's language models.
 * Handles the entire translation workflow including:
 * - Content parsing and block management
 * - Language model interaction
 * - Response processing
 * - Metrics tracking
 */
export class TranslatorService {
	/**
	 * OpenAI language model instance for translations
	 */
	private readonly llm = new OpenAI({
		baseURL: import.meta.env.LLM_BASE_URL,
		apiKey: import.meta.env.LLM_API_KEY,
	});

	/**
	 * Translation performance metrics tracker
	 */
	private metrics: TranslationMetrics = {
		totalTranslations: 0,
		successfulTranslations: 0,
		failedTranslations: 0,
		averageTranslationTime: 0,
		totalTranslationTime: 0,
	};

	/**
	 * # Language Model Interaction
	 *
	 * Makes API calls to OpenAI for content translation.
	 * Constructs appropriate prompts and handles response processing.
	 *
	 * ## Workflow
	 * 1. Builds system and user prompts
	 * 2. Adds block translations if needed
	 * 3. Makes API call with configured model
	 *
	 * @param content - Main content to translate
	 * @param blocksToTranslate - Optional code blocks requiring translation
	 */
	private async callLanguageModel(content: string, blocksToTranslate?: string) {
		const messages = [
			{
				role: "system" as const,
				content: this.getSystemPrompt(content),
			},
			{
				role: "user" as const,
				content: this.getUserPrompt(content),
			},
		];

		// If we have blocks to translate, add them as a separate message
		if (blocksToTranslate) {
			messages.push({
				role: "user" as const,
				content: `BLOCKS TO TRANSLATE (MUST translate ONLY comments and strings that don't refer to code):\n\n${blocksToTranslate}`,
			});
		}

		return await this.llm.chat.completions.create({
			model: import.meta.env.LLM_MODEL,
			messages,
		});
	}

	/**
	 * # Content Translation
	 *
	 * Main translation method that processes files and manages the translation workflow.
	 *
	 * ## Workflow
	 * 1. Validates input content
	 * 2. Parses content and extracts blocks
	 * 3. Calls language model for translation
	 * 4. Processes and reconstructs translated content
	 * 5. Updates metrics
	 *
	 * @param file - File containing content to translate
	 */
	public async translateContent(file: TranslationFile) {
		const startTime = Date.now();
		this.metrics.totalTranslations++;

		try {
			if (typeof file.content === "string" && file.content.length === 0) {
				throw new TranslationError(
					`File content is empty: ${file.filename}`,
					ErrorCodes.INVALID_CONTENT,
				);
			}

			// Parse content if it's a string
			const parsedContent =
				typeof file.content === "string" ? parseContent(file.content) : file.content;

			// First translate the main content
			const response = await this.callLanguageModel(
				parsedContent.content,
				parsedContent.uniqueBlocksForTranslation,
			);

			// Update metrics
			const translationTime = Date.now() - startTime;
			this.metrics.successfulTranslations++;
			this.metrics.totalTranslationTime += translationTime;
			this.metrics.averageTranslationTime =
				this.metrics.totalTranslationTime / this.metrics.successfulTranslations;

			// Process the response and extract translated blocks
			if (response.choices[0]?.message?.content) {
				const content = response.choices[0].message.content;
				const translatedBlocks = new Map(parsedContent.blocks);

				// Extract translated blocks from the response
				const blockRegex = /BLOCK (\d+):\n(```[\s\S]*?```)/g;
				let match: RegExpExecArray | null;

				// Get the part after "BLOCKS TO TRANSLATE"
				const parts = content.split("BLOCKS TO TRANSLATE");
				const blocksSection = parts[1];
				const mainContent = parts[0]?.trim() ?? content;

				if (blocksSection) {
					while ((match = blockRegex.exec(blocksSection)) !== null) {
						const [, id, translatedBlock] = match;
						if (id && translatedBlock) {
							translatedBlocks.set(id, translatedBlock);
						}
					}
				}

				const translatedParsedContent: ParsedContent = {
					content: mainContent,
					blocks: translatedBlocks,
					uniqueBlocksForTranslation: parsedContent.uniqueBlocksForTranslation,
				};

				return {
					...response,
					choices: [
						{
							...response.choices[0],
							message: {
								...response.choices[0].message,
								content: reconstructContent(translatedParsedContent),
							},
						},
					],
				};
			}

			return response;
		} catch (error) {
			this.metrics.failedTranslations++;

			const message = error instanceof Error ? error.message : "Unknown error";
			throw new TranslationError(`Translation failed: ${message}`, ErrorCodes.OPENAI_API_ERROR, {
				filePath: file.filename,
			});
		}
	}

	/**
	 * # User Prompt Generator
	 *
	 * Creates the user prompt for the language model.
	 * Includes instructions for content translation and block handling.
	 *
	 * @param content - Content to be translated
	 */
	private getUserPrompt(content: string) {
		return `CONTENT TO TRANSLATE:\n${content}\n\nIMPORTANT: MUST respond with the translated content first, followed by any translated blocks. DO NOT modify the {{BLOCK_X}} placeholders in the main content.`;
	}

	/**
	 * # System Prompt Generator
	 *
	 * Creates the system prompt that defines translation rules and requirements.
	 * Includes language specifications, formatting rules, and glossary.
	 *
	 * @param content - Content to determine source language
	 */
	private getSystemPrompt(content: string) {
		const languages = {
			target: langs.where("3", import.meta.env.TARGET_LANGUAGE)?.["1"] || "Brazilian Portuguese",
			source: langs.where("3", franc(content))?.["1"] || "English",
		};

		return `
			You are a precise translator specializing in technical documentation. 
			Your task is to translate React documentation from ${languages.source} to ${languages.target} in a single, high-quality pass.

			TRANSLATION AND VERIFICATION REQUIREMENTS - YOU MUST FOLLOW THESE EXACTLY:
			1. MUST maintain ALL original markdown formatting, including code blocks, links, and special syntax
			2. MUST preserve ALL original code examples exactly as they are
			3. MUST keep ALL original HTML tags intact and unchanged
			4. MUST follow the glossary rules below STRICTLY - these are non-negotiable terms
			5. MUST maintain ALL original frontmatter exactly as in original
			6. MUST preserve ALL original line breaks and paragraph structure
			7. MUST NOT translate code variables, function names, or technical terms not in the glossary
			8. MUST NOT add any content
			9. MUST NOT remove any content. This is very important, DO NOT DO IT!
			10. MUST NOT change any URLs or links
			11. MUST translate comments within code blocks according to the glossary
			12. MUST maintain consistent technical terminology throughout the translation
			13. MUST ensure the translation reads naturally in ${languages.target} while preserving technical accuracy
			14. MUST NOT modify any {{BLOCK_X}} placeholders in the main content
			15. When translating code blocks, MUST only translate comments and string literals that don't refer to code

			RESPONSE FORMAT:
			1. First provide the translated main content, preserving all {{BLOCK_X}} placeholders exactly as they appear
			2. If blocks are provided for translation, include them after "BLOCKS TO TRANSLATE:" with their IDs preserved

			GLOSSARY RULES:
			You must translate the following terms according to the glossary:
			${this.glossary}
		`;
	}

	/**
	 * # Metrics Retriever
	 *
	 * Provides current translation performance metrics.
	 * Returns a copy to prevent external modification.
	 */
	public getMetrics(): TranslationMetrics {
		return { ...this.metrics };
	}

	/**
	 * # Translation Glossary
	 *
	 * Provides standardized translation rules and term mappings.
	 * Ensures consistency in technical term translation.
	 */
	private get glossary() {
		return `# Guia de Estilo Universal

Este documento descreve as regras que devem ser aplicadas para **todos** os idiomas.
Quando estiver se referindo ao próprio \`React\`, use \`o React\`.

## IDs dos Títulos

Todos os títulos possuem IDs explícitos como abaixo:

\`\`\`md
## Tente React {#try-react}
\`\`\`

**Não** traduza estes IDs! Eles são usado para navegação e quebrarão se o documento for um link externo, como:

\`\`\`md
Veja a [seção iniciando](/getting-started#try-react) para mais informações.
\`\`\`

✅ FAÇA:

\`\`\`md
## Tente React {#try-react}
\`\`\`

❌ NÃO FAÇA:

\`\`\`md
## Tente React {#tente-react}
\`\`\`

Isto quebraria o link acima.

## Texto em Blocos de Código

Mantenha o texto em blocos de código sem tradução, exceto para os comentários. Você pode optar por traduzir o texto em strings, mas tenha cuidado para não traduzir strings que se refiram ao código!

Exemplo:

\`\`\`js
// Example
const element = <h1>Hello, world</h1>;
ReactDOM.render(element, document.getElementById('root'));
\`\`\`

✅ FAÇA:

\`\`\`js
// Exemplo
const element = <h1>Hello, world</h1>;
ReactDOM.render(element, document.getElementById('root'));
\`\`\`

✅ PERMITIDO:

\`\`\`js
// Exemplo
const element = <h1>Olá mundo</h1>;
ReactDOM.render(element, document.getElementById('root'));
\`\`\`

❌ NÃO FAÇA:

\`\`\`js
// Exemplo
const element = <h1>Olá mundo</h1>;
// "root" se refere a um ID de elemento.
// NÃO TRADUZA
ReactDOM.render(element, document.getElementById('raiz'));
\`\`\`

❌ DEFINITIVAMENTE NÃO FAÇA:

\`\`\`js
// Exemplo
const elemento = <h1>Olá mundo</h1>;
ReactDOM.renderizar(elemento, documento.obterElementoPorId('raiz'));
\`\`\`

## Links Externos

Se um link externo se referir a um artigo no [MDN] or [Wikipedia] e se houver uma versão traduzida em seu idioma em uma qualidade decente, opte por usar a versão traduzida.

[mdn]: https://developer.mozilla.org/pt-BR/
[wikipedia]: https://pt.wikipedia.org/wiki/Wikipédia:Página_principal

Exemplo:

\`\`\`md
React elements are [immutable](https://en.wikipedia.org/wiki/Immutable_object).
\`\`\`

✅ OK:

\`\`\`md
Elementos React são [imutáveis](https://pt.wikipedia.org/wiki/Objeto_imutável).
\`\`\`

Para links que não possuem tradução (Stack Overflow, vídeos do YouTube, etc.), simplesmente use o link original.

## Traduções Comuns

Sugestões de palavras e termos:

| Palavra/Termo original | Sugestão                               |
| ---------------------- | -------------------------------------- |
| assertion              | asserção                               |
| at the top level       | na raiz                                |
| browser                | navegador                              |
| bubbling               | propagar                               |
| bug                    | erro                                   |
| caveats                | ressalvas                              |
| class component        | componente de classe                   |
| class                  | classe                                 |
| client                 | cliente                                |
| client-side            | lado do cliente                        |
| container              | contêiner                              |
| context                | contexto                               |
| controlled component   | componente controlado                  |
| debugging              | depuração                              |
| DOM node               | nó do DOM                              |
| event handler          | manipulador de eventos (event handler) |
| function component     | componente de função                   |
| handler                | manipulador                            |
| helper function        | função auxiliar                        |
| high-order components  | componente de alta-ordem               |
| key                    | chave                                  |
| library                | biblioteca                             |
| lowercase              | minúscula(s) / caixa baixa             |
| package                | pacote                                 |
| React element          | Elemento React                         |
| React fragment         | Fragmento React                        |
| render                 | renderizar (verb), renderizado (noun)  |
| server                 | servidor                               |
| server-side            | lado do servidor                       |
| siblings               | irmãos                                 |
| stateful component     | componente com estado                  |
| stateful logic         | lógica com estado                      |
| to assert              | afirmar                                |
| to wrap                | encapsular                             |
| troubleshooting        | solução de problemas                   |
| uncontrolled component | componente não controlado              |
| uppercase              | maiúscula(s) / caixa alta              |

## Conteúdo que não deve ser traduzido

- array
- arrow function
- bind
- bundle
- bundler
- callback
- camelCase
- DOM
- event listener
- framework
- hook
- log
- mock
- portal
- props
| ref
| release
| script
| single-page-apps
| state
| string
| string literal
| subscribe
| subscription
| template literal
| timestamps
| UI
| watcher
| widgets
| wrapper`;
	}
}
