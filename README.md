> 🛒 **[Get full source code on Gumroad — $39] https://eroixe.gumroad.com/l/xkzwwd**


# solana-migration-bot

A high-performance Solana trading bot that automatically detects and trades tokens migrating from pump.fun to the Raydium pump-amm pool.

## Features

- **Real-time migration detection** via PumpPortal WebSocket
- **Real-time price tracking** via direct RPC pool reserves (no DexScreener delay)
- **Quality score system** (0-100) based on liquidity, volume, transactions and momentum
- **Anti-rug filters** — holder concentration check via Helius RPC
- **Dynamic position management** — trailing stop, ladder sells, time exit
- **Persistent positions** — survives bot restarts
- **PM2 ready** — runs 24/7 on any VPS

## How It Works

1. PumpPortal WebSocket detects a pump.fun → Raydium migration in real-time
2. Bot waits 30 seconds, then checks quality score every 30s (up to 6 minutes)
3. If score ≥ 40/100 and holder concentration is safe → buy
4. Price tracked via direct RPC pool reserves (< 1 second latency)
5. Exit via trailing stop, ladder sell at +50%, or time exit after 45 minutes

## Quality Score (0-100)

| Criteria | Max Points | Minimum |
|---|---|---|
| Token age | 20 pts | < 8 minutes |
| Liquidity | 25 pts | > $5,000 |
| Volume 5min | 20 pts | > $3,000 |
| Transactions 5min | 20 pts | > 20 txns |
| Price momentum | 15 pts | > +5% |

## Exit Strategy

- **Ladder sell** — sell 50% at +50% profit
- **Trailing stop** — -20% from peak (before ladder), -15% (after ladder)
- **Stop-loss** — fixed at -35%
- **Time exit** — forced sell after 45 minutes

## Requirements

- Node.js 18+
- [Helius RPC](https://helius.dev) API key (free tier works)
- Solana wallet with SOL
- VPS or always-on machine (optional but recommended)

## Installation
```bash
git clone https://github.com/yourusername/solana-migration-bot
cd solana-migration-bot
npm install
cp .env.example .env
# Edit .env with your keys
npm start
```

## Configuration

Copy `.env.example` to `.env` and fill in your values:
```env
PRIVATE_KEY=your_wallet_private_key
RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
WS_URL=wss://mainnet.helius-rpc.com/?api-key=YOUR_KEY

# Position sizing
BUY_AMOUNT_LOW=0.05      # score 40-74
BUY_AMOUNT_MID=0.07      # score 75-89
BUY_AMOUNT_HIGH=0.10     # score 90+

# Exit rules
STOP_LOSS_PERCENT=35
LADDER_SELL_1_PCT=50
LADDER_SELL_1_SIZE=50
MAX_POSITION_AGE_MINUTES=45

# Filters
MIN_QUALITY_SCORE=40
MIN_LIQUIDITY_USD=5000
MIN_VOLUME_5M_USD=3000
MIN_MOMENTUM_PCT=5
MAX_TOKEN_AGE_MIN=8

# Trading hours (UTC)
TRADING_HOURS_START=6
TRADING_HOURS_END=22

# Max concurrent positions
MAX_OPEN_POSITIONS=3
```

## Project Structure
```
src/
  sniper.js     — Migration detection + quality scoring + buy logic
  positions.js  — Position tracking, trailing stop, ladder sells
  pumpfun.js    — Buy/sell via PumpPortal + RPC price from pool reserves
  wallet.js     — Keypair management
  config.js     — Configuration from .env
  logger.js     — Colored console output
index.js        — Entry point
```

## Dashboard

Monitor your bot in real-time:
```bash
node dashboard.js
```

## Risk Warning

Trading memecoins is extremely high risk. This bot is provided as-is with no guarantee of profit. Only trade with funds you can afford to lose. Always test with small amounts first.

## License

MIT
