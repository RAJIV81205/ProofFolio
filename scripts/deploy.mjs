import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";

import * as Rx from "rxjs";
import { unshieldedToken } from "@midnight-ntwrk/ledger-v8";
import { deployContract } from "@midnight-ntwrk/midnight-js/contracts";
import { toHex } from "@midnight-ntwrk/midnight-js/utils";
import { generateRandomSeed } from "@midnight-ntwrk/wallet-sdk-hd";

import {
  CONFIG,
  MIDNIGHT_NETWORK,
  MIDNIGHT_PROFILE,
  SDK_NETWORK_ID,
  createProviders,
  createWallet,
  makeCompiledContractForDeployment,
  toBytes32FromHex,
  waitForWalletSync,
} from "./midnight-utils.mjs";

const PROJECT_ROOT = process.cwd();
const CONTRACT_ARTIFACT = path.join(
  PROJECT_ROOT,
  "contracts/managed/credential_verifier/contract/index.js",
);
const DEPLOYMENT_FILE = path.join(PROJECT_ROOT, "deployment.json");
const FRONTEND_ENV_FILE = path.join(PROJECT_ROOT, "frontend/.env.local");
const DEFAULT_PRIVATE_STATE_ID = "ProofFolio-private-state";
const PROOF_SERVER_CONTAINER = "ProofFolio-proof-server";
const DEFAULT_MIN_DUST_FOR_DEPLOY = 300_000_000_000_000n;

process.on("unhandledRejection", (reason) => {
  console.error("\nUnhandled async error during deployment:");
  console.error(reason);
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  console.error("\nUncaught deployment exception:");
  console.error(err);
  process.exit(1);
});

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
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

function ensureCompiledArtifacts(autoCompile) {
  if (fs.existsSync(CONTRACT_ARTIFACT)) return;
  if (!autoCompile) {
    throw new Error(
      "Compiled contract artifacts not found. Run `npm run compile` first.",
    );
  }
  console.log("Compiled artifacts missing. Running `npm run compile`...");
  execSync("npm run compile", { stdio: "inherit" });
  if (!fs.existsSync(CONTRACT_ARTIFACT)) {
    throw new Error("Compile step completed but contract artifact still missing.");
  }
}

async function isProofServerReachable(url, timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function autoStartProofServer() {
  const existing = execSync(
    `docker ps --filter name=${PROOF_SERVER_CONTAINER} --format "{{.Names}}"`,
    { encoding: "utf8" },
  ).trim();
  if (existing === PROOF_SERVER_CONTAINER) return;

  execSync(
    [
      "docker run -d --rm",
      `--name ${PROOF_SERVER_CONTAINER}`,
      "-p 6300:6300",
      "midnightntwrk/proof-server:8.0.3",
      "-- midnight-proof-server -v",
    ].join(" "),
    { stdio: "inherit" },
  );
}

async function ensureProofServerAvailable(tryAutoStart) {
  if (await isProofServerReachable(CONFIG.proofServer)) return;

  if (tryAutoStart) {
    console.log("Proof server is not reachable. Attempting Docker auto-start...");
    autoStartProofServer();
    for (let i = 0; i < 20; i++) {
      if (await isProofServerReachable(CONFIG.proofServer, 2000)) return;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  throw new Error(
    `Proof server is not reachable at ${CONFIG.proofServer}.\n` +
      "Run `npm run start-proof-server` and try again.",
  );
}

function sanitizeSeed(seed) {
  const normalized = seed.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Seed must be a 64-character hex string.");
  }
  return normalized;
}

function updateFrontendEnv(contractAddress) {
  let existing = "";
  if (fs.existsSync(FRONTEND_ENV_FILE)) {
    existing = fs.readFileSync(FRONTEND_ENV_FILE, "utf8");
  }

  const withoutKeys = existing
    .split(/\r?\n/)
    .filter(
      (line) =>
        !line.startsWith("NEXT_PUBLIC_CONTRACT_ADDRESS=") &&
        !line.startsWith("VITE_CONTRACT_ADDRESS="),
    )
    .join("\n")
    .trim();

  const next = [
    withoutKeys,
    `NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`,
    `VITE_CONTRACT_ADDRESS=${contractAddress}`,
  ]
    .filter(Boolean)
    .join("\n")
    .concat("\n");

  fs.writeFileSync(FRONTEND_ENV_FILE, next, "utf8");
}

async function waitForFunding(walletCtx, timeoutMs) {
  const state = await waitForWalletSync(walletCtx);
  const balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
  if (balance > 0n) return;

  if (CONFIG.faucet) {
    const addr = walletCtx.unshieldedKeystore.getBech32Address();
    console.log(`No tNight detected. Fund wallet from faucet: ${CONFIG.faucet}`);
    console.log(`Wallet address: ${addr}`);
  }

  await Rx.firstValueFrom(
    walletCtx.wallet.state().pipe(
      Rx.throttleTime(10_000),
      Rx.filter((s) => s.isSynced),
      Rx.map((s) => s.unshielded.balances[unshieldedToken().raw] ?? 0n),
      Rx.filter((b) => b > 0n),
      Rx.timeout({ first: timeoutMs }),
    ),
  );
}

async function ensureDustReady(walletCtx, timeoutMs) {
  return ensureDustReadyWithThreshold(walletCtx, timeoutMs, DEFAULT_MIN_DUST_FOR_DEPLOY);
}

function getDustBalanceFromState(state) {
  if (typeof state.dust.balance === "function") return state.dust.balance(new Date());
  if (typeof state.dust.walletBalance === "function") return state.dust.walletBalance(new Date());
  return 0n;
}

async function ensureDustReadyWithThreshold(walletCtx, timeoutMs, minDustRequired) {
  const synced = await waitForWalletSync(walletCtx);
  if (getDustBalanceFromState(synced) >= minDustRequired) return;

  const spendableNight = synced.unshielded.availableCoins.filter(
    (coin) => !coin.meta?.registeredForDustGeneration,
  );
  if (spendableNight.length > 0) {
    const recipe = await walletCtx.wallet.registerNightUtxosForDustGeneration(
      spendableNight,
      walletCtx.unshieldedKeystore.getPublicKey(),
      (payload) => walletCtx.unshieldedKeystore.signData(payload),
    );
    await walletCtx.wallet.submitTransaction(
      await walletCtx.wallet.finalizeRecipe(recipe),
    );
  }

  await Rx.firstValueFrom(
    walletCtx.wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.filter((s) => s.isSynced),
      Rx.filter((s) => getDustBalanceFromState(s) >= minDustRequired),
      Rx.timeout({ first: timeoutMs }),
    ),
  );
}

async function resolveSeed(rl, args) {
  if (args.seed) return sanitizeSeed(args.seed);
  if (process.env.MIDNIGHT_SEED) return sanitizeSeed(process.env.MIDNIGHT_SEED);

  const choice = await rl.question(
    "[1] Create new wallet\n[2] Restore existing wallet\n> ",
  );
  if (choice.trim() === "2") {
    const seedInput = await rl.question("Enter your 64-char wallet seed: ");
    return sanitizeSeed(seedInput);
  }

  const generated = toHex(Buffer.from(generateRandomSeed()));
  console.log("\nGenerated wallet seed (store securely):");
  console.log(generated);
  console.log();
  return sanitizeSeed(generated);
}

function resolveAdminKey(args) {
  if (args["admin-key"]) return sanitizeSeed(args["admin-key"]);
  if (process.env.PROOFFOLIO_ADMIN_KEY) return sanitizeSeed(process.env.PROOFFOLIO_ADMIN_KEY);
  return randomBytes(32).toString("hex");
}

async function main() {
  const args = parseArgs(process.argv);
  const autoCompile = boolArg(args["auto-compile"], true);
  const autoProofServer = boolArg(args["auto-start-proof-server"], true);
  const writeFrontendEnv = boolArg(args["write-frontend-env"], true);
  const syncTimeoutMs = Number(args["sync-timeout-ms"] ?? 10 * 60_000);
  const waitFundingMs = Number(args["funding-timeout-ms"] ?? 10 * 60_000);
  const waitDustMs = Number(args["dust-timeout-ms"] ?? 5 * 60_000);
  const minDust = BigInt(
    args["min-dust"] ??
      process.env.PROOFFOLIO_MIN_DUST ??
      DEFAULT_MIN_DUST_FOR_DEPLOY.toString(),
  );
  const privateStateId = args["private-state-id"] ?? DEFAULT_PRIVATE_STATE_ID;

  ensureCompiledArtifacts(autoCompile);
  await ensureProofServerAvailable(autoProofServer);

  const rl = readline.createInterface({ input: stdin, output: stdout });
  let walletCtx;
  try {
    console.log("\n── ProofFolio One-Click Deploy ──\n");
    console.log(`Network: ${MIDNIGHT_NETWORK} (${CONFIG.networkLabel})`);
    console.log(`Profile: ${MIDNIGHT_PROFILE}`);
    console.log(`Wallet SDK Network ID: ${SDK_NETWORK_ID}`);
    console.log(`Indexer: ${CONFIG.indexer}`);
    console.log(`Indexer WS: ${CONFIG.indexerWS}`);
    console.log(`Node WS: ${CONFIG.nodeWS}`);
    console.log(`Proof server: ${CONFIG.proofServer}\n`);
    console.log(`Minimum DUST required for deploy: ${minDust.toLocaleString()}\n`);

    const seed = await resolveSeed(rl, args);
    const adminKeyHex = resolveAdminKey(args);
    const adminKeyBytes = toBytes32FromHex(adminKeyHex);

    console.log("Creating wallet...");
    walletCtx = await createWallet(seed);
    console.log("Waiting for wallet sync...");
    const synced = await waitForWalletSync(walletCtx, syncTimeoutMs);
    const walletAddress = walletCtx.unshieldedKeystore.getBech32Address();
    const currentBalance = synced.unshielded.balances[unshieldedToken().raw] ?? 0n;
    console.log(`Wallet address: ${walletAddress}`);
    console.log(`tNight balance: ${currentBalance.toLocaleString()}`);

    await waitForFunding(walletCtx, waitFundingMs);
    await ensureDustReadyWithThreshold(walletCtx, waitDustMs, minDust);
    console.log("DUST ready. Deploying contract...");

    const compiledContract = makeCompiledContractForDeployment(adminKeyBytes);
    const providers = await createProviders(walletCtx, privateStateId);

    const deployed = await deployContract(providers, {
      privateStateId,
      initialPrivateState: {},
      compiledContract,
    });

    const contractAddress = deployed.deployTxData.public.contractAddress;
    const txHash = deployed.deployTxData.public.txHash;
    const deploymentRecord = {
      app: "ProofFolio",
      network: MIDNIGHT_NETWORK,
      contractAddress,
      deployTxHash: txHash,
      privateStateId,
      deployedAt: new Date().toISOString(),
      walletAddress,
      adminKeyHex,
      security: {
        seedStored: false,
        note: "Seed is never written to disk by this script.",
      },
      services: {
        indexer: CONFIG.indexer,
        indexerWS: CONFIG.indexerWS,
        nodeHttp: CONFIG.nodeHttp,
        nodeWS: CONFIG.nodeWS,
        proofServer: CONFIG.proofServer,
      },
    };

    fs.writeFileSync(DEPLOYMENT_FILE, JSON.stringify(deploymentRecord, null, 2), "utf8");
    if (writeFrontendEnv) updateFrontendEnv(contractAddress);

    console.log("\nDeployment successful.");
    console.log(`Contract address: ${contractAddress}`);
    if (txHash) console.log(`Deploy tx hash: ${txHash}`);
    console.log(`Saved: ${DEPLOYMENT_FILE}`);
    if (writeFrontendEnv) console.log(`Updated: ${FRONTEND_ENV_FILE}`);
    console.log();
  } finally {
    rl.close();
    if (walletCtx?.wallet) {
      try {
        await walletCtx.wallet.stop();
      } catch {
        // Best-effort cleanup.
      }
    }
  }
}

main().catch((err) => {
  console.error("\nDeployment failed.");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
