/**
 * deploy.ts
 *
 * Deploys the credential verifier contract to Midnight Preprod.
 * Run this once. The contract address is saved to deployment.json.
 *
 * Usage:
 *   npm run deploy
 */

import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { MidnightProvider } from "@midnight-ntwrk/midnight-js-types";
import {
  getLedgerNetworkId,
  getZswapNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import { Contract } from "../contracts/managed/credential_verifier/contract/index.cjs";
import { createAdminWitnesses } from "./witness.js";
import { createWalletAndWaitForFunds } from "./wallet.js";
import { networkConfig } from "./config.js";
import * as fs from "fs";
import * as readline from "readline/promises";

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("\n── ZK Credential Verifier — Deploy ──\n");

  // 1. Wallet setup
  const walletSeed = await rl.question(
    "Enter wallet seed (or press Enter to create new): ",
  );
  const wallet = await createWalletAndWaitForFunds(
    walletSeed.trim() || undefined,
    networkConfig,
  );

  console.log(`\nWallet address: ${wallet.address}`);
  console.log(
    "Waiting for DUST to generate (this may take 30–60 seconds)...\n",
  );

  // 2. Admin key setup
  // In production: load from a hardware wallet or secure vault
  // For hackathon: generate a random admin secret key
  const adminSecretKey = crypto.getRandomValues(new Uint8Array(32));
  console.log(
    "Admin key generated. SAVE THIS — it controls issuer registration:",
  );
  console.log(Buffer.from(adminSecretKey).toString("hex"));
  console.log();

  // 3. Deploy
  const witnesses = createAdminWitnesses({ adminSecretKey });
  const contract = new Contract(witnesses);
  const provider = await MidnightProvider.fromWallet(wallet, networkConfig);

  console.log("Deploying contract...");
  const deployedContract = await contract.deployTx(provider);
  const contractAddress = deployedContract.deployTxData.public.contractAddress;

  console.log(`\n✅ Contract deployed!\n`);
  console.log(`   Contract address: ${contractAddress}\n`);

  // 4. Save deployment info
  const deployment = {
    contractAddress,
    network: networkConfig.networkId,
    deployedAt: new Date().toISOString(),
    adminKeyHex: Buffer.from(adminSecretKey).toString("hex"),
  };

  fs.writeFileSync("deployment.json", JSON.stringify(deployment, null, 2));
  console.log("Saved to deployment.json\n");

  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Deploy failed:", err);
  process.exit(1);
});
