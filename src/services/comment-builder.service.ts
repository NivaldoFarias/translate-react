import type { LocaleDefinition } from "@/locales";

import type { ProcessedFileResult } from "./runner";

import { logger } from "@/utils/";

import { localeService } from "./locale";
import { TranslationFile } from "./translator.service";

export interface FileEntry {
	file: TranslationFile;
	prNumber: number | undefined;
}

export interface HierarchicalStructure {
	files?: FileEntry[];
	[key: string]: HierarchicalStructure | FileEntry[] | undefined;
}

export interface FileWithHierarchy extends FileEntry {
	pathParts: string[];
}

/** Service for building comments based on translation results */
export class CommentBuilderService {
	private readonly logger = logger.child({ component: CommentBuilderService.name });
	private readonly locale: LocaleDefinition;

	/**
	 * Creates a new {@link CommentBuilderService} instance.
	 *
	 * @param localeDefinition Optional locale service for dependency injection (defaults to singleton)
	 */
	constructor(localeDefinition: LocaleDefinition = localeService.definitions) {
		this.locale = localeDefinition;
	}

	/**
	 * Builds a hierarchical comment for GitHub issues based on translation results.
	 *
	 * Processes translation results and file data to create a structured comment
	 * that organizes translated files by their directory hierarchy for better readability.
	 *
	 * @param results Translation processing results containing PR information
	 * @param filesToTranslate Original files that were processed for translation
	 *
	 * @returns Formatted hierarchical comment string for GitHub issue posting
	 *
	 * @example
	 * ```typescript
	 * const results = [{ filename: 'intro.md', pullRequest: { number: 123 } }];
	 * const files = [{ filename: 'intro.md', path: 'src/content/docs/intro.md' }];
	 * const comment = service.buildComment(results, files);
	 * // Returns formatted hierarchical comment with file organization
	 * ```
	 */
	public buildComment(results: ProcessedFileResult[], filesToTranslate: TranslationFile[]) {
		const concattedData = results
			.map((result) => {
				const translationFile = filesToTranslate.find((file) => file.filename === result.filename);

				if (!translationFile) return null;

				const pathParts = translationFile.path.split("/");

				return {
					file: translationFile,
					pathParts: this.simplifyPathParts(pathParts),
					prNumber: result.pullRequest?.number,
				} satisfies FileWithHierarchy;
			})
			.filter(Boolean);

		const hierarchicalComment = this.buildHierarchicalComment(concattedData);

		const finalComment = this.concatComment(hierarchicalComment);

		this.logger.debug({ finalComment }, "Built comment");

		return finalComment;
	}

	/**
	 * Concatenates the comment prefix and suffix to the main content.
	 *
	 * @param content The content to concatenate
	 *
	 * @returns The concatenated comment
	 */
	private concatComment(content: string) {
		return `${this.comment.prefix}\n\n${content}\n\n${this.comment.suffix}`;
	}

	/**
	 * Simplifies path parts by removing common prefixes and flattening complex structures.
	 *
	 * Processes file path segments to create cleaner, more readable hierarchical structures
	 * in comments by removing unnecessary nesting and standardizing path representation.
	 *
	 * ### Simplification Rules
	 *
	 * 1. Removes common "src/content" prefix from all paths for cleaner display
	 * 2. Flattens blog post directories by ignoring date-based subdirectories
	 * 3. Preserves meaningful directory structure while reducing visual clutter
	 *
	 * @param pathParts Array of path segments to be simplified
	 *
	 * @returns Simplified array of path segments for hierarchical display
	 *
	 * @example
	 * ```typescript
	 * const pathParts = ['src', 'content', 'docs', 'getting-started'];
	 * const simplified = this.simplifyPathParts(pathParts);
	 * // ^? ['docs', 'getting-started']
	 *
	 * const blogPath = ['src', 'content', 'blog', '2024', '01', 'post'];
	 * const simplifiedBlog = this.simplifyPathParts(blogPath);
	 * // ^? ['blog']
	 * ```
	 */
	private simplifyPathParts(pathParts: string[]): string[] {
		if (pathParts[0] === "src" && pathParts[1] === "content") {
			pathParts = pathParts.slice(2);
		}

		if (pathParts[0] === "blog") return ["blog"];

		return pathParts;
	}

	/**
	 * Builds a hierarchical comment structure from processed translation data.
	 *
	 * Creates a nested directory structure representation for GitHub comment display,
	 * organizing files by their path hierarchy with associated pull request numbers.
	 *
	 * ### Structure Building Process
	 *
	 * 1. Sorts data alphabetically by path and filename for consistent ordering
	 * 2. Creates nested object structure mirroring directory hierarchy
	 * 3. Groups files under their respective directory levels with files arrays
	 * 4. Associates each file with its corresponding pull request number
	 * 5. Converts the nested structure to formatted Markdown string
	 *
	 * @param data Processed file data containing path parts, filenames, and PR numbers
	 *
	 * @returns Formatted hierarchical Markdown comment string
	 *
	 * @example
	 * ```typescript
	 * const data = [
	 *   { pathParts: ['docs'], filename: 'intro.md', pr_number: 123 },
	 *   { pathParts: ['docs', 'api'], filename: 'reference.md', pr_number: 124 }
	 * ];
	 * const comment = this.buildHierarchicalComment(data);
	 * // ^? "- docs\n  - `intro.md`: #123\n  - api\n    - `reference.md`: #124"
	 * ```
	 */
	private buildHierarchicalComment(data: FileWithHierarchy[]): string {
		data.sort((left, right) => {
			const pathA = left.pathParts.join("/");
			const pathB = right.pathParts.join("/");

			return pathA === pathB ?
					left.file.filename.localeCompare(right.file.filename)
				:	pathA.localeCompare(pathB);
		});

		const structure: HierarchicalStructure = {};

		for (const item of data) {
			let currentLevel = structure;

			for (const part of item.pathParts) {
				currentLevel[part] ??= { files: [] };
				currentLevel = currentLevel[part] as HierarchicalStructure;
			}

			currentLevel.files?.push({
				file: item.file,
				prNumber: item.prNumber,
			});
		}

		return this.formatStructure(structure, 0);
	}

	/**
	 * Recursively formats the hierarchical structure into a Markdown comment.
	 *
	 * Converts the nested directory structure into properly indented Markdown format
	 * suitable for GitHub issue comments, with directories and files organized hierarchically.
	 *
	 * ### Formatting Rules
	 *
	 * 1. Processes directories in alphabetical order for consistent presentation
	 * 2. Indents each level with two spaces for clear visual hierarchy
	 * 3. Lists files under their respective directories with backticks and PR links
	 * 4. Recursively processes subdirectories maintaining proper indentation
	 * 5. Sorts files alphabetically within each directory level
	 *
	 * @param structure The nested directory structure to format
	 * @param level Current indentation level for recursive processing
	 *
	 * @returns Formatted Markdown string with proper hierarchy and indentation
	 *
	 * @example
	 * ```typescript
	 * const structure = {
	 *   docs: {
	 *     files: [{ filename: 'intro.md', prNumber: 123 }],
	 *     api: {
	 *       files: [{ filename: 'reference.md', prNumber: 124 }]
	 *     }
	 *   }
	 * };
	 * const formatted = this.formatStructure(structure, 0);
	 * // ^? formatted Markdown with proper indentation
	 * ```
	 */
	private formatStructure(structure: HierarchicalStructure, level: number): string {
		const lines: string[] = [];
		const indent = "  ".repeat(level);

		const dirs = Object.keys(structure)
			.filter((key) => key !== "files")
			.sort();

		for (const dir of dirs) {
			const currentLevel = structure[dir];
			if (!currentLevel || !("files" in currentLevel) || !currentLevel.files) {
				continue;
			}

			const sortedEntries = currentLevel.files.toSorted((a, b) =>
				a.file.filename.localeCompare(b.file.filename),
			);

			if (
				sortedEntries.length === 1 &&
				sortedEntries[0]?.file.filename === dir &&
				sortedEntries[0].prNumber
			) {
				lines.push(`${indent}- #${sortedEntries[0].prNumber}`);
				continue;
			}

			lines.push(`${indent}- ${dir}`);

			for (const entry of sortedEntries) {
				if (!entry.prNumber) continue;

				lines.push(`${indent}  - #${entry.prNumber}`);
			}

			const subDirs = Object.keys(currentLevel).filter((key) => key !== "files");

			if (subDirs.length > 0) {
				lines.push(this.formatStructure(currentLevel, level + 1));
			}
		}

		return lines.join("\n");
	}

	/** Comment template for issue comments */
	public get comment() {
		return {
			prefix: this.locale.comment.prefix,
			suffix: this.locale.comment.suffix,
		};
	}
}

export const commentBuilderService = new CommentBuilderService();
