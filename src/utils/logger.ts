import log from 'loglevel';
import chalk from 'chalk';

// Custom prefix formatting
const prefixes = {
  info: chalk.blue('ℹ'),
  success: chalk.green('✓'),
  warn: chalk.yellow('⚠'),
  error: chalk.red('✖'),
  progress: chalk.blue('↻')
} as const;

class Logger {
  private lastProgressMessage: string = '';
  private isShowingProgress: boolean = false;
  private isTestEnvironment: boolean;

  constructor() {
    // Check if we're in a test environment
    this.isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test';

    // Set appropriate log level
    if (this.isTestEnvironment) {
      log.setLevel('silent');
    } else {
      log.setLevel(process.env.NODE_ENV === 'production' ? 'info' : 'debug');
    }
  }

  /**
   * General information messages
   */
  info(message: string): void {
    if (this.isTestEnvironment) return;
    this.clearProgressIfNeeded();
    log.info(`${prefixes.info} ${message}`);
  }

  /**
   * Success messages
   */
  success(message: string): void {
    if (this.isTestEnvironment) return;
    this.clearProgressIfNeeded();
    log.info(`${prefixes.success} ${message}`);
  }

  /**
   * Warning messages - non-fatal issues
   */
  warn(message: string): void {
    if (this.isTestEnvironment) return;
    this.clearProgressIfNeeded();
    log.warn(`${prefixes.warn} ${message}`);
  }

  /**
   * Error messages - fatal issues
   */
  error(message: string): void {
    if (this.isTestEnvironment) return;
    this.clearProgressIfNeeded();
    log.error(`${prefixes.error} ${message}`);
  }

  /**
   * Progress updates with percentage
   */
  progress(current: number, total: number, message: string): void {
    if (this.isTestEnvironment) return;

    const percentage = Math.round((current / total) * 100);
    const progressMessage = `${prefixes.progress} ${message} (${current}/${total} - ${percentage}%)`;

    if (this.lastProgressMessage !== progressMessage) {
      if (this.isShowingProgress) {
        process.stdout.write('\r\x1b[K');
      }

      process.stdout.write(progressMessage);
      this.lastProgressMessage = progressMessage;
      this.isShowingProgress = true;
    }
  }

  /**
   * Debug messages - only shown in development
   */
  debug(message: string): void {
    if (this.isTestEnvironment) return;
    if (process.env.NODE_ENV !== 'production') {
      this.clearProgressIfNeeded();
      log.debug(chalk.gray(`🔍 ${message}`));
    }
  }

  /**
   * Start a new section with a header
   */
  section(title: string): void {
    if (this.isTestEnvironment) return;
    this.clearProgressIfNeeded();
    log.info(chalk.bold.blue(`\n=== ${title} ===\n`));
  }

  /**
   * Clear progress message if one is currently shown
   */
  private clearProgressIfNeeded(): void {
    if (!this.isTestEnvironment && this.isShowingProgress) {
      process.stdout.write('\n');
      this.isShowingProgress = false;
      this.lastProgressMessage = '';
    }
  }

  /**
   * Format an object for logging
   */
  formatObject(obj: Record<string, any>): string {
    if (this.isTestEnvironment) return '';
    return Object.entries(obj)
      .map(([ key, value ]) => `${chalk.gray(key)}: ${value}`)
      .join(', ');
  }
}

export default new Logger(); 