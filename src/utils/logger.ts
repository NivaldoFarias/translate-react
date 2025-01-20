import chalk from "chalk";
import ora from "ora";

import type { Ora } from "ora";

export default class Logger {
	private spinner: Ora | null = null;

	constructor() {
		// Add cleanup handler for process exit
		process.on("SIGINT", () => this.endProgress());
	}

	private ensureSpinner(text: string = "") {
		if (!this.spinner) {
			this.spinner = ora({ text, color: "blue" }).start();
		}
		return this.spinner;
	}

	public endProgress() {
		if (this.spinner) {
			this.spinner.stop();
			this.spinner = null;
		}
	}

	public startProgress(text: string) {
		this.spinner = ora({
			text,
			color: "blue",
		}).start();

		return this;
	}

	public updateProgress(current: number, total: number, text: string) {
		if (!this.spinner) {
			this.spinner = this.startProgress(text).spinner;
		}

		this.spinner!.text = `${text} [${Math.round((current / total) * 100)}%]`;
		return this;
	}

	public success(message: string) {
		const spinner = this.ensureSpinner();
		const currentText = spinner.text;
		spinner.stopAndPersist({ symbol: chalk.green("✔"), text: message });
		spinner.start(currentText);
		return this;
	}

	public error(message: string) {
		const spinner = this.ensureSpinner();
		const currentText = spinner.text;
		spinner.stopAndPersist({ symbol: chalk.red("✖"), text: message });
		spinner.start(currentText);
		return this;
	}

	public info(message: string) {
		const spinner = this.ensureSpinner();
		const currentText = spinner.text;
		spinner.stopAndPersist({ symbol: chalk.blue("ℹ"), text: message });
		spinner.start(currentText);
		return this;
	}

	public table(data: Record<string, any>) {
		const spinner = this.ensureSpinner();
		const currentText = spinner.text;
		spinner.stop();
		console.table(data);
		spinner.start(currentText);
		return this;
	}
}
