import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

import { submitCallTx } from '@midnight-ntwrk/midnight-js/contracts';
import {
  ProofFolio,
  createProviders,
  createWallet,
  makeCompiledContractForDeployment,
  toBytes32FromHex,
  waitForWalletSync,
} from './midnight-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEPLOYMENT_FILE = path.join(PROJECT_ROOT, 'deployment.json');
const FRONTEND_ENV_FILE = path.join(PROJECT_ROOT, 'frontend/.env.local');
const DEFAULT_PRIVATE_STATE_ID = 'ProofFolio-api-private-state-preprod';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = 'true';
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function normalizeHex(value) {
  return value.trim().toLowerCase().replace(/^0x/, '');
}

function readRequiredHex32(label, value) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  const normalized = normalizeHex(value);
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`${label} must be exactly 64 hex characters.`);
  }
  return normalized;
}

function readContractAddress(args) {
  const direct = args['contract-address'] ?? process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (direct) {
    return readRequiredHex32('contract address', direct);
  }

  if (fs.existsSync(DEPLOYMENT_FILE)) {
    const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, 'utf8'));
    const fromFile = String(deployment.contractAddress ?? '').trim();
    if (/^[0-9a-f]{64}$/.test(normalizeHex(fromFile))) {
      return normalizeHex(fromFile);
    }
  }

  throw new Error(
    'Unable to resolve contract address. Pass --contract-address or set NEXT_PUBLIC_CONTRACT_ADDRESS.',
  );
}

async function main() {
  loadEnvFile(path.join(PROJECT_ROOT, '.env'));
  loadEnvFile(FRONTEND_ENV_FILE);

  const args = parseArgs(process.argv);
  const issuerPublicKeyHex = readRequiredHex32('issuer public key', args['issuer-public-key']);
  const attestationHashHex = args['attestation-hash']
    ? readRequiredHex32('attestation hash', args['attestation-hash'])
    : randomBytes(32).toString('hex');

  const contractAddress = readContractAddress(args);
  const operatorSeed = process.env.MIDNIGHT_OPERATOR_SEED;
  const adminKey = process.env.PROOFFOLIO_ADMIN_KEY;

  if (!operatorSeed) {
    throw new Error('MIDNIGHT_OPERATOR_SEED is required for on-chain registration.');
  }
  if (!adminKey) {
    throw new Error('PROOFFOLIO_ADMIN_KEY is required for on-chain registration.');
  }

  const privateStateId =
    args['private-state-id'] ??
    process.env.PROOFFOLIO_API_PRIVATE_STATE_ID ??
    DEFAULT_PRIVATE_STATE_ID;
  const syncTimeoutMs = Number(process.env.MIDNIGHT_OPERATOR_SYNC_TIMEOUT_MS ?? 300000);

  const walletCtx = await createWallet(operatorSeed);
  await waitForWalletSync(walletCtx, syncTimeoutMs);

  const providers = await createProviders(walletCtx, privateStateId);
  const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!contractState) {
    throw new Error(`No contract state found for address '${contractAddress}'.`);
  }

  const issuerPublicKey = toBytes32FromHex(issuerPublicKeyHex);
  const attestationHash = toBytes32FromHex(attestationHashHex);

  const currentLedger = ProofFolio.ledger(contractState);
  if (currentLedger.authorizedIssuers.member(issuerPublicKey)) {
    const result = {
      issuerPublicKeyHex,
      attestationHashHex,
      txHash: null,
      alreadyAuthorized: true,
    };
    console.log(`REGISTER_ISSUER_PUBLIC_RESULT=${JSON.stringify(result)}`);
    return;
  }

  const compiledContract = makeCompiledContractForDeployment(toBytes32FromHex(adminKey));
  const tx = await submitCallTx(providers, {
    compiledContract,
    contractAddress,
    circuitId: 'registerIssuer',
    args: [issuerPublicKey, attestationHash],
  });

  const result = {
    issuerPublicKeyHex,
    attestationHashHex,
    txHash: tx.public.txHash,
    alreadyAuthorized: false,
  };
  console.log(`REGISTER_ISSUER_PUBLIC_RESULT=${JSON.stringify(result)}`);
}

main().catch((err) => {
  console.error('register-issuer-public failed:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
