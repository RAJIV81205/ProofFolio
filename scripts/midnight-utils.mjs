import path from "node:path";
import { Buffer } from "node:buffer";
import { fileURLToPath, pathToFileURL } from "node:url";

import { WebSocket } from "ws";
import * as Rx from "rxjs";

import { CompiledContract } from "@midnight-ntwrk/compact-js";
import * as ledger from "@midnight-ntwrk/ledger-v8";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { getNetworkId, setNetworkId } from "@midnight-ntwrk/midnight-js/network-id";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import { WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  UnshieldedWallet,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";

// Needed for GraphQL subscription transport in Node runtime.
globalThis.WebSocket = WebSocket;

function toWsUrl(urlLike) {
  if (urlLike.startsWith("ws://") || urlLike.startsWith("wss://")) {
    return urlLike;
  }
  if (urlLike.startsWith("https://")) {
    return urlLike.replace(/^https:\/\//, "wss://");
  }
  if (urlLike.startsWith("http://")) {
    return urlLike.replace(/^http:\/\//, "ws://");
  }
  throw new Error(`Invalid node URL: ${urlLike}`);
}

export const MIDNIGHT_NETWORK = process.env.MIDNIGHT_NETWORK ?? "preprod";
export const MIDNIGHT_PROFILE = process.env.MIDNIGHT_PROFILE ?? MIDNIGHT_NETWORK;
export const SDK_NETWORK_ID =
  MIDNIGHT_NETWORK === "local" || MIDNIGHT_NETWORK === "undeployed"
    ? "undeployed"
    : MIDNIGHT_NETWORK === "preview"
      ? "preview"
      : MIDNIGHT_NETWORK === "mainnet"
      ? "mainnet"
      : "preprod";
setNetworkId(SDK_NETWORK_ID);

const LOCAL_CONFIG = {
      networkLabel: "local",
      indexer: process.env.MIDNIGHT_INDEXER_HTTP ?? "http://localhost:8088/api/v3/graphql",
      indexerWS: process.env.MIDNIGHT_INDEXER_WS ?? "ws://localhost:8088/api/v3/graphql",
      nodeHttp: process.env.MIDNIGHT_NODE_HTTP ?? "http://localhost:9944",
      nodeWS:
        process.env.MIDNIGHT_NODE_WS ??
        toWsUrl(process.env.MIDNIGHT_NODE_HTTP ?? "http://localhost:9944"),
      proofServer: process.env.MIDNIGHT_PROOF_SERVER ?? "http://127.0.0.1:6300",
      faucet: null,
    };

const PREPROD_CONFIG = {
      networkLabel: "preprod",
      indexer:
        process.env.MIDNIGHT_INDEXER_HTTP ??
        "https://indexer.preprod.midnight.network/api/v3/graphql",
      indexerWS:
        process.env.MIDNIGHT_INDEXER_WS ??
        "wss://indexer.preprod.midnight.network/api/v3/graphql/ws",
      nodeHttp: process.env.MIDNIGHT_NODE_HTTP ?? "https://rpc.preprod.midnight.network",
      nodeWS:
        process.env.MIDNIGHT_NODE_WS ??
        toWsUrl(process.env.MIDNIGHT_NODE_HTTP ?? "https://rpc.preprod.midnight.network"),
      proofServer: process.env.MIDNIGHT_PROOF_SERVER ?? "http://127.0.0.1:6300",
      faucet: "https://faucet.preprod.midnight.network",
    };

const TESTNET02_CONFIG = {
      networkLabel: "testnet-02",
      indexer:
        process.env.MIDNIGHT_INDEXER_HTTP ??
        "https://indexer.testnet-02.midnight.network/api/v1/graphql",
      indexerWS:
        process.env.MIDNIGHT_INDEXER_WS ??
        "wss://indexer.testnet-02.midnight.network/api/v1/graphql/ws",
      nodeHttp: process.env.MIDNIGHT_NODE_HTTP ?? "https://rpc.testnet-02.midnight.network",
      nodeWS:
        process.env.MIDNIGHT_NODE_WS ??
        toWsUrl(process.env.MIDNIGHT_NODE_HTTP ?? "https://rpc.testnet-02.midnight.network"),
      proofServer: process.env.MIDNIGHT_PROOF_SERVER ?? "http://127.0.0.1:6300",
      faucet: "https://midnight.network/test-faucet",
    };

export const CONFIG =
  MIDNIGHT_PROFILE === "local" || MIDNIGHT_NETWORK === "local"
    ? LOCAL_CONFIG
    : MIDNIGHT_PROFILE === "testnet-02"
      ? TESTNET02_CONFIG
      : PREPROD_CONFIG;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const zkConfigPath = path.resolve(
  __dirname,
  "..",
  "contracts",
  "managed",
  "credential_verifier",
);
const contractPath = path.join(zkConfigPath, "contract", "index.js");
export const CredZK = await import(pathToFileURL(contractPath).href);

export function toBytes32FromHex(hex) {
  const normalized = hex.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Expected 32-byte hex string (64 hex chars)");
  }
  return new Uint8Array(Buffer.from(normalized, "hex"));
}

export function deriveKeys(seedHex) {
  const normalized = seedHex.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Invalid seed. Expected 64 hex characters.");
  }
  const hdWallet = HDWallet.fromSeed(Buffer.from(normalized, "hex"));
  if (hdWallet.type !== "seedOk") {
    throw new Error("Invalid seed");
  }

  const result = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (result.type !== "keysDerived") {
    throw new Error("Key derivation failed");
  }
  hdWallet.hdWallet.clear();
  return result.keys;
}

export async function createWallet(seedHex) {
  const keys = deriveKeys(seedHex);
  const networkId = getNetworkId();

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId);

  const walletConfig = {
    networkId,
    indexerClientConnection: {
      indexerHttpUrl: CONFIG.indexer,
      indexerWsUrl: CONFIG.indexerWS,
    },
    provingServerUrl: new URL(CONFIG.proofServer),
    relayURL: new URL(CONFIG.nodeWS),
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  };

  const wallet = await WalletFacade.init({
    configuration: walletConfig,
    shielded: (config) => ShieldedWallet(config).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (config) =>
      UnshieldedWallet({
        networkId: config.networkId,
        indexerClientConnection: config.indexerClientConnection,
        txHistoryStorage: config.txHistoryStorage,
      }).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (config) =>
      DustWallet({
        ...config,
        costParameters: {
          additionalFeeOverhead: 300_000_000_000_000n,
          feeBlocksMargin: 5,
        },
      }).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      ),
  });

  await wallet.start(shieldedSecretKeys, dustSecretKey);

  return {
    wallet,
    shieldedSecretKeys,
    dustSecretKey,
    unshieldedKeystore,
  };
}

export async function waitForWalletSync(walletCtx, timeoutMs = 300_000) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Wallet sync timed out.")), timeoutMs);
  });
  return Promise.race([walletCtx.wallet.waitForSyncedState(), timeoutPromise]);
}

function emptyBytes32() {
  return new Uint8Array(32);
}

export function createDeploymentWitnesses(adminSecretKeyBytes) {
  return {
    adminSecretKey: (ctx) => [ctx.privateState, adminSecretKeyBytes],
    issuerSecretKey: (ctx) => [ctx.privateState, emptyBytes32()],
    studentSecretKey: (ctx) => [ctx.privateState, emptyBytes32()],
    credentialPayload: (ctx) => [ctx.privateState, emptyBytes32()],
    credentialNonce: (ctx) => [ctx.privateState, emptyBytes32()],
    findCredentialPath: (_ctx, _commitment) => {
      throw new Error("findCredentialPath is not used during deployment.");
    },
  };
}

export function makeCompiledContractForDeployment(adminSecretKeyBytes) {
  return CompiledContract.make("credzk", CredZK.Contract).pipe(
    CompiledContract.withWitnesses(createDeploymentWitnesses(adminSecretKeyBytes)),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );
}

export function signTransactionIntents(tx, signFn, proofMarker) {
  if (!tx.intents || tx.intents.size === 0) return;

  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;

    const cloned = ledger.Intent.deserialize(
      "signature",
      proofMarker,
      "pre-binding",
      intent.serialize(),
    );

    const signature = signFn(cloned.signatureData(segment));
    if (cloned.fallibleUnshieldedOffer) {
      const signatures = cloned.fallibleUnshieldedOffer.inputs.map(
        (_input, i) => cloned.fallibleUnshieldedOffer.signatures.at(i) ?? signature,
      );
      cloned.fallibleUnshieldedOffer =
        cloned.fallibleUnshieldedOffer.addSignatures(signatures);
    }
    tx.intents.set(segment, cloned);
  }
}

export async function createProviders(walletCtx, privateStateStoreName) {
  const syncTimeoutMs = Number(process.env.MIDNIGHT_OPERATOR_SYNC_TIMEOUT_MS ?? 300_000);
  const state = await Rx.firstValueFrom(
    walletCtx.wallet.state().pipe(
      Rx.filter((s) => s.isSynced),
      Rx.timeout({
        first: syncTimeoutMs,
        with: () => Rx.throwError(() => new Error(`Wallet state stream not synced within ${syncTimeoutMs}ms.`)),
      }),
    ),
  );

  const walletProvider = {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx, ttl) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        {
          shieldedSecretKeys: walletCtx.shieldedSecretKeys,
          dustSecretKey: walletCtx.dustSecretKey,
        },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );

      const signFn = (payload) => walletCtx.unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction, signFn, "proof");
      if (recipe.balancingTransaction) {
        signTransactionIntents(recipe.balancingTransaction, signFn, "pre-proof");
      }
      return walletCtx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx) => walletCtx.wallet.submitTransaction(tx),
  };

  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  const accountId = walletProvider.getCoinPublicKey();
  const storagePassword = `${Buffer.from(accountId, "hex").toString("base64")}!`;
  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName,
      accountId,
      privateStoragePasswordProvider: () => storagePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(CONFIG.indexer, CONFIG.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(CONFIG.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}
