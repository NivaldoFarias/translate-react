import chalk from "chalk";
import ora from "ora";

import type { Ora } from "ora";

interface ProgressStep {
	name: string;
	current: number;
	total: number;
}

export default class Logger {
	private spinner: Ora | null = null;
	private lastText: string = "";
	private steps: Map<string, ProgressStep> = new Map();

	constructor() {
		// Add cleanup handler for process exit
		process.on("SIGINT", () => this.endProgress());
	}

	private ensureSpinner(text: string = "") {
		if (!this.spinner) {
			this.spinner = ora({ text: text || this.lastText, color: "blue" }).start();
		}
		return this.spinner;
	}

	private formatProgress(): string {
		if (!this.steps.size) return this.lastText;

		const parts = Array.from(this.steps.values()).map(
			(step) =>
				`${step.name} ${step.current}/${step.total} [${Math.round((step.current / step.total) * 100)}%]`,
		);

		return parts.join(" :: ");
	}

	public endProgress() {
		if (this.spinner) {
			this.spinner.stop();
			this.spinner = null;
			this.lastText = "";
			this.steps.clear();
		}
	}

	public startProgress(text: string) {
		this.lastText = text;
		if (this.spinner) {
			this.spinner.text = this.formatProgress();
		} else {
			this.spinner = ora({
				text: this.formatProgress(),
				color: "blue",
			}).start();
		}
		return this;
	}

	public updateStep(stepName: string, current: number, total: number) {
		this.steps.set(stepName, { name: stepName, current, total });
		if (this.spinner) {
			this.spinner.text = this.formatProgress();
		}
		return this;
	}

	public removeStep(stepName: string) {
		this.steps.delete(stepName);
		if (this.spinner) {
			this.spinner.text = this.formatProgress();
		}
		return this;
	}

	public success(message: string) {
		console.log(`${chalk.green("✔")} ${message}`);
		if (this.spinner) {
			this.spinner.text = this.formatProgress();
		}
		return this;
	}

	public error(message: string) {
		console.log(`${chalk.red("✖")} ${message}`);
		if (this.spinner) {
			this.spinner.text = this.formatProgress();
		}
		return this;
	}

	public info(message: string) {
		console.log(`${chalk.blue("ℹ")} ${message}`);
		if (this.spinner) {
			this.spinner.text = this.formatProgress();
		}
		return this;
	}

	public table(data: Record<string, any>) {
		if (this.spinner) {
			this.spinner.stop();
		}
		console.table(data);
		if (this.spinner) {
			this.spinner.start(this.formatProgress());
		}
		return this;
	}

	public updateProgress(current: number, total: number, text: string) {
		this.updateStep("Progress", current, total);
		this.lastText = text;
		return this;
	}
}
