module.exports = {
  RPC_URL:     process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
  WS_URL:      process.env.WS_URL  || 'wss://api.mainnet-beta.solana.com',
  PRIVATE_KEY: process.env.PRIVATE_KEY || '',

  BUY_AMOUNT_SOL:        parseFloat(process.env.BUY_AMOUNT_SOL        || '0.05'),
  SLIPPAGE_PERCENT:      parseFloat(process.env.SLIPPAGE_PERCENT       || '20'),
  PRIORITY_FEE_LAMPORTS: parseInt(process.env.PRIORITY_FEE_LAMPORTS    || '200000'),

  // Stop-Loss fixe
  STOP_LOSS_PERCENT: parseFloat(process.env.STOP_LOSS_PERCENT || '25'),

  // Trailing stop progressif
  TRAILING_STOP_PERCENT_LOW:  parseFloat(process.env.TRAILING_STOP_PERCENT_LOW  || '20'), // peak < 100%
  TRAILING_STOP_PERCENT_MID:  parseFloat(process.env.TRAILING_STOP_PERCENT_MID  || '15'), // peak 100-300%
  TRAILING_STOP_PERCENT_HIGH: parseFloat(process.env.TRAILING_STOP_PERCENT_HIGH || '10'), // peak > 300%

  // Filtres qualite
  MIN_LIQUIDITY_USD:    parseFloat(process.env.MIN_LIQUIDITY_USD    || '5000'),
  MIN_VOLUME_5M_USD:    parseFloat(process.env.MIN_VOLUME_5M_USD    || '10000'),
  MIN_MOMENTUM_PCT:     parseFloat(process.env.MIN_MOMENTUM_PCT     || '10'),
  MAX_TOKEN_AGE_MIN:    parseInt(process.env.MAX_TOKEN_AGE_MIN      || '30'),

  // Score minimum pour acheter (0-100)
  MIN_QUALITY_SCORE:    parseInt(process.env.MIN_QUALITY_SCORE      || '60'),

  // Position sizing dynamique
  BUY_AMOUNT_LOW:       parseFloat(process.env.BUY_AMOUNT_LOW       || '0.02'), // score 60-75
  BUY_AMOUNT_MID:       parseFloat(process.env.BUY_AMOUNT_MID       || '0.035'), // score 75-90
  BUY_AMOUNT_HIGH:      parseFloat(process.env.BUY_AMOUNT_HIGH      || '0.05'), // score 90+

  // Ladder sells
  LADDER_SELL_1_PCT:    parseFloat(process.env.LADDER_SELL_1_PCT    || '50'),  // vendre 25% a +50%
  LADDER_SELL_1_SIZE:   parseFloat(process.env.LADDER_SELL_1_SIZE   || '25'),
  LADDER_SELL_2_PCT:    parseFloat(process.env.LADDER_SELL_2_PCT    || '100'), // vendre 25% a +100%
  LADDER_SELL_2_SIZE:   parseFloat(process.env.LADDER_SELL_2_SIZE   || '25'),

  // Horaires de trading (UTC)
  TRADING_HOURS_START:  parseInt(process.env.TRADING_HOURS_START    || '13'), // 13h UTC = 14h Paris
  TRADING_HOURS_END:    parseInt(process.env.TRADING_HOURS_END      || '22'), // 22h UTC

  // Gestion positions
  MAX_OPEN_POSITIONS:         parseInt(process.env.MAX_OPEN_POSITIONS         || '3'),
  POSITION_CHECK_INTERVAL_MS: parseInt(process.env.POSITION_CHECK_INTERVAL_MS || '3000'),
  MAX_POSITION_AGE_MINUTES:   parseInt(process.env.MAX_POSITION_AGE_MINUTES   || '60'),

  TX_RETRY_COUNT:    parseInt(process.env.TX_RETRY_COUNT    || '3'),
  TX_RETRY_DELAY_MS: parseInt(process.env.TX_RETRY_DELAY_MS || '800'),

  PUMP_FUN_PROGRAM:       '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  PUMP_FUN_GLOBAL:        '4wTV81avi73jeAD5MH9b4HAGEqmLKBdKB7w4BDdqFMQN',
  PUMP_FUN_EVENT_AUTH:    'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1',
  PUMP_FUN_FEE_RECIPIENT: 'CebN5WGQ4jvEPvsVU4EoHEpgznyQHeH5mMEDmZbHZkWb',
};
