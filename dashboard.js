/**
 * solana-migration-bot — Real-time Dashboard
 * Run: node dashboard.js
 */

const fs   = require('fs');
const path = require('path');

const PNL_FILE       = path.join(__dirname, 'pnl.json');
const POSITIONS_FILE = path.join(__dirname, 'positions.json');
const BLACKLIST_FILE = path.join(__dirname, 'blacklist.json');
const LOG_FILE       = path.join(process.env.HOME, '.pm2/logs/pumpfun-bot-out.log');

function formatSOL(val) {
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(5)} SOL`;
}

function display() {
  console.clear();

  const now = new Date().toLocaleTimeString();
  console.log('╔══════════════════════════════════════════╗');
  console.log('║       SOLANA MIGRATION BOT — DASHBOARD   ║');
  console.log(`╠══════════════════════════════════════════╣`);
  console.log(`║  ${now.padEnd(41)}║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // PnL
  try {
    const pnl  = JSON.parse(fs.readFileSync(PNL_FILE, 'utf8'));
    const sign = pnl.total >= 0 ? '📈' : '📉';
    console.log(`${sign}  PnL TOTAL : ${formatSOL(pnl.total)}`);
    console.log(`🔢  Trades   : ${pnl.trades}`);
    console.log(`🕐  Updated  : ${new Date(pnl.updatedAt).toLocaleTimeString()}`);
  } catch {
    console.log('💰  PnL: no data yet');
  }

  console.log('');
  console.log('──── OPEN POSITIONS ───────────────────────');

  // Positions
  try {
    const positions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf8'));
    if (positions.length === 0) {
      console.log('  No open positions');
    } else {
      positions.forEach(pos => {
        const ageMin = ((Date.now() - pos.openedAt) / 60000).toFixed(1);
        console.log(`  🔵 ${pos.mint.slice(0,8)} | ${pos.solSpent} SOL | ${ageMin}min | score: ${pos.score}`);
        if (pos.entryPrice) {
          console.log(`     Entry : ${pos.entryPrice.toFixed(10)} SOL`);
        }
        if (pos.peakPrice && pos.entryPrice) {
          const peakPct = ((pos.peakPrice - pos.entryPrice) / pos.entryPrice * 100).toFixed(1);
          console.log(`     Peak  : +${peakPct}%`);
        }
        if (pos.ladder1Done) {
          console.log(`     ✅ Ladder +50% executed`);
        }
      });
    }
  } catch {
    console.log('  No position data');
  }

  console.log('');
  console.log('──── STATS ────────────────────────────────');

  // Blacklist
  try {
    const bl = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'));
    console.log(`  🚫 Blacklisted tokens : ${bl.length}`);
  } catch {
    console.log('  🚫 Blacklist : 0');
  }

  console.log('');
  console.log('──── LAST LOGS ────────────────────────────');

  // Logs
  try {
    const logs  = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = logs.trim().split('\n').slice(-8);
    lines.forEach(l => console.log(' ', l.slice(0, 76)));
  } catch {
    console.log('  No logs available');
  }

  console.log('');
  console.log('──────────────────────────────────────────');
  console.log('  Ctrl+C to exit | Refreshes every 2s');
}

display();
setInterval(display, 2000);
