const { VersionedTransaction, PublicKey } = require('@solana/web3.js');
const { getConnection, getKeypair } = require('./wallet');
const { logger } = require('./logger');
const config = require('./config');

const PUMPPORTAL_URL = 'https://pumpportal.fun/api/trade-local';
const HELIUS_API = `https://api-mainnet.helius-rpc.com/v0/transactions/?api-key=${process.env.HELIUS_API_KEY || 'a384eff1-09da-4489-91d1-3d766ac6b25e'}`;
const WSOL = 'So11111111111111111111111111111111111111112';

async function sendTrade(action, mint, amount, priorityFeeLamports) {
  const conn    = getConnection();
  const keypair = getKeypair();
  const fee     = priorityFeeLamports || config.PRIORITY_FEE_LAMPORTS;

  const payload = {
    publicKey:        keypair.publicKey.toBase58(),
    action,
    mint,
    amount,
    denominatedInSol: action === 'buy',
    slippage:         config.SLIPPAGE_PERCENT,
    priorityFee:      fee / 1_000_000_000,
    pool:             'pump-amm',
  };

  const response = await fetch(PUMPPORTAL_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PumpPortal API error ${response.status}: ${text}`);
  }

  const txBytes = await response.arrayBuffer();
  const tx = VersionedTransaction.deserialize(new Uint8Array(txBytes));
  tx.sign([getKeypair()]);

  const sig = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight:       false,
    preflightCommitment: 'confirmed',
  });

  await conn.confirmTransaction(sig, 'confirmed');
  return sig;
}

// Extraire les reserves via Helius Enhanced API
async function extractPoolReserves(signature, mint) {
  try {
    const res = await fetch(HELIUS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: [signature] })
    });
    const data = await res.json();
    const tx = data[0];
    if (!tx) return null;

    const ourWallet = getKeypair().publicKey.toBase58();
    const transfers = tx.tokenTransfers || [];

    // Token reserve = compte token qui envoie le mint vers notre wallet
    const tokenTransfer = transfers.find(t =>
      t.mint === mint &&
      t.toUserAccount === ourWallet
    );
    const tokenReserve = tokenTransfer?.fromTokenAccount || null;

    // SOL reserve = compte qui recoit le SOL du pool
    const solTransfer = transfers.find(t =>
      t.mint === WSOL &&
      t.fromUserAccount === ourWallet &&
      t.toUserAccount !== ourWallet
    );
    const solReserve = solTransfer?.toTokenAccount || null;

    if (tokenReserve && solReserve) {
      logger.info(`Pool reserves: SOL=${solReserve.slice(0,8)} | Token=${tokenReserve.slice(0,8)}`);
    }

    return { tokenReserve, solReserve };
  } catch (err) {
    logger.error(`extractPoolReserves: ${err.message}`);
    return null;
  }
}

async function buyToken(mintAddress, solAmountSOL, priorityFeeLamports) {
  const sig = await sendTrade('buy', mintAddress, solAmountSOL, priorityFeeLamports);
  logger.trade(`BUY  ${mintAddress.slice(0,8)} | ${solAmountSOL} SOL | tx: ${sig}`);

  // Extraire les reserves du pool
  const reserves = await extractPoolReserves(sig, mintAddress);
  return { sig, reserves };
}

async function sellToken(mintAddress, _tokenAmount, priorityFeeLamports) {
  const sig = await sendTrade('sell', mintAddress, '100%', priorityFeeLamports);
  logger.trade(`SELL ${mintAddress.slice(0,8)} | 100% | tx: ${sig}`);
  return { sig };
}

// Prix temps reel via reserves du pool
async function getPriceFromPool(solReserve, tokenReserve) {
  try {
    const conn = getConnection();
    const [solInfo, tokenInfo] = await Promise.all([
      conn.getAccountInfo(new PublicKey(solReserve)),
      conn.getParsedAccountInfo(new PublicKey(tokenReserve)),
    ]);

    if (!solInfo) return null;
    const solBalance   = solInfo.lamports / 1e9;
    const tokenBalance = tokenInfo.value?.data?.parsed?.info?.tokenAmount?.uiAmount;
    if (!tokenBalance || tokenBalance === 0) return null;

    return solBalance / tokenBalance;
  } catch {
    return null;
  }
}

module.exports = { buyToken, sellToken, getPriceFromPool };
