import ora from 'ora';
import chalk from 'chalk';

export default class Logger {
  private spinner = ora();
  private isTestEnvironment: boolean;
  private isSilent: boolean = false;
  private currentSpinnerText: string = '';

  constructor() {
    this.isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test';
    if (this.isTestEnvironment) {
      this.isSilent = true;
      this.spinner.stop();
    }

    // Handle cleanup on process exit
    process.on('SIGINT', () => {
      this.ensureSpinnerStopped();
      process.exit();
    });
  }

  private ensureSpinnerStopped(): void {
    if (this.spinner.isSpinning) {
      this.spinner.stop();
    }
  }

  info(message: string): void {
    if (this.isSilent) return;
    this.ensureSpinnerStopped();
    this.spinner.info(message);
  }

  success(message: string): void {
    if (this.isSilent) return;
    this.ensureSpinnerStopped();
    this.spinner.succeed(message);
  }

  warn(message: string): void {
    if (this.isSilent) return;
    this.ensureSpinnerStopped();
    this.spinner.warn(message);
  }

  error(message: string): void {
    if (this.isSilent) return;
    this.ensureSpinnerStopped();
    this.spinner.fail(message);
  }

  progress(current: number, total: number, message: string): void {
    if (this.isSilent) return;

    // Only update if message changed to avoid flickering
    if (message !== this.currentSpinnerText) {
      this.currentSpinnerText = message;
      this.spinner.text = message;

      if (!this.spinner.isSpinning) {
        this.spinner.start();
      }
    }
  }

  debug(message: string): void {
    if (this.isSilent) return;
    if (process.env.NODE_ENV !== 'production') {
      this.ensureSpinnerStopped();
      this.spinner.info(chalk.gray(`🔍 ${message}`));
    }
  }

  section(title: string): void {
    if (this.isSilent) return;
    this.ensureSpinnerStopped();
    console.log(chalk.bold.blue(`\n=== ${title} ===\n`));
  }

  formatObject(obj: Record<string, any>): string {
    if (this.isSilent) return '';
    return Object.entries(obj)
      .map(([ key, value ]) => `${chalk.gray(key)}: ${value}`)
      .join(', ');
  }
}
