import chalk from "chalk";
import ora from "ora";

import type { Ora } from "ora";

export default class Logger {
	private spinner: Ora | null = null;

	constructor() {
		// Add cleanup handler for process exit
		process.on("SIGINT", () => this.endProgress());
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

		this.spinner!.text = `${text} [${current}/${total}]`;
		return this;
	}

	public success(message: string) {
		if (this.spinner) {
			this.spinner.succeed(message);
			this.spinner = null;
		} else {
			console.log(chalk.green("✔"), message);
		}
		return this;
	}

	public error(message: string) {
		if (this.spinner) {
			this.spinner.fail(message);
			this.spinner = null;
		} else {
			console.error(chalk.red("✖"), message);
		}
		return this;
	}

	public info(message: string) {
		if (this.spinner) {
			// Preserve spinner state
			const text = this.spinner.text;
			this.spinner.stop();
			console.log(chalk.blue("ℹ"), message);
			this.spinner.start(text);
		} else {
			console.log(chalk.blue("ℹ"), message);
		}
		return this;
	}

	public table(data: Record<string, any>) {
		if (this.spinner) {
			const text = this.spinner.text;
			this.spinner.stop();
			console.table(data);
			this.spinner.start(text);
		} else {
			console.table(data);
		}
		return this;
	}
}
