import log from 'loglevel';
import chalk from 'chalk';

// Configure log level based on environment
log.setLevel(process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Custom formatting for different log levels
const logger = {
  info: (message: string) => {
    console.clear(); // Clear before new info
    log.info(chalk.blue('ℹ'), message);
  },
  success: (message: string) => {
    console.clear(); // Clear before success message
    log.info(chalk.green('✓'), message);
  },
  warn: (message: string) => log.warn(chalk.yellow('⚠'), message),
  error: (message: string) => log.error(chalk.red('✖'), message),
  progress: (current: number, total: number, message: string) => {
    console.clear(); // Clear before progress update
    const percentage = Math.round((current / total) * 100);
    log.info(
      chalk.blue('↻'),
      `${message}\n` +
      `Progress: ${current}/${total} (${percentage}%)`
    );
  },
  clear: () => console.clear()
};

export default logger; 