import { franc } from "franc";
import langs from "langs";
import OpenAI from "openai";

import type { TranslationFile } from "../types";

import { ErrorCodes, TranslationError } from "../utils/errors";

interface TranslationMetrics {
	totalTranslations: number;
	successfulTranslations: number;
	failedTranslations: number;
	averageTranslationTime: number;
	totalTranslationTime: number;
}

export class TranslatorService {
	private openai = new OpenAI({ apiKey: import.meta.env.OPENAI_API_KEY! });
	private model = import.meta.env.OPENAI_MODEL! ?? "gpt-4o";
	private metrics: TranslationMetrics = {
		totalTranslations: 0,
		successfulTranslations: 0,
		failedTranslations: 0,
		averageTranslationTime: 0,
		totalTranslationTime: 0,
	};

	private async callOpenAIAPI(content: string) {
		return await this.openai.chat.completions.create({
			model: this.model,
			messages: [
				{
					role: "user",
					content: this.getTranslationPrompt(content),
				},
			],
		});
	}

	public async translateContent(file: TranslationFile) {
		const startTime = Date.now();
		this.metrics.totalTranslations++;

		try {
			if (file.content.length === 0) {
				throw new TranslationError(
					`File content is empty: ${file.filename}`,
					ErrorCodes.INVALID_CONTENT,
				);
			}

			const response = await this.callOpenAIAPI(file.content);

			// Update metrics
			const translationTime = Date.now() - startTime;
			this.metrics.successfulTranslations++;
			this.metrics.totalTranslationTime += translationTime;
			this.metrics.averageTranslationTime =
				this.metrics.totalTranslationTime / this.metrics.successfulTranslations;

			return response;
		} catch (error) {
			this.metrics.failedTranslations++;

			const message = error instanceof Error ? error.message : "Unknown error";
			throw new TranslationError(`Translation failed: ${message}`, ErrorCodes.OPENAI_API_ERROR, {
				filePath: file.filename,
			});
		}
	}

	private getTranslationPrompt(content: string): string {
		const detectedLangCode = franc(content);
		const language = langs.where("3", detectedLangCode);
		const sourceLang = language ? language.name : "English";

		return `You are a precise translator specializing in technical documentation. 
Your task is to translate React documentation from ${sourceLang} to Brazilian Portuguese in a single, high-quality pass.

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
13. MUST ensure the translation reads naturally in Brazilian Portuguese while preserving technical accuracy

GLOSSARY RULES:
You must translate the following terms according to the glossary:
${this.glossary}

CONTENT TO TRANSLATE:
${content}

IMPORTANT: MUST respond ONLY with the final translated content. Do not include any explanations, notes, or the original content.
Start your response with the translation immediately.`;
	}

	public getMetrics(): TranslationMetrics {
		return { ...this.metrics };
	}

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
