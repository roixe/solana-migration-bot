const chalk = require('chalk');

const timestamp = () => new Date().toISOString().replace('T', ' ').substring(0, 19);

const logger = {
  info:    (...args) => console.log(chalk.cyan(`[${timestamp()}] INFO `), ...args),
  success: (...args) => console.log(chalk.green(`[${timestamp()}] OK   `), ...args),
  warn:    (...args) => console.log(chalk.yellow(`[${timestamp()}] WARN `), ...args),
  error:   (...args) => console.log(chalk.red(`[${timestamp()}] ERR  `), ...args),
  trade:   (...args) => console.log(chalk.magenta(`[${timestamp()}] TRADE`), ...args),
  snipe:   (...args) => console.log(chalk.bgGreen.black(`[${timestamp()}] SNIPE`), ...args),
};

module.exports = { logger };
