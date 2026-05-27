/** Regular expressions shared by translation validation and markdown parsing */
export const MARKDOWN_REGEXES = {
	/** Regex pattern to match trailing newlines */
	trailingNewlines: new RegExp(/\r?\n+$/),

	/** Regex pattern to extract YAML frontmatter block (between --- delimiters); allows optional UTF-8 BOM */
	frontmatter: new RegExp(/^(\uFEFF)?---\r?\n(?<content>[\s\S]*?)\r?\n---/),

	/** Regex pattern to match markdown links: [text](url) and [text](url "title") */
	markdownLink: new RegExp(/\[(?<text>[^\]]*)\]\((?<url>[^)\s]+)(?:\s+"[^"]*")?\)/g),

	/** Regex pattern to match fenced code blocks (triple backticks with optional language identifier) */
	codeBlock: new RegExp(/^```([\s\S]*?)\r?\n```/gm),

	/** Regex pattern to match markdown headings (h1-h6) */
	headings: new RegExp(/^#{1,6}\s/gm),

	/** Regex pattern to match all newline characters for line ending replacement */
	lineEnding: new RegExp(/\r?\n/g),
} as const;
