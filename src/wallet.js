const { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bs58 = require('bs58');
const config = require('./config');
const { logger } = require('./logger');

let _keypair = null;
let _connection = null;

/**
 * Load keypair from base58 private key (Phantom export format)
 */
function getKeypair() {
  if (_keypair) return _keypair;
  if (!config.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY not set in .env — export it from Phantom: Settings > Security > Export Private Key');
  }
  const secretKey = bs58.decode(config.PRIVATE_KEY);
  _keypair = Keypair.fromSecretKey(secretKey);
  logger.info(`Wallet loaded: ${_keypair.publicKey.toBase58()}`);
  return _keypair;
}

/**
 * Get or create the RPC connection
 */
function getConnection() {
  if (_connection) return _connection;
  _connection = new Connection(config.RPC_URL, {
    commitment: 'confirmed',
    wsEndpoint: config.WS_URL,
  });
  return _connection;
}

/**
 * Return wallet SOL balance
 */
async function getSOLBalance() {
  const conn = getConnection();
  const kp   = getKeypair();
  const lamports = await conn.getBalance(kp.publicKey);
  return lamports / LAMPORTS_PER_SOL;
}

module.exports = { getKeypair, getConnection, getSOLBalance };
