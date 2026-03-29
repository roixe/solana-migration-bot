const { PublicKey } = require('@solana/web3.js');
const { getMint }   = require('@solana/spl-token');
const { getConnection } = require('./wallet');
const { logger }    = require('./logger');
const config        = require('./config');

async function checkTokenSafety(mintAddress) {
  const conn = getConnection();
  const reasons = [];

  let mintInfo;
  try {
    mintInfo = await getMint(conn, new PublicKey(mintAddress));
  } catch (e) {
    return { safe: false, reasons: ['Mint illisible: ' + e.message] };
  }

  if (config.REQUIRE_MINT_DISABLED && mintInfo.mintAuthority !== null)
    reasons.push('Mint authority non révoquée');

  if (config.REQUIRE_FREEZE_DISABLED && mintInfo.freezeAuthority !== null)
    reasons.push('Freeze authority non révoquée');

  const safe = reasons.length === 0;
  if (!safe) logger.warn(`Skip ${mintAddress.slice(0,8)}: ${reasons.join(' | ')}`);
  return { safe, reasons };
}

module.exports = { checkTokenSafety };
