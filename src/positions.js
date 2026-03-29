const fs   = require('fs');
const path = require('path');
const { sellToken, getPriceFromPool } = require('./pumpfun');
const { logger } = require('./logger');
const config = require('./config');

const PNL_FILE       = path.join(__dirname, '..', 'pnl.json');
const POSITIONS_FILE = path.join(__dirname, '..', 'positions.json');

function loadPnL() {
  try {
    if (fs.existsSync(PNL_FILE)) {
      const data = JSON.parse(fs.readFileSync(PNL_FILE, 'utf8'));
      return { total: data.total || 0, trades: data.trades || 0 };
    }
  } catch {}
  return { total: 0, trades: 0 };
}

function savePnL(total, trades) {
  try {
    fs.writeFileSync(PNL_FILE, JSON.stringify({
      total, trades, updatedAt: new Date().toISOString()
    }, null, 2));
  } catch {}
}

function loadPositions() {
  try {
    if (fs.existsSync(POSITIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf8'));
      logger.info(`${data.length} position(s) restauree(s)`);
      return data;
    }
  } catch {}
  return [];
}

function savePositions(map) {
  try {
    fs.writeFileSync(POSITIONS_FILE, JSON.stringify([...map.values()], null, 2));
  } catch {}
}

let { total: totalPnLSOL, trades: closedTrades } = loadPnL();
logger.info(`PnL charge — ${totalPnLSOL >= 0 ? '+' : ''}${totalPnLSOL.toFixed(5)} SOL | ${closedTrades} trades`);

const positions = new Map();
for (const pos of loadPositions()) {
  positions.set(pos.mint, pos);
  logger.info(`Position restauree: ${pos.mint.slice(0,8)} | ${pos.solSpent} SOL`);
}

function addPosition(mint, solSpent, score, reserves) {
  positions.set(mint, {
    mint, solSpent, score,
    openedAt:     Date.now(),
    entryPrice:   null,
    peakPrice:    null,
    ladder1Done:  false,
    remainingPct: 100,
    // Reserves du pool pour prix RPC temps reel
    solReserve:   reserves?.solReserve   || null,
    tokenReserve: reserves?.tokenReserve || null,
  });
  savePositions(positions);
  logger.success(`Position ouverte: ${mint.slice(0,8)} | ${solSpent} SOL | score: ${score}`);
}

function removePosition(mint) {
  positions.delete(mint);
  savePositions(positions);
}

function getOpenPositionsCount() { return positions.size; }

function isFatalError(msg) {
  return msg && (
    msg.includes('0x1775') ||
    msg.includes('0x1786') ||
    msg.includes('0x1771') ||
    msg.includes('BondingCurveComplete') ||
    msg.includes('SellZeroAmount') ||
    msg.includes('ZeroBaseAmount') ||
    msg.includes('introuvable')
  );
}

// Prix via RPC direct si reserves disponibles, sinon DexScreener
async function getTokenPrice(pos) {
  // Priorité au prix RPC — temps réel
  if (pos.solReserve && pos.tokenReserve) {
    const price = await getPriceFromPool(pos.solReserve, pos.tokenReserve);
    if (price) return { price, source: 'RPC' };
  }

  // Fallback DexScreener
  try {
    const res  = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${pos.mint}`);
    const data = await res.json();
    const best = data?.pairs?.[0];
    if (!best) return { price: null, source: 'none' };

    const priceNative = parseFloat(best?.priceNative);
    if (priceNative > 0) return { price: priceNative, source: 'DEX' };

    const priceUsd = parseFloat(best?.priceUsd);
    const solRes   = await fetch('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112');
    const solData  = await solRes.json();
    const solUsd   = parseFloat(solData?.pairs?.[0]?.priceUsd);
    if (priceUsd && solUsd) return { price: priceUsd / solUsd, source: 'DEX' };
  } catch {}

  return { price: null, source: 'none' };
}

// Vente partielle ladder
async function sellPartial(mint, percentage, reason) {
  try {
    const { getKeypair, getConnection } = require('./wallet');
    const { VersionedTransaction } = require('@solana/web3.js');

    const res = await fetch('https://pumpportal.fun/api/trade-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey:        getKeypair().publicKey.toBase58(),
        action:           'sell',
        mint,
        amount:           `${percentage}%`,
        denominatedInSol: false,
        slippage:         config.SLIPPAGE_PERCENT,
        priorityFee:      config.PRIORITY_FEE_LAMPORTS / 1_000_000_000,
        pool:             'pump-amm',
      }),
    });

    if (!res.ok) throw new Error(`PumpPortal ${res.status}`);

    const txBytes = await res.arrayBuffer();
    const tx = VersionedTransaction.deserialize(new Uint8Array(txBytes));
    tx.sign([getKeypair()]);
    const sig = await getConnection().sendRawTransaction(tx.serialize(), { skipPreflight: false });
    await getConnection().confirmTransaction(sig, 'confirmed');

    logger.trade(`LADDER ${percentage}% | ${reason} | tx: ${sig.slice(0,8)}`);
    return true;
  } catch (err) {
    logger.error(`Ladder sell echoue: ${err.message}`);
    return false;
  }
}

async function checkPositions() {
  if (positions.size === 0) return;

  for (const [mint, pos] of positions.entries()) {
    try {
      const ageMin = (Date.now() - pos.openedAt) / 60000;
      const { price: currentPrice, source } = await getTokenPrice(pos);

      if (currentPrice === null) {
        logger.info(`[${mint.slice(0,8)}] Prix indisponible | age: ${ageMin.toFixed(1)}min`);
        if (ageMin >= config.MAX_POSITION_AGE_MINUTES) {
          try { await sellToken(mint, null); } catch {}
          removePosition(mint);
        }
        continue;
      }

      if (pos.entryPrice === null) {
        pos.entryPrice = currentPrice;
        pos.peakPrice  = currentPrice;
        savePositions(positions);
        logger.info(`[${mint.slice(0,8)}] Prix entree: ${currentPrice.toFixed(10)} SOL [${source}]`);
        continue;
      }

      if (currentPrice > pos.peakPrice) {
        pos.peakPrice = currentPrice;
        savePositions(positions);
      }

      const pnlPct       = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
      const peakPct      = ((pos.peakPrice - pos.entryPrice) / pos.entryPrice) * 100;
      const dropFromPeak = ((pos.peakPrice - currentPrice) / pos.peakPrice) * 100;

      logger.info(
        `[${mint.slice(0,8)}] PnL: ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(1)}% | ` +
        `Peak: +${peakPct.toFixed(1)}% | Recul: -${dropFromPeak.toFixed(1)}% | ` +
        `age: ${ageMin.toFixed(1)}min [${source}]`
      );

      // Ladder +100% → vendre 50%
      if (!pos.ladder1Done && pnlPct >= config.LADDER_SELL_1_PCT) {
        logger.trade(`LADDER +${config.LADDER_SELL_1_PCT}% → vente ${config.LADDER_SELL_1_SIZE}% | ${mint.slice(0,8)}`);
        pos.ladder1Done = true;
        const ok = await sellPartial(mint, config.LADDER_SELL_1_SIZE, `+${pnlPct.toFixed(1)}%`);
        if (ok) {
          const pnlSOL = pos.solSpent * config.LADDER_SELL_1_SIZE / 100 * (pnlPct / 100);
          totalPnLSOL += pnlSOL;
          closedTrades++;
          savePnL(totalPnLSOL, closedTrades);
          pos.remainingPct -= config.LADDER_SELL_1_SIZE;
          savePositions(positions);
          logger.success(`Ladder | +${pnlSOL.toFixed(5)} SOL | TOTAL: ${totalPnLSOL >= 0 ? '+' : ''}${totalPnLSOL.toFixed(5)} SOL`);
        }
      }

      // Exit total +400%
      if (pnlPct >= 400) {
        logger.trade(`EXIT +400% → SELL ${mint.slice(0,8)}`);
        try {
          await sellToken(mint, null);
          const pnlSOL = pos.solSpent * (pos.remainingPct / 100) * (pnlPct / 100);
          totalPnLSOL += pnlSOL;
          closedTrades++;
          savePnL(totalPnLSOL, closedTrades);
          logger.success(`Trade #${closedTrades} | +${pnlSOL.toFixed(5)} SOL | TOTAL: ${totalPnLSOL >= 0 ? '+' : ''}${totalPnLSOL.toFixed(5)} SOL`);
          removePosition(mint);
          continue;
        } catch (err) {
          if (isFatalError(err.message)) { removePosition(mint); continue; }
        }
      }

      // SL / Trailing / Time exit
      let reason = null;
      if (pnlPct <= -config.STOP_LOSS_PERCENT) {
        reason = `STOP-LOSS ${pnlPct.toFixed(1)}%`;
      } else if (peakPct > 0 && dropFromPeak >= (pos.ladder1Done ? 15 : 30)) {
        reason = `TRAILING -30% (peak: +${peakPct.toFixed(1)}%)`;
      } else if (ageMin >= config.MAX_POSITION_AGE_MINUTES) {
        reason = `TIME EXIT ${ageMin.toFixed(0)}min`;
      }

      if (reason) {
        logger.trade(`${reason} → SELL ${mint.slice(0,8)}`);
        try {
          await sellToken(mint, null);
          const pnlSOL = pos.solSpent * (pos.remainingPct / 100) * (pnlPct / 100);
          totalPnLSOL += pnlSOL;
          closedTrades++;
          savePnL(totalPnLSOL, closedTrades);
          logger.success(`Trade #${closedTrades} | ${pnlSOL >= 0 ? '+' : ''}${pnlSOL.toFixed(5)} SOL | TOTAL: ${totalPnLSOL >= 0 ? '+' : ''}${totalPnLSOL.toFixed(5)} SOL`);
          removePosition(mint);
        } catch (err) {
          if (isFatalError(err.message)) {
            logger.warn(`[${mint.slice(0,8)}] Erreur fatale — fermeture locale`);
            removePosition(mint);
          } else {
            logger.error(`Sell echoue: ${err.message}`);
          }
        }
      }

    } catch (err) {
      if (isFatalError(err.message)) {
        logger.warn(`${mint.slice(0,8)} fermeture`);
        removePosition(mint);
      } else {
        logger.error(`Erreur check ${mint.slice(0,8)}: ${err.message}`);
      }
    }
  }
}

function startPositionMonitor() {
  setInterval(checkPositions, config.POSITION_CHECK_INTERVAL_MS);
  logger.info(`Monitor | SL: -${config.STOP_LOSS_PERCENT}% | Trailing: -30% | Ladder: +${config.LADDER_SELL_1_PCT}% | Exit: +400%`);
}

module.exports = { addPosition, removePosition, startPositionMonitor, getOpenPositionsCount };
