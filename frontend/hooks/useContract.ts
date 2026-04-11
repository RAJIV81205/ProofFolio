"use client";

import { useCallback, useMemo, useState } from "react";
import {
  createAdminWitnesses,
  createIssuerWitnesses,
  createStudentWitnesses,
  generateNonce,
  packCredential,
  type CredentialData,
} from "@/lib/witness";
import type { WalletServiceUriConfig } from "@/hooks/useWallet";
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";

// @ts-ignore
import { Contract } from "../contracts/managed/credential_verifier/contract/index.js";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { submitCallTx } from "@midnight-ntwrk/midnight-js-contracts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";

type BytesLike = Uint8Array | string;

export interface HookContractState {
  loading: boolean;
  error: string | null;
  txHash: string | null;
}

export interface LedgerStateSnapshot {
  issuanceCount: bigint;
  verificationCount: bigint;
  issuerCount: bigint;
  revokedCount: bigint;
  usedNullifierCount: bigint;
}

export interface IssueCredentialResult {
  txHash: string;
  nonceHex: string;
  commitmentHex: string;
  issuerPublicKeyHex: string;
}

export interface ExpectedAdminKeyResult {
  adminPublicKeyHex: string;
  source?: string;
}

export interface EnvironmentDiagnosticsResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface PresentationLookupResult {
  txHash: string;
  txId: string;
  status: string;
  blockHeight: number;
  createdAt: string;
}

export interface PresentCredentialResult {
  verified: boolean;
  txHash?: string;
  txId?: string;
  status?: string;
  blockHeight?: number;
  createdAt?: string;
}

function normalizeHex(value: string): string {
  return value.trim().toLowerCase().replace(/^0x/, "");
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesFromHex(value: string, label: string): Uint8Array {
  const normalized = normalizeHex(value);
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`${label} must be a valid even-length hex string.`);
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytes32FromValue(value: BytesLike, label: string): Uint8Array {
  if (value instanceof Uint8Array) {
    if (value.length !== 32) {
      throw new Error(`${label} must be 32 bytes.`);
    }
    return value;
  }

  const bytes = bytesFromHex(value, label);
  if (bytes.length !== 32) {
    throw new Error(`${label} must be exactly 32 bytes (64 hex chars).`);
  }
  return bytes;
}

function parseBlockTimestamp(timestamp: number): string {
  const millis = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
  return new Date(millis).toISOString();
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const details: string[] = [];
    const typed = err as Error & {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
      details?: unknown;
      error?: unknown;
      data?: unknown;
      cause?: unknown;
    };

    if (typed.code !== undefined) details.push(`code=${String(typed.code)}`);
    if (typed.status !== undefined) details.push(`status=${String(typed.status)}`);
    if (typed.statusCode !== undefined) details.push(`statusCode=${String(typed.statusCode)}`);
    if (typed.error && typeof typed.error === "string") details.push(`error=${typed.error}`);
    if (typed.details !== undefined) details.push(`details=${safeStringify(typed.details)}`);
    if (typed.data !== undefined) details.push(`data=${safeStringify(typed.data)}`);

    const cause = (err as Error & { cause?: unknown }).cause;
    const suffix = details.length > 0 ? ` (${details.join(", ")})` : "";

    if (cause instanceof Error) {
      return `${err.message}${suffix}: ${extractErrorMessage(cause)}`;
    }
    if (typeof cause === "string" && cause.trim().length > 0) {
      return `${err.message}${suffix}: ${cause}`;
    }
    if (cause && typeof cause === "object") {
      return `${err.message}${suffix}: ${safeStringify(cause)}`;
    }
    return `${err.message}${suffix}`;
  }
  if (err && typeof err === "object") {
    return safeStringify(err);
  }
  if (typeof err === "string" && err.trim().length > 0) {
    return err;
  }
  return "Unknown error";
}

function isRetryableReadError(errorMessage: string): boolean {
  return /timed out|timeout|temporarily unavailable|network error|failed to fetch/i.test(errorMessage);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function queryTxIdentifiersByHash(indexerUri: string, txHash: string): Promise<string[]> {
  const query = `query Q($offset: TransactionOffset!) {\n  transactions(offset: $offset) {\n    hash\n    ... on RegularTransaction {\n      identifiers\n    }\n  }\n}`;

  const response = await fetch(indexerUri, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { offset: { hash: txHash } },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    data?: {
      transactions?: Array<{ identifiers?: string[] }>;
    };
  };

  const tx = payload.data?.transactions?.[0];
  if (!tx || !Array.isArray(tx.identifiers)) {
    return [];
  }

  return tx.identifiers.filter((id) => typeof id === "string" && id.length > 0);
}

function createDummyWitnesses() {
  const zeros = new Uint8Array(32);
  return {
    adminSecretKey: (ctx: any) => [ctx.privateState, zeros],
    issuerSecretKey: (ctx: any) => [ctx.privateState, zeros],
    studentSecretKey: (ctx: any) => [ctx.privateState, zeros],
    credentialPayload: (ctx: any) => [ctx.privateState, zeros],
    credentialNonce: (ctx: any) => [ctx.privateState, zeros],
    findCredentialPath: (ctx: any) => [ctx.privateState, { leaf: zeros, path: [] }],
  };
}

// 1AM provider construction from wallet connector.
async function build1amProviders(connectedAPI: ConnectedAPI, fallback: WalletServiceUriConfig | null) {
  const fromWallet = await connectedAPI.getConfiguration();
  const expectedNetwork = (process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK ?? "preprod").toLowerCase();
  const networkId = fromWallet.networkId ?? fallback?.networkId ?? expectedNetwork;
  const indexerUri = fromWallet.indexerUri ?? fallback?.indexerUri ?? "";
  const indexerWsUri = fromWallet.indexerWsUri ?? fallback?.indexerWsUri ?? "";

  if (!indexerUri || !indexerWsUri) {
    throw new Error("Indexer endpoints are missing from wallet configuration.");
  }

  const normalizedNetwork = String(networkId).toLowerCase();
  if (normalizedNetwork !== expectedNetwork) {
    throw new Error(
      `Wallet network mismatch: expected ${expectedNetwork} but wallet is on ${normalizedNetwork}.`,
    );
  }

  setNetworkId(networkId);

  const zkConfigProvider = new FetchZkConfigProvider(
    `${window.location.origin}/api/contract/artifacts`,
    fetch.bind(window),
  );

  const publicDataProvider = indexerPublicDataProvider(indexerUri, indexerWsUri);

  const provingProvider = await connectedAPI.getProvingProvider(zkConfigProvider);
  const proofProvider = {
    async proveTx(unprovenTx: any) {
      const { CostModel } = await import("@midnight-ntwrk/ledger-v8");
      return unprovenTx.prove(provingProvider, CostModel.initialCostModel());
    },
  };

  const shieldedAddress = await connectedAPI.getShieldedAddresses();
  const walletProvider = {
    getCoinPublicKey: () => normalizeHex(shieldedAddress.shieldedCoinPublicKey),
    getEncryptionPublicKey: () => normalizeHex(shieldedAddress.shieldedEncryptionPublicKey),
    async balanceTx(tx: any) {
      const serialized = tx.serialize();
      const hex = Array.from(serialized)
        .map((b: any) => b.toString(16).padStart(2, "0"))
        .join("");

      const result = await connectedAPI.balanceUnsealedTransaction(hex);
      const { Transaction } = await import("@midnight-ntwrk/ledger-v8");
      const bytePairs = result.tx.match(/.{2}/g);
      const bytes = new Uint8Array(bytePairs ? bytePairs.map((b: any) => Number.parseInt(b, 16)) : []);
      return Transaction.deserialize("signature", "proof", "binding", bytes);
    },
  };

  const midnightProvider = {
    async submitTx(tx: any) {
      const serialized = tx.serialize();
      const hex = Array.from(serialized)
        .map((b: any) => b.toString(16).padStart(2, "0"))
        .join("");
      await connectedAPI.submitTransaction(hex);
      return tx.identifiers()[0];
    },
  };

  return { publicDataProvider, zkConfigProvider, proofProvider, walletProvider, midnightProvider };
}

export function useContract(
  contractAddress: string,
  serviceUriConfig: WalletServiceUriConfig | null,
  connectedApi: ConnectedAPI | null,
  _walletAddress: string | null,
) {
  const [state, setState] = useState<HookContractState>({
    loading: false,
    error: null,
    txHash: null,
  });

  const helperContract = useMemo(() => {
    return new Contract(createDummyWitnesses() as any) as any;
  }, []);

  const requireReady = useCallback(() => {
    if (!contractAddress || contractAddress.trim().length === 0) {
      throw new Error("Contract address missing. Set NEXT_PUBLIC_CONTRACT_ADDRESS in frontend/.env.local");
    }
    if (!connectedApi) {
      throw new Error("Wallet not connected.");
    }
  }, [contractAddress, connectedApi]);

  const getProviders = useCallback(async () => {
    requireReady();
    return build1amProviders(connectedApi as ConnectedAPI, serviceUriConfig);
  }, [connectedApi, requireReady, serviceUriConfig]);

  const getCompiledContract = useCallback((witnesses: any) => {
    return CompiledContract.make("credzk", Contract).pipe(CompiledContract.withWitnesses(witnesses));
  }, []);

  const runCircuit = useCallback(
    async (circuitId: string, args: unknown[]): Promise<any> => {
      const providers = await getProviders();
      const compiledContract = getCompiledContract(createDummyWitnesses());
      return submitCallTx(providers as any, {
        compiledContract: compiledContract as any,
        contractAddress,
        circuitId: circuitId as any,
        args: args as any,
      });
    },
    [contractAddress, getCompiledContract, getProviders],
  );

  const runBooleanCircuit = useCallback(
    async (circuitId: string, args: unknown[]): Promise<boolean> => {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const result = await runCircuit(circuitId, args);
          return Boolean(result?.result ?? result?.private?.result);
        } catch (error) {
          const message = extractErrorMessage(error);
          if (attempt < 2 && isRetryableReadError(message)) {
            await delay(800);
            continue;
          }
          throw new Error(`[${circuitId}] ${message}`);
        }
      }
      return false;
    },
    [runCircuit],
  );

  const deriveIssuerPublicKey = useCallback((issuerSecretKey: Uint8Array) => {
    return helperContract._issuerPublicKey_0(issuerSecretKey) as Uint8Array;
  }, [helperContract]);

  const deriveAdminPublicKey = useCallback((adminSecretKey: Uint8Array) => {
    return helperContract._adminPublicKey_0(adminSecretKey) as Uint8Array;
  }, [helperContract]);

  const deriveIssuerTrustAnchor = useCallback((issuerPublicKey: Uint8Array, attestationHash: Uint8Array) => {
    return helperContract._makeIssuerTrustAnchor_0(issuerPublicKey, attestationHash) as Uint8Array;
  }, [helperContract]);

  const deriveCommitment = useCallback((payload: Uint8Array, nonce: Uint8Array) => {
    return helperContract._makeCommitment_0(payload, nonce) as Uint8Array;
  }, [helperContract]);

  const issueCredential = useCallback(
    async (issuerSecretKey: Uint8Array, data: CredentialData): Promise<IssueCredentialResult> => {
      setState({ loading: true, error: null, txHash: null });
      try {
        const issuerSk = bytes32FromValue(issuerSecretKey, "issuer secret key");
        const payload = packCredential(data);
        const nonce = generateNonce();

        const providers = await getProviders();
        const compiledContract = getCompiledContract(createIssuerWitnesses({ issuerSecretKey: issuerSk }));

        const result = await submitCallTx(providers as any, {
          compiledContract: compiledContract as any,
          contractAddress,
          circuitId: "issueCredential",
          args: [payload, nonce],
        });

        const txHash = result.public.txHash;
        const commitment = deriveCommitment(payload, nonce);
        const issuerPk = deriveIssuerPublicKey(issuerSk);

        setState({ loading: false, error: null, txHash });
        return {
          txHash,
          nonceHex: toHex(nonce),
          commitmentHex: toHex(commitment),
          issuerPublicKeyHex: toHex(issuerPk),
        };
      } catch (err) {
        const msg = extractErrorMessage(err);
        setState({ loading: false, error: msg, txHash: null });
        throw new Error(`[issueCredential] ${msg}`);
      }
    },
    [contractAddress, deriveCommitment, deriveIssuerPublicKey, getCompiledContract, getProviders],
  );

  const presentCredential = useCallback(
    async (
      studentSecretKey: Uint8Array,
      credentialData: CredentialData,
      nonceHex: string,
      challengeHex: string,
    ): Promise<PresentCredentialResult> => {
      setState({ loading: true, error: null, txHash: null });
      const studentSk = bytes32FromValue(studentSecretKey, "student secret key");
      const payload = packCredential(credentialData);
      const nonce = bytes32FromValue(nonceHex, "credential nonce");
      const challenge = bytes32FromValue(challengeHex, "verifier challenge");

      const providers = await getProviders();
      const compiledContract = getCompiledContract(
        createStudentWitnesses({
          studentSecretKey: studentSk,
          credentialPayload: payload,
          credentialNonce: nonce,
        }),
      );

      for (let attempt = 1; attempt <= 8; attempt += 1) {
        try {
          const result = await submitCallTx(providers as any, {
            compiledContract: compiledContract as any,
            contractAddress,
            circuitId: "presentCredential",
            args: [challenge],
          });

          const txHash = result.public.txHash;
          const txId = String(result.public.txId ?? "");
          const status = String(result.public.status ?? "");
          const blockHeight = Number(result.public.blockHeight ?? 0);
          const createdAt = parseBlockTimestamp(Number(result.public.blockTimestamp ?? Date.now()));
          setState({ loading: false, error: null, txHash });
          return {
            verified: true,
            txHash,
            txId,
            status,
            blockHeight,
            createdAt,
          };
        } catch (err) {
          const msg = extractErrorMessage(err);
          const retryable = /credential commitment not found in tree/i.test(msg);
          if (retryable && attempt < 8) {
            await delay(5_000);
            continue;
          }

          const finalMessage = retryable
            ? `${msg}. Ensure degree type, graduation year, institution ID, and nonce exactly match the issued credential.`
            : msg;
          setState({ loading: false, error: finalMessage, txHash: null });
          throw new Error(`[presentCredential] ${finalMessage}`);
        }
      }

      throw new Error("[presentCredential] Exhausted retry attempts.");
    },
    [contractAddress, getCompiledContract, getProviders],
  );

  const registerIssuer = useCallback(
    async (
      adminSecretKey: Uint8Array,
      issuerPublicKey: Uint8Array,
      attestationHash: Uint8Array,
    ) => {
      setState({ loading: true, error: null, txHash: null });
      try {
        const adminSk = bytes32FromValue(adminSecretKey, "admin secret key");
        const issuerPk = bytes32FromValue(issuerPublicKey, "issuer public key");
        const attHash = bytes32FromValue(attestationHash, "attestation hash");

        const providers = await getProviders();
        const compiledContract = getCompiledContract(createAdminWitnesses({ adminSecretKey: adminSk }));

        const result = await submitCallTx(providers as any, {
          compiledContract: compiledContract as any,
          contractAddress,
          circuitId: "registerIssuer",
          args: [issuerPk, attHash],
        });

        const txHash = result.public.txHash;
        setState({ loading: false, error: null, txHash });
        return txHash;
      } catch (err) {
        const msg = extractErrorMessage(err);
        setState({ loading: false, error: msg, txHash: null });
        throw new Error(`[registerIssuer] ${msg}`);
      }
    },
    [contractAddress, getCompiledContract, getProviders],
  );

  const deregisterIssuer = useCallback(
    async (adminSecretKey: Uint8Array, issuerPublicKey: Uint8Array) => {
      setState({ loading: true, error: null, txHash: null });
      try {
        const adminSk = bytes32FromValue(adminSecretKey, "admin secret key");
        const issuerPk = bytes32FromValue(issuerPublicKey, "issuer public key");

        const providers = await getProviders();
        const compiledContract = getCompiledContract(createAdminWitnesses({ adminSecretKey: adminSk }));

        const result = await submitCallTx(providers as any, {
          compiledContract: compiledContract as any,
          contractAddress,
          circuitId: "deregisterIssuer",
          args: [issuerPk],
        });

        const txHash = result.public.txHash;
        setState({ loading: false, error: null, txHash });
        return txHash;
      } catch (err) {
        const msg = extractErrorMessage(err);
        setState({ loading: false, error: msg, txHash: null });
        throw new Error(`[deregisterIssuer] ${msg}`);
      }
    },
    [contractAddress, getCompiledContract, getProviders],
  );

  const revokeCredential = useCallback(
    async (issuerSecretKey: Uint8Array, commitment: BytesLike) => {
      setState({ loading: true, error: null, txHash: null });
      try {
        const issuerSk = bytes32FromValue(issuerSecretKey, "issuer secret key");
        const commitmentBytes = bytes32FromValue(commitment, "credential commitment");

        const providers = await getProviders();
        const compiledContract = getCompiledContract(createIssuerWitnesses({ issuerSecretKey: issuerSk }));

        const result = await submitCallTx(providers as any, {
          compiledContract: compiledContract as any,
          contractAddress,
          circuitId: "revokeCredential",
          args: [commitmentBytes],
        });

        const txHash = result.public.txHash;
        setState({ loading: false, error: null, txHash });
        return txHash;
      } catch (err) {
        const msg = extractErrorMessage(err);
        setState({ loading: false, error: msg, txHash: null });
        throw new Error(`[revokeCredential] ${msg}`);
      }
    },
    [contractAddress, getCompiledContract, getProviders],
  );

  const isAuthorizedIssuer = useCallback(
    async (issuerPublicKey: BytesLike): Promise<boolean> => {
      const issuerPk = bytes32FromValue(issuerPublicKey, "issuer public key");
      return runBooleanCircuit("isAuthorizedIssuer", [issuerPk]);
    },
    [runBooleanCircuit],
  );

  const isTrustedIssuer = useCallback(
    async (issuerPublicKey: BytesLike, attestationHash: BytesLike): Promise<boolean> => {
      const issuerPk = bytes32FromValue(issuerPublicKey, "issuer public key");
      const attHash = bytes32FromValue(attestationHash, "attestation hash");
      return runBooleanCircuit("isTrustedIssuer", [issuerPk, attHash]);
    },
    [runBooleanCircuit],
  );

  const isCredentialRevoked = useCallback(
    async (commitment: BytesLike): Promise<boolean> => {
      const commitmentBytes = bytes32FromValue(commitment, "credential commitment");
      return runBooleanCircuit("isCredentialRevoked", [commitmentBytes]);
    },
    [runBooleanCircuit],
  );

  const isPresentationNullifierUsed = useCallback(
    async (presentationNullifier: BytesLike): Promise<boolean> => {
      const nullifier = bytes32FromValue(presentationNullifier, "presentation nullifier");
      return runBooleanCircuit("isPresentationNullifierUsed", [nullifier]);
    },
    [runBooleanCircuit],
  );

  const getLedgerState = useCallback(async (): Promise<LedgerStateSnapshot | null> => {
    return null;
  }, []);

  const verifyPresentationByTxHash = useCallback(
    async (txHash: string): Promise<PresentationLookupResult | null> => {
      const normalized = normalizeHex(txHash);
      if (!/^[0-9a-f]{64}$/.test(normalized)) {
        throw new Error("TX hash must be 64 hex chars.");
      }

      try {
        const providers = await getProviders();
        const walletConfig = await (connectedApi as ConnectedAPI).getConfiguration();
        const indexerUri = walletConfig.indexerUri ?? serviceUriConfig?.indexerUri ?? "";

        for (let attempt = 1; attempt <= 12; attempt += 1) {
          const identifiers = indexerUri ? await queryTxIdentifiersByHash(indexerUri, normalized) : [];

          for (const txId of identifiers) {
            try {
              const finalized = await withTimeout(
                providers.publicDataProvider.watchForTxData(txId as any),
                10_000,
                "Timed out waiting for tx data by identifier.",
              );

              return {
                txHash: normalizeHex(String(finalized.txHash ?? normalized)),
                txId: String(finalized.txId),
                status: String(finalized.status),
                blockHeight: finalized.blockHeight,
                createdAt: parseBlockTimestamp(finalized.blockTimestamp),
              };
            } catch {
              // Try next identifier if this one is not yet indexed.
            }
          }

          await delay(5_000);
        }

        return null;
      } catch {
        return null;
      }
    },
    [connectedApi, getProviders, serviceUriConfig],
  );

  const deriveIssuerPublicKeyHex = useCallback((issuerSecretKey: BytesLike): string => {
    const sk = bytes32FromValue(issuerSecretKey, "issuer secret key");
    return toHex(deriveIssuerPublicKey(sk));
  }, [deriveIssuerPublicKey]);

  const deriveAdminPublicKeyHex = useCallback((adminSecretKey: BytesLike): string => {
    const sk = bytes32FromValue(adminSecretKey, "admin secret key");
    return toHex(deriveAdminPublicKey(sk));
  }, [deriveAdminPublicKey]);

  const getExpectedAdminPublicKeyHex = useCallback(async (): Promise<ExpectedAdminKeyResult | null> => {
    const normalizedAddress = normalizeHex(contractAddress);
    if (!/^[0-9a-f]{64}$/.test(normalizedAddress)) {
      return null;
    }

    try {
      const url = new URL("/api/contract/admin-public-key", window.location.origin);
      url.searchParams.set("contractAddress", normalizedAddress);
      const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as Partial<ExpectedAdminKeyResult>;
      if (!payload.adminPublicKeyHex || !/^[0-9a-fA-F]{64}$/.test(payload.adminPublicKeyHex)) {
        return null;
      }

      return {
        adminPublicKeyHex: normalizeHex(payload.adminPublicKeyHex),
        source: payload.source,
      };
    } catch {
      return null;
    }
  }, [contractAddress]);

  const getEnvironmentDiagnostics = useCallback(async (): Promise<EnvironmentDiagnosticsResult | null> => {
    try {
      const response = await fetch("/api/contract/env-check", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        return {
          ok: false,
          errors: [`Environment diagnostics API returned ${response.status}.`],
          warnings: [],
        };
      }

      const payload = (await response.json()) as Partial<EnvironmentDiagnosticsResult>;
      return {
        ok: Boolean(payload.ok),
        errors: Array.isArray(payload.errors) ? payload.errors.map(String) : [],
        warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String) : [],
      };
    } catch (error) {
      return {
        ok: false,
        errors: [`Failed to load environment diagnostics: ${extractErrorMessage(error)}`],
        warnings: [],
      };
    }
  }, []);

  return {
    ...state,
    issueCredential,
    presentCredential,
    registerIssuer,
    deregisterIssuer,
    revokeCredential,
    isAuthorizedIssuer,
    isTrustedIssuer,
    isCredentialRevoked,
    isPresentationNullifierUsed,
    deriveIssuerPublicKeyHex,
    deriveAdminPublicKeyHex,
    getExpectedAdminPublicKeyHex,
    getEnvironmentDiagnostics,
    getLedgerState,
    verifyPresentationByTxHash,
  };
}
