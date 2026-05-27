import type { PullRequestStatus } from "./workflow.types";

/** Prior invalid PR for the same file path */
export interface InvalidFilePullRequest {
	prNumber: number;
	status: PullRequestStatus;
}

/** Inputs for locale-specific pull request body templates */
export interface PullRequestDescriptionMetadata {
	languageName: string;
	invalidFilePR: InvalidFilePullRequest | undefined;
	content: {
		source: string;
		translation: string;
		compressionRatio: string;
	};
	timestamps: {
		now: number;
		workflowStart: number;
	};
	/** LLM model id used for translation (from `LLM_MODEL`) */
	translationModel: string;
	/** GitHub “new issue” chooser URL for the translate-react runner repo */
	newIssueChooserUrl: string;
}
