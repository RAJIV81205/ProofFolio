import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

import { submitCallTx } from "@midnight-ntwrk/midnight-js/contracts";
import {
  ProofFolio,
  createProviders,
  createWallet,
  makeCompiledContractForDeployment,
  toBytes32FromHex,
  waitForWalletSync,
} from "./midnight-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEPLOYMENT_FILE = path.join(PROJECT_ROOT, "deployment.json");
const FRONTEND_ENV_FILE = path.join(PROJECT_ROOT, "frontend/.env.local");
const DEFAULT_PRIVATE_STATE_ID = "ProofFolio-register-issuer-state";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function boolArg(value, fallback = false) {
  if (value === undefined) return fallback;
  return value === "true" || value === "1" || value === "yes";
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function normalizeHex(value) {
  return value.trim().toLowerCase().replace(/^0x/, "");
}

function toHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

function readRequiredHex32(label, value) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  const normalized = normalizeHex(value);
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`${label} must be exactly 64 hex characters.`);
  }
  return new Uint8Array(Buffer.from(normalized, "hex"));
}

function readContractAddress(args) {
  const direct = args["contract-address"] ?? process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (direct) {
    const normalized = normalizeHex(direct);
    if (!/^[0-9a-f]{64}$/.test(normalized)) {
      throw new Error("contract address must be 64 hex characters.");
    }
    return normalized;
  }

  if (fs.existsSync(DEPLOYMENT_FILE)) {
    const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf8"));
    const fromFile = String(deployment.contractAddress ?? "").trim();
    const normalized = normalizeHex(fromFile);
    if (/^[0-9a-f]{64}$/.test(normalized)) {
      return normalized;
    }
  }

  throw new Error(
    "Unable to resolve contract address. Pass --contract-address or set NEXT_PUBLIC_CONTRACT_ADDRESS.",
  );
}

function deriveIssuerPublicKey(issuerSecretKey) {
  const zero = new Uint8Array(32);
  const dummyWitnesses = {
    adminSecretKey: () => [null, zero],
    issuerSecretKey: () => [null, zero],
    studentSecretKey: () => [null, zero],
    credentialPayload: () => [null, zero],
    credentialNonce: () => [null, zero],
    credentialIssuerPk: () => [null, zero],
    findCredentialPath: () => [null, { leaf: zero, path: [] }],
  };

  const contract = new ProofFolio.Contract(dummyWitnesses);
  return contract._issuerPublicKey_0(issuerSecretKey);
}

function printUsage() {
  console.log(`\nregister-issuer usage\n
node scripts/register-issuer.mjs \\
  --issuer-secret <64-hex> \\
  [--attestation-hash <64-hex>] \\
  [--contract-address <64-hex>] \\
  [--private-state-id <value>] \\
  [--dry-run true]\n
Notes:
- MIDNIGHT_OPERATOR_SEED and PROOFFOLIO_ADMIN_KEY are required for non-dry-run.
- If --attestation-hash is omitted, a random 32-byte value is generated.\n`);
}

async function main() {
  loadEnvFile(path.join(PROJECT_ROOT, ".env"));
  loadEnvFile(FRONTEND_ENV_FILE);

  const args = parseArgs(process.argv);
  if (boolArg(args.help) || boolArg(args.h)) {
    printUsage();
    return;
  }

  const issuerSecretKey = readRequiredHex32("issuer secret", args["issuer-secret"]);
  const issuerPublicKey = deriveIssuerPublicKey(issuerSecretKey);

  const attestationHash = args["attestation-hash"]
    ? readRequiredHex32("attestation hash", args["attestation-hash"])
    : randomBytes(32);

  const dryRun = boolArg(args["dry-run"], false);
  console.log("Issuer secret key:", toHex(issuerSecretKey));
  console.log("Issuer public key:", toHex(issuerPublicKey));
  console.log("Attestation hash:", toHex(attestationHash));

  if (dryRun) {
    console.log("Dry-run complete. No on-chain transaction submitted.");
    return;
  }

  const contractAddress = readContractAddress(args);
  const operatorSeed = process.env.MIDNIGHT_OPERATOR_SEED;
  const adminKey = process.env.PROOFFOLIO_ADMIN_KEY;

  if (!operatorSeed) {
    throw new Error("MIDNIGHT_OPERATOR_SEED is required for on-chain registration.");
  }
  if (!adminKey) {
    throw new Error("PROOFFOLIO_ADMIN_KEY is required for on-chain registration.");
  }

  const privateStateId =
    args["private-state-id"] ??
    process.env.PROOFFOLIO_API_PRIVATE_STATE_ID ??
    DEFAULT_PRIVATE_STATE_ID;

  console.log("Using contract:", contractAddress);
  console.log("Private state id:", privateStateId);

  const walletCtx = await createWallet(operatorSeed);
  const syncTimeoutMs = Number(process.env.MIDNIGHT_OPERATOR_SYNC_TIMEOUT_MS ?? 300000);
  await waitForWalletSync(walletCtx, syncTimeoutMs);

  const providers = await createProviders(walletCtx, privateStateId);
  const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!contractState) {
    throw new Error(`No contract state found for address '${contractAddress}'.`);
  }

  const currentLedger = ProofFolio.ledger(contractState);
  if (currentLedger.authorizedIssuers.member(issuerPublicKey)) {
    console.log("Issuer is already authorized on-chain. Skipping registerIssuer.");
    return;
  }

  const compiledContract = makeCompiledContractForDeployment(toBytes32FromHex(adminKey));
  const result = await submitCallTx(providers, {
    compiledContract,
    contractAddress,
    circuitId: "registerIssuer",
    args: [issuerPublicKey, attestationHash],
  });

  console.log("registerIssuer submitted successfully.");
  console.log("txHash:", result.public.txHash);
}

main().catch((err) => {
  console.error("register-issuer failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
