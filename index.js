/**
 * solana-migration-bot
 * Automatically trades pump.fun → Raydium migrations
 *
 * Usage:
 *   npm start          — start the bot
 *   node dashboard.js  — open the real-time dashboard
 */

require('dotenv').config();

const { sniperLoop } = require('./src/sniper');
const { logger }     = require('./src/logger');
const config         = require('./src/config');

async function main() {
  logger.info('🚀 solana-migration-bot starting...');
  logger.info(`📡 RPC: ${config.RPC_URL?.slice(0, 50)}...`);
  logger.info(`💰 Buy: ${config.BUY_AMOUNT_LOW}/${config.BUY_AMOUNT_MID}/${config.BUY_AMOUNT_HIGH} SOL`);
  logger.info(`🛡️  SL: -${config.STOP_LOSS_PERCENT}% | Ladder: +${config.LADDER_SELL_1_PCT}% | Max age: ${config.MAX_POSITION_AGE_MINUTES}min`);
  logger.info(`⏰  Trading hours: ${config.TRADING_HOURS_START}h-${config.TRADING_HOURS_END}h UTC`);

  await sniperLoop();
}

main().catch(err => {
  logger.error('Fatal error:', err.message);
  process.exit(1);
});
