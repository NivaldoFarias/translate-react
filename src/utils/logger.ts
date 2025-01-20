import chalk from "chalk";
import ora from "ora";

import type { Ora } from "ora";

export default class Logger {
	private spinner: Ora | null = null;
	private lastText: string = "";

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

	public endProgress() {
		if (this.spinner) {
			this.spinner.stop();
			this.spinner = null;
			this.lastText = "";
		}
	}

	public startProgress(text: string) {
		if (this.spinner) {
			this.spinner.text = text;
		} else {
			this.spinner = ora({
				text,
				color: "blue",
			}).start();
		}
		this.lastText = text;
		return this;
	}

	public updateProgress(current: number, total: number, text: string) {
		const progressText = `${text} [${Math.round((current / total) * 100)}%]`;
		this.lastText = progressText;

		if (!this.spinner) {
			this.spinner = ora({
				text: progressText,
				color: "blue",
			}).start();
		} else {
			this.spinner.text = progressText;
		}

		return this;
	}

	public success(message: string) {
		console.log(`${chalk.green("✔")} ${message}`);
		if (this.spinner && this.lastText) {
			this.spinner.text = this.lastText;
		}
		return this;
	}

	public error(message: string) {
		console.log(`${chalk.red("✖")} ${message}`);
		if (this.spinner && this.lastText) {
			this.spinner.text = this.lastText;
		}
		return this;
	}

	public info(message: string) {
		console.log(`${chalk.blue("ℹ")} ${message}`);
		if (this.spinner && this.lastText) {
			this.spinner.text = this.lastText;
		}
		return this;
	}

	public table(data: Record<string, any>) {
		if (this.spinner) {
			this.spinner.stop();
		}
		console.table(data);
		if (this.spinner && this.lastText) {
			this.spinner.start(this.lastText);
		}
		return this;
	}
}
