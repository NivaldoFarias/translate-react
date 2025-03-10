/** Represents a file that needs to be translated */
export default class TranslationFile {
	constructor(
		/** The content of the file */
		public readonly content: string,

		/** The filename of the file */
		public readonly filename: string,

		/** The path of the file */
		public readonly path: string,

		/** The SHA of the file */
		public readonly sha: string,
	) {}
}
