/**
 * Sniper post-migration — PumpPortal WebSocket
 * pool: pump-amm (découverte clé !)
 * Check dynamique dès 30s
 */

const WebSocket = require('ws');
const fs   = require('fs');
const path = require('path');
const { getSOLBalance, getConnection } = require('./wallet');
const { buyToken } = require('./pumpfun');
const { addPosition, startPositionMonitor, getOpenPositionsCount } = require('./positions');
const { logger } = require('./logger');
const config = require('./config');

const sniped = new Set();

const BLACKLIST_FILE = path.join(__dirname, '..', 'blacklist.json');
const blacklist = new Set();
try {
  if (fs.existsSync(BLACKLIST_FILE)) {
    const data = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'));
    data.forEach(a => blacklist.add(a));
    logger.info(`Blacklist: ${blacklist.size} adresses`);
  }
} catch {}

function addToBlacklist(address) {
  blacklist.add(address);
  try { fs.writeFileSync(BLACKLIST_FILE, JSON.stringify([...blacklist], null, 2)); } catch {}
}

function isTradingHours() {
  const hour = new Date().getUTCHours();
  return hour >= config.TRADING_HOURS_START && hour < config.TRADING_HOURS_END;
}

async function getDynamicPriorityFee() {
  try {
    const conn = getConnection();
    const fees = await conn.getRecentPrioritizationFees();
    if (!fees || fees.length === 0) return config.PRIORITY_FEE_LAMPORTS;
    const sorted = fees.map(f => f.prioritizationFee).sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    return Math.floor(Math.min(Math.max(p75 * 1.2, 50000), 1000000));
  } catch {
    return config.PRIORITY_FEE_LAMPORTS;
  }
}

async function getTokenScore(mint) {
  try {
    const res  = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const data = await res.json();
    const pairs = data?.pairs;
    if (!pairs || pairs.length === 0) return { score: 0, reason: 'Aucune paire', buyAmount: 0 };

    const best = pairs[0];
    let score = 0;
    const details = [];

    // Age (max 20pts)
    const pairCreatedAt = best.pairCreatedAt;
    if (pairCreatedAt) {
      const ageMin = (Date.now() - pairCreatedAt) / 60000;
      if (ageMin > config.MAX_TOKEN_AGE_MIN) {
        return { score: 0, reason: `Trop vieux: ${ageMin.toFixed(0)}min`, buyAmount: 0 };
      }
      const ageScore = Math.max(0, 20 - (ageMin / config.MAX_TOKEN_AGE_MIN) * 20);
      score += ageScore;
      details.push(`age: ${ageMin.toFixed(0)}min (+${ageScore.toFixed(0)})`);
    }

    // Liquidité (max 25pts)
    const liqUsd = parseFloat(best?.liquidity?.usd || 0);
    if (liqUsd < config.MIN_LIQUIDITY_USD) {
      return { score: 0, reason: `Liq: $${liqUsd.toFixed(0)}`, buyAmount: 0 };
    }
    const liqScore = Math.min(25, (liqUsd / 15000) * 25);
    score += liqScore;
    details.push(`liq: $${liqUsd.toFixed(0)} (+${liqScore.toFixed(0)})`);

    // Volume 5min (max 20pts)
    const vol5m = parseFloat(best?.volume?.m5 || 0);
    if (vol5m < config.MIN_VOLUME_5M_USD) {
      return { score: 0, reason: `Vol5m: $${vol5m.toFixed(0)}`, buyAmount: 0 };
    }
    const volScore = Math.min(20, (vol5m / 10000) * 20);
    score += volScore;
    details.push(`vol: $${vol5m.toFixed(0)} (+${volScore.toFixed(0)})`);

    // Transactions 5min (max 20pts)
    const txns5m = (best?.txns?.m5?.buys || 0) + (best?.txns?.m5?.sells || 0);
    if (txns5m < 20) {
      return { score: 0, reason: `Trop peu de txns: ${txns5m}`, buyAmount: 0 };
    }
    const txnsScore = Math.min(20, (txns5m / 100) * 20);
    score += txnsScore;
    details.push(`txns: ${txns5m} (+${txnsScore.toFixed(0)})`);

    // Momentum (max 15pts)
    const priceChange5m = parseFloat(best?.priceChange?.m5 || 0);
    if (priceChange5m < config.MIN_MOMENTUM_PCT) {
      return { score: 0, reason: `Momentum: ${priceChange5m.toFixed(1)}%`, buyAmount: 0 };
    }
    const priceChange1h = parseFloat(best?.priceChange?.h1 || 0);
    if (priceChange1h < -20) {
      return { score: 0, reason: `Dump 1h: ${priceChange1h.toFixed(1)}%`, buyAmount: 0 };
    }
    const momentumScore = Math.min(15, (priceChange5m / 50) * 15);
    score += momentumScore;
    details.push(`momentum: +${priceChange5m.toFixed(1)}% (+${momentumScore.toFixed(0)})`);


    // Verification concentration holders via RPC
    try {
      const API_KEY = process.env.RPC_URL?.match(/api-key=([^&]+)/)?.[1] || 'a384eff1-09da-4489-91d1-3d766ac6b25e';
      const [holdersRes, mintInfoRes] = await Promise.all([
        fetch(`https://mainnet.helius-rpc.com/?api-key=${API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenLargestAccounts', params: [mint] })
        }),
        fetch(`https://mainnet.helius-rpc.com/?api-key=${API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [mint, { encoding: 'jsonParsed' }] })
        })
      ]);
      const holdersData = await holdersRes.json();
      const mintInfoData = await mintInfoRes.json();
      const supply = parseFloat(mintInfoData.result?.value?.data?.parsed?.info?.supply || 0);
      const decimals = mintInfoData.result?.value?.data?.parsed?.info?.decimals || 6;
      const realSupply = supply / Math.pow(10, decimals);
      const top5 = holdersData.result?.value?.slice(0, 5) || [];
      const top1Pct = top5[0] ? (top5[0].uiAmount / realSupply) * 100 : 0;
      const top5Pct = top5.reduce((sum, h) => sum + (h.uiAmount / realSupply) * 100, 0);
      if (top1Pct > 25) {
        return { score: 0, reason: `Top holder trop concentre: ${top1Pct.toFixed(1)}%`, buyAmount: 0 };
      }
      if (top5Pct > 50) {
        return { score: 0, reason: `Top 5 trop concentres: ${top5Pct.toFixed(1)}%`, buyAmount: 0 };
      }
      details.push(`holders: top1=${top1Pct.toFixed(1)}% top5=${top5Pct.toFixed(1)}%`);
    } catch (e) {
      logger.warn(`Holders check failed: ${e.message}`);
    }
    score = Math.floor(score);
    let buyAmount = 0;
    if (score >= 90)                            buyAmount = config.BUY_AMOUNT_HIGH;
    else if (score >= 75)                       buyAmount = config.BUY_AMOUNT_MID;
    else if (score >= config.MIN_QUALITY_SCORE) buyAmount = config.BUY_AMOUNT_LOW;

    logger.info(`Score ${mint.slice(0,8)}: ${score}/100 | ${details.join(' | ')} | ${buyAmount} SOL`);
    return { score, buyAmount, liqUsd, vol5m, priceChange5m, txns5m };

  } catch (err) {
    return { score: 0, reason: err.message, buyAmount: 0 };
  }
}

async function buyWithRetry(mint, solAmount, fee) {
  for (let i = 1; i <= config.TX_RETRY_COUNT; i++) {
    try {
      return await buyToken(mint, solAmount, fee);
    } catch (err) {
      if (i === config.TX_RETRY_COUNT) throw err;
      logger.warn(`Retry ${i}/${config.TX_RETRY_COUNT}: ${err.message}`);
      await new Promise(r => setTimeout(r, config.TX_RETRY_DELAY_MS));
    }
  }
}

async function checkAndBuy(mint, detectedAt) {
  const MIN_WAIT_MS = 30  * 1000; // 30s minimum
  const MAX_WAIT_MS = 6   * 60 * 1000; // 6 minutes max
  const CHECK_MS    = 30  * 1000;

  await new Promise(r => setTimeout(r, MIN_WAIT_MS));
  let elapsed = MIN_WAIT_MS;

  while (elapsed < MAX_WAIT_MS) {
    if (!isTradingHours()) { logger.warn(`Hors trading — skip ${mint.slice(0,8)}`); return; }
    if (getOpenPositionsCount() >= config.MAX_OPEN_POSITIONS) { logger.warn(`Max positions — skip ${mint.slice(0,8)}`); return; }
    if (blacklist.has(mint)) return;

    const balance = await getSOLBalance();
    if (balance < config.BUY_AMOUNT_LOW + 0.01) { logger.warn(`SOL insuffisant`); return; }

    const check = await getTokenScore(mint);

    if (check.buyAmount > 0) {
      const delay = ((Date.now() - detectedAt) / 1000).toFixed(0);
      logger.snipe(`✅ [${mint.slice(0,8)}] OK apres ${delay}s | score: ${check.score}/100 | ${check.buyAmount} SOL`);
      const fee = await getDynamicPriorityFee();
      try {
        const result = await buyWithRetry(mint, check.buyAmount, fee);
        addPosition(mint, check.buyAmount, check.score, result?.reserves);
        return;
      } catch (err) {
        logger.error(`Achat echoue ${mint.slice(0,8)}: ${err.message}`);
        if (err.message?.includes('0x1775') || err.message?.includes('400')) addToBlacklist(mint);
        return;
      }
    }

    logger.info(`[${mint.slice(0,8)}] ${elapsed/1000}s — ${check.reason}`);
    await new Promise(r => setTimeout(r, CHECK_MS));
    elapsed += CHECK_MS;
  }
  logger.warn(`Timeout — skip ${mint.slice(0,8)}`);
}

function connectWebSocket() {
  const ws = new WebSocket('wss://pumpportal.fun/api/data');

  ws.on('open', () => {
    logger.success('WebSocket PumpPortal connecte');
    ws.send(JSON.stringify({ method: 'subscribeMigration' }));
    logger.info(`Check dès 30s | Score min: ${config.MIN_QUALITY_SCORE}/100`);
    logger.info(`SL: -${config.STOP_LOSS_PERCENT}% | Trailing: -25% | Ladder: +100% | Exit: +400%`);
    logger.info(`Trading: ${config.TRADING_HOURS_START}h-${config.TRADING_HOURS_END}h UTC`);
  });

  ws.on('message', async (data) => {
    try {
      const event = JSON.parse(data);
      logger.info(`WS msg: ${JSON.stringify(event).slice(0,100)}`);
      const mint   = event.mint;
      const symbol = event.symbol || '???';

      if (!mint) return;
      if (sniped.has(mint)) { logger.info(`Skip (deja vu): ${mint.slice(0,8)}`); return; }
      if (blacklist.has(mint)) { logger.info(`Skip (blacklist): ${mint.slice(0,8)}`); return; }
      sniped.add(mint);

      logger.snipe(`Migration: ${mint.slice(0,8)} | ${symbol} | pool: ${event.pool || '?'}`);
      checkAndBuy(mint, Date.now()).catch(e => logger.error(`checkAndBuy: ${e.message}`));

    } catch (err) {
      logger.error('Migration error:', err.message);
    }
  });

  ws.on('error', (err) => logger.error('WebSocket erreur:', err.message));
  ws.on('close', () => {
    logger.warn('WebSocket deconnecte — reconnexion dans 3s...');
    setTimeout(connectWebSocket, 3000);
  });
}

async function sniperLoop() {
  startPositionMonitor();
  logger.info('Bot post-migration — PumpPortal WebSocket + pool pump-amm');
  connectWebSocket();
  await new Promise(() => {});
}

module.exports = { sniperLoop };
