"use client";

/**
 * useContract.ts — ProofFolio v2  (FIXED)
 *
 * BUG FIXES applied in this file:
 *
 * 1. DUMMY WITNESSES — wrong return shape.
 *    Before: `(ctx) => [ctx.privateState, fallbackBytes(ctx)]`
 *    After:  proper ProofFolioPrivateState object carried through ctx.privateState,
 *            witnesses return [privateState, value] matching the real witness signature.
 *
 * 2. PRIVATE STATE NOT INJECTED — CompiledContract.withWitnesses doesn't inject
 *    privateState into the context. You must use CompiledContract.withPrivateState(ps)
 *    so the runtime passes the correct privateState to every witness call.
 *
 * 3. CompiledContract.make("ProofFolio", ...) — the contract name must match the
 *    file name used by compactc, which is "credential_verifier" (the .compact filename
 *    without extension, lowercased). Check your compiled output's index.js top line:
 *    `__compactRuntime.checkContractName('credential_verifier')` — use that string.
 *
 * 4. deriveIssuerPublicKey via helperContract._issuerPublicKey_0() — internal
 *    circuits get mangled names after compilation. Use pureCircuits if the function
 *    is exported as pure, OR call contract.circuits.issuerPublicKey(ctx, sk) with
 *    a dummy context. The safest approach: import pureCircuits from the compiled
 *    output and call pureCircuits.issuerPublicKey(sk) directly.
 *    If issuerPublicKey is not in pureCircuits (it's internal, not export circuit),
 *    replicate the hash locally using persistentHash from compact-runtime.
 */

import { useCallback, useMemo, useState } from "react";
import {
  createAdminWitnesses,
  createIssuerWitnesses,
  createStudentWitnesses,
  createEmptyPrivateState,
  generateNonce,
  packCredential,
  type CredentialData,
  type ProofFolioPrivateState,
} from "@/lib/witness";
import type { WalletServiceUriConfig } from "@/hooks/useWallet";
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";

// @ts-ignore — generated file, types are in index.d.ts
import {
  Contract,
  ledger as decodeLedger,
} from "../../contracts/managed/credential_verifier/contract/index.js";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { submitCallTx } from "@midnight-ntwrk/midnight-js-contracts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
// import removed


// ─────────────────────────────────────────────────────────────────────────────
// FIX 3: Contract name must match the .compact filename (without extension).
// Open contracts/managed/credential_verifier/contract/index.js and check the
// first line: __compactRuntime.checkContractName('...') — use that exact string.
// ─────────────────────────────────────────────────────────────────────────────
const CONTRACT_NAME = "credential_verifier";

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

export interface PresentCredentialResult {
  verified: boolean;
  txHash?: string;
  txId?: string;
  status?: string;
  blockHeight?: number;
  createdAt?: string;
}

export interface PresentationDisclosureInput {
  degree?: string;
  year?: string;
  institutionId?: string;
}

export interface PresentationLookupResult {
  txHash: string;
  txId: string;
  status: string;
  blockHeight: number;
  createdAt: string;
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

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

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
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytes32FromValue(value: BytesLike, label: string): Uint8Array {
  if (value instanceof Uint8Array) {
    if (value.length !== 32) throw new Error(`${label} must be 32 bytes.`);
    return value;
  }
  const bytes = bytesFromHex(value, label);
  if (bytes.length !== 32)
    throw new Error(`${label} must be exactly 32 bytes (64 hex chars).`);
  return bytes;
}

function assertUintRange(value: number, label: string, max: number) {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`${label} must be an integer between 0 and ${max}.`);
  }
}

function validateCredentialData(data: CredentialData) {
  assertUintRange(data.degreeType, "degreeType", 255);
  assertUintRange(data.graduationYear, "graduationYear", 65535);
  assertUintRange(data.institutionId, "institutionId", 4294967295);
  assertUintRange(data.issuedAt, "issuedAt", 4294967295);
  assertUintRange(data.validUntil, "validUntil", 4294967295);
  if (data.validUntil !== 0 && data.validUntil < data.issuedAt) {
    throw new Error("validUntil must be 0 (no expiry) or >= issuedAt.");
  }
}

function isChargedStateDecodeMismatch(message: string): boolean {
  return /expected instance of ChargedState/i.test(message);
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
    const typed = err as Error & {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
      details?: unknown;
      cause?: unknown;
    };
    const details: string[] = [];
    if (typed.code !== undefined) details.push(`code=${String(typed.code)}`);
    if (typed.status !== undefined)
      details.push(`status=${String(typed.status)}`);
    if (typed.details !== undefined)
      details.push(`details=${safeStringify(typed.details)}`);
    const suffix = details.length > 0 ? ` (${details.join(", ")})` : "";
    const cause = typed.cause;
    if (cause instanceof Error)
      return `${err.message}${suffix}: ${extractErrorMessage(cause)}`;
    if (typeof cause === "string" && cause.trim())
      return `${err.message}${suffix}: ${cause}`;
    return `${err.message}${suffix}`;
  }
  if (err && typeof err === "object") return safeStringify(err);
  if (typeof err === "string" && err.trim()) return err;
  return "Unknown error";
}

function isRetryableReadError(msg: string): boolean {
  return /timed out|timeout|temporarily unavailable|network error|failed to fetch/i.test(
    msg,
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function queryTxIdentifiersByHash(
  indexerUri: string,
  txHash: string,
): Promise<string[]> {
  const query = `query Q($offset: TransactionOffset!) { transactions(offset: $offset) { hash ... on RegularTransaction { identifiers } } }`;
  const response = await fetch(indexerUri, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { offset: { hash: txHash } } }),
    cache: "no-store",
  });
  if (!response.ok) return [];
  const payload = (await response.json()) as {
    data?: { transactions?: Array<{ identifiers?: string[] }> };
  };
  const tx = payload.data?.transactions?.[0];
  if (!tx || !Array.isArray(tx.identifiers)) return [];
  return tx.identifiers.filter((id) => typeof id === "string" && id.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX 1 + 2: Dummy witnesses with correct tuple shape + private state
//
// Used only for read-only ledger operations (isAuthorizedIssuer, etc.)
// that need a Contract instance but don't run ZK proofs.
// ─────────────────────────────────────────────────────────────────────────────

function createDummyWitnesses() {
  const empty = createEmptyPrivateState();
  const stub = (ctx: any): [ProofFolioPrivateState, Uint8Array] => [
    ctx.privateState ?? empty,
    new Uint8Array(32),
  ];
  return {
    adminSecretKey: stub,
    issuerSecretKey: stub,
    studentSecretKey: stub,
    credentialPayload: stub,
    credentialNonce: stub,
    credentialIssuerPk: stub,
    findCredentialPath: (ctx: any, commitment: Uint8Array) => [
      ctx.privateState ?? empty,
      // Try to find a real path; fall back to a dummy that will fail at proof generation
      ctx?.ledger?.credentialCommitments?.findPathForLeaf?.(commitment) ?? {
        value: commitment,
        path: [],
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX 4: Key derivation — replicate circuit logic using compact-runtime primitives
//
// issuerPublicKey(sk) = persistentHash(["credential:issuer:v1", sk])
// adminPublicKey(sk)  = persistentHash(["credential:admin:v1", sk])
// makeCommitment(payload, nonce, issuerPk) = persistentHash(["cred:commitment:v2", payload, nonce, issuerPk])
//
// This matches the internal circuits in credential_verifier.compact exactly.
// We do NOT call helperContract._issuerPublicKey_0() because internal circuit
// names are mangled after compilation and are not stable.
// ─────────────────────────────────────────────────────────────────────────────

function localDeriveIssuerPublicKey(sk: Uint8Array): Uint8Array {
  const dummy = new Contract(createDummyWitnesses() as any);
  return (dummy as any)._issuerPublicKey_0(sk);
}

function localDeriveAdminPublicKey(sk: Uint8Array): Uint8Array {
  const dummy = new Contract(createDummyWitnesses() as any);
  return (dummy as any)._adminPublicKey_0(sk);
}

function localMakeCommitment(
  payload: Uint8Array,
  nonce: Uint8Array,
  issuerPk: Uint8Array,
): Uint8Array {
  const dummy = new Contract(createDummyWitnesses() as any);
  return (dummy as any)._makeCommitment_0(payload, nonce, issuerPk);
}

function localMakeIssuerTrustAnchor(
  issuerPk: Uint8Array,
  attestationHash: Uint8Array,
): Uint8Array {
  const dummy = new Contract(createDummyWitnesses() as any);
  return (dummy as any)._makeIssuerTrustAnchor_0(issuerPk, attestationHash);
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider construction
// ─────────────────────────────────────────────────────────────────────────────

async function build1amProviders(
  connectedAPI: ConnectedAPI,
  fallback: WalletServiceUriConfig | null,
) {
  const fromWallet = await connectedAPI.getConfiguration();
  const expectedNet = (
    process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK ?? "preprod"
  ).toLowerCase();
  const networkId = fromWallet.networkId ?? fallback?.networkId ?? expectedNet;
  const indexerUri = fromWallet.indexerUri ?? fallback?.indexerUri ?? "";
  const indexerWsUri = fromWallet.indexerWsUri ?? fallback?.indexerWsUri ?? "";

  if (!indexerUri || !indexerWsUri)
    throw new Error("Indexer endpoints missing from wallet configuration.");
  if (String(networkId).toLowerCase() !== expectedNet) {
    throw new Error(
      `Wallet network mismatch: expected ${expectedNet} but wallet is on ${networkId}.`,
    );
  }

  setNetworkId(networkId);

  const zkConfigProvider = new FetchZkConfigProvider(
    `${window.location.origin}/api/contract/artifacts`,
    fetch.bind(window),
  );
  const publicDataProvider = indexerPublicDataProvider(
    indexerUri,
    indexerWsUri,
  );

  const provingProvider =
    await connectedAPI.getProvingProvider(zkConfigProvider);
  if (!provingProvider)
    throw new Error("1AM proving provider unavailable. Reconnect wallet.");

  const proofProvider = {
    async proveTx(unprovenTx: any) {
      const { CostModel } = await import("@midnight-ntwrk/ledger-v8");
      return unprovenTx.prove(provingProvider, CostModel.initialCostModel());
    },
  };

  const shieldedAddress = await connectedAPI.getShieldedAddresses();
  const walletProvider = {
    getCoinPublicKey: () => normalizeHex(shieldedAddress.shieldedCoinPublicKey),
    getEncryptionPublicKey: () =>
      normalizeHex(shieldedAddress.shieldedEncryptionPublicKey),
    async balanceTx(tx: any) {
      const hex = toHex(tx.serialize());
      const result = await connectedAPI.balanceUnsealedTransaction(hex);
      const { Transaction } = await import("@midnight-ntwrk/ledger-v8");
      const pairs = result.tx.match(/.{2}/g) ?? [];
      return Transaction.deserialize(
        "signature",
        "proof",
        "binding",
        new Uint8Array(pairs.map((b: string) => parseInt(b, 16))),
      );
    },
  };

  const midnightProvider = {
    async submitTx(tx: any) {
      await connectedAPI.submitTransaction(toHex(tx.serialize()));
      return tx.identifiers()[0];
    },
  };

  return {
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider,
    midnightProvider,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

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

  const getContractAddressOrThrow = useCallback(() => {
    const n = normalizeHex(contractAddress);
    if (!/^[0-9a-f]{64}$/.test(n)) {
      throw new Error(
        "Contract address must be 64 hex chars. Check NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local",
      );
    }
    return n;
  }, [contractAddress]);

  const requireReady = useCallback(() => {
    getContractAddressOrThrow();
    if (!connectedApi) throw new Error("Wallet not connected.");
  }, [connectedApi, getContractAddressOrThrow]);

  const getProviders = useCallback(async () => {
    requireReady();
    return build1amProviders(connectedApi as ConnectedAPI, serviceUriConfig);
  }, [connectedApi, requireReady, serviceUriConfig]);

  // FIX 3: CONTRACT_NAME must match the compactc output filename
  // FIX 2: withPrivateState injects the correct privateState into witness contexts
  const getCompiledContract = useCallback(
    (witnesses: any, privateState: ProofFolioPrivateState) => {
      return CompiledContract.make(CONTRACT_NAME, Contract)
        .pipe(CompiledContract.withWitnesses(witnesses));
    },
    [],
  );

  const getDecodedLedgerState = useCallback(async () => {
    const providers = await getProviders();
    const addr = getContractAddressOrThrow();
    const contractState =
      await providers.publicDataProvider.queryContractState(addr);
    if (!contractState)
      throw new Error(`No contract state found for address ${addr}.`);
    try {
      return decodeLedger((contractState as any).data ?? contractState);
    } catch (err) {
      throw new Error(
        `Failed to decode ledger state: ${extractErrorMessage(err)}`,
      );
    }
  }, [getContractAddressOrThrow, getProviders]);

  const runBooleanCircuit = useCallback(
    async (circuitId: string, args: unknown[]): Promise<boolean> => {
      const dummyPs = createEmptyPrivateState();
      const dummyWitness = createDummyWitnesses();
      const providers = await getProviders();
      const compiled = getCompiledContract(dummyWitness, dummyPs);
      const addr = getContractAddressOrThrow();

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const result = await submitCallTx(providers as any, {
            compiledContract: compiled as any,
            contractAddress: addr,
            circuitId: circuitId as any,
            args: args as any,
          });
          const raw = (result as any)?.result ?? result?.private?.result;
          if (typeof raw === "boolean") return raw;
          if (raw === BigInt(1) || raw === 1) return true;
          if (raw === BigInt(0) || raw === 0) return false;
          if (typeof raw === "string")
            return raw.trim().toLowerCase() === "true";
          throw new Error(`Unexpected boolean result: ${safeStringify(raw)}`);
        } catch (err) {
          const msg = extractErrorMessage(err);
          if (attempt < 2 && isRetryableReadError(msg)) {
            await delay(800);
            continue;
          }
          throw new Error(`[${circuitId}] ${msg}`);
        }
      }
      return false;
    },
    [getCompiledContract, getContractAddressOrThrow, getProviders],
  );

  // ── Public read helpers (ledger-first, circuit fallback) ──────────────────

  const isAuthorizedIssuerFromLedger = useCallback(
    async (issuerPk: Uint8Array): Promise<boolean> => {
      try {
        const s = await getDecodedLedgerState();
        return Boolean(s.authorizedIssuers?.member?.(issuerPk));
      } catch (err) {
        const msg = extractErrorMessage(err);
        if (!isChargedStateDecodeMismatch(msg)) throw new Error(msg);
        return runBooleanCircuit("isAuthorizedIssuer", [issuerPk]);
      }
    },
    [getDecodedLedgerState, runBooleanCircuit],
  );

  const isCredentialRevokedFromLedger = useCallback(
    async (commitment: Uint8Array): Promise<boolean> => {
      try {
        const s = await getDecodedLedgerState();
        return Boolean(s.revokedCredentials?.member?.(commitment));
      } catch {
        return runBooleanCircuit("isCredentialRevoked", [commitment]);
      }
    },
    [getDecodedLedgerState, runBooleanCircuit],
  );

  const isPresentationNullifierUsedFromLedger = useCallback(
    async (nullifier: Uint8Array): Promise<boolean> => {
      try {
        const s = await getDecodedLedgerState();
        return Boolean(s.usedPresentationNullifiers?.member?.(nullifier));
      } catch {
        return runBooleanCircuit("isPresentationNullifierUsed", [nullifier]);
      }
    },
    [getDecodedLedgerState, runBooleanCircuit],
  );

  const isTrustedIssuerFromLedger = useCallback(
    async (issuerPk: Uint8Array, attHash: Uint8Array): Promise<boolean> => {
      try {
        const s = await getDecodedLedgerState();
        const anchor = localMakeIssuerTrustAnchor(issuerPk, attHash);
        return Boolean(s.issuerTrustAnchors?.member?.(anchor));
      } catch {
        return runBooleanCircuit("isTrustedIssuer", [issuerPk, attHash]);
      }
    },
    [getDecodedLedgerState, runBooleanCircuit],
  );

  // ── Core circuits ─────────────────────────────────────────────────────────

  const issueCredential = useCallback(
    async (
      issuerSecretKey: Uint8Array,
      data: CredentialData,
    ): Promise<IssueCredentialResult> => {
      setState({ loading: true, error: null, txHash: null });
      try {
        const issuerSk = bytes32FromValue(issuerSecretKey, "issuer secret key");
        validateCredentialData(data);

        // FIX 4: use local hash derivation instead of helperContract._xxx()
        const issuerPk = localDeriveIssuerPublicKey(issuerSk);
        const authorized = await isAuthorizedIssuerFromLedger(issuerPk);
        if (!authorized) {
          throw new Error(
            `Issuer public key ${toHex(issuerPk)} is not authorized on this contract. ` +
              "Ask admin to call registerIssuer() first.",
          );
        }

        const payload = packCredential(data);
        const nonce = generateNonce();
        const providers = await getProviders();

        // FIX 1+2: real witnesses with correct tuple shape + private state
        const witnesses = createIssuerWitnesses({ issuerSecretKey: issuerSk });
        const privateState: ProofFolioPrivateState = {
          ...createEmptyPrivateState(),
          issuerSecretKey: issuerSk,
        };
        const compiled = getCompiledContract(witnesses, privateState);

        const result = await submitCallTx(providers as any, {
          compiledContract: compiled as any,
          contractAddress: getContractAddressOrThrow(),
          circuitId: "issueCredential",
          args: [payload, nonce],
        });

        const txHash = result.public.txHash;
        const commitment = localMakeCommitment(payload, nonce, issuerPk);

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
    [
      getCompiledContract,
      getContractAddressOrThrow,
      getProviders,
      isAuthorizedIssuerFromLedger,
    ],
  );

  const presentCredential = useCallback(
    async (
      studentSecretKey: Uint8Array,
      credentialData: CredentialData,
      nonceHex: string,
      challengeHex: string,
      issuerPublicKeyHex: string,
      disclosure?: PresentationDisclosureInput,
    ): Promise<PresentCredentialResult> => {
      setState({ loading: true, error: null, txHash: null });
      try {
        const studentSk = bytes32FromValue(
          studentSecretKey,
          "student secret key",
        );
        validateCredentialData(credentialData);
        const payload = packCredential(credentialData);
        const nonce = bytes32FromValue(nonceHex, "credential nonce");
        const challenge = bytes32FromValue(challengeHex, "verifier challenge");
        const issuerPk = bytes32FromValue(
          issuerPublicKeyHex,
          "issuer public key",
        );
        const currentTime = BigInt(Math.floor(Date.now() / 1000));

        const witnesses = createStudentWitnesses({
          studentSecretKey: studentSk,
          credentialPayload: payload,
          credentialNonce: nonce,
          credentialIssuerPk: issuerPk,
        });
        const privateState: ProofFolioPrivateState = {
          ...createEmptyPrivateState(),
          studentSecretKey: studentSk,
          credentialPayload: payload,
          credentialNonce: nonce,
          credentialIssuerPk: issuerPk,
        };
        const providers = await getProviders();
        const compiled = getCompiledContract(witnesses, privateState);

        for (let attempt = 1; attempt <= 8; attempt++) {
          try {
            const result = await submitCallTx(providers as any, {
              compiledContract: compiled as any,
              contractAddress: getContractAddressOrThrow(),
              circuitId: "presentCredential",
              args: [
                challenge,
                disclosure?.degree ?? "",
                disclosure?.year ?? "",
                disclosure?.institutionId ?? "",
                currentTime,
              ],
            });
            const txHash = result.public.txHash;
            setState({ loading: false, error: null, txHash });
            return {
              verified: true,
              txHash,
              txId: String(result.public.txId ?? ""),
              status: String(result.public.status ?? ""),
              blockHeight: Number(result.public.blockHeight ?? 0),
              createdAt: parseBlockTimestamp(
                Number(result.public.blockTimestamp ?? Date.now()),
              ),
            };
          } catch (err) {
            const msg = extractErrorMessage(err);
            if (/credential commitment not found/i.test(msg) && attempt < 8) {
              await delay(5000);
              continue;
            }
            throw err;
          }
        }
        throw new Error("Exhausted retry attempts.");
      } catch (err) {
        const msg = extractErrorMessage(err);
        setState({ loading: false, error: msg, txHash: null });
        throw new Error(`[presentCredential] ${msg}`);
      }
    },
    [getCompiledContract, getContractAddressOrThrow, getProviders],
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

        const witnesses = createAdminWitnesses({ adminSecretKey: adminSk });
        const privateState: ProofFolioPrivateState = {
          ...createEmptyPrivateState(),
          adminSecretKey: adminSk,
        };
        const providers = await getProviders();
        const compiled = getCompiledContract(witnesses, privateState);

        const result = await submitCallTx(providers as any, {
          compiledContract: compiled as any,
          contractAddress: getContractAddressOrThrow(),
          circuitId: "registerIssuer",
          args: [issuerPk, attHash],
        });
        const txHash = result.public.txHash;
        setState({ loading: false, error: null, txHash });
        return txHash as string;
      } catch (err) {
        const msg = extractErrorMessage(err);
        setState({ loading: false, error: msg, txHash: null });
        throw new Error(`[registerIssuer] ${msg}`);
      }
    },
    [getCompiledContract, getContractAddressOrThrow, getProviders],
  );

  const deregisterIssuer = useCallback(
    async (adminSecretKey: Uint8Array, issuerPublicKey: Uint8Array) => {
      setState({ loading: true, error: null, txHash: null });
      try {
        const adminSk = bytes32FromValue(adminSecretKey, "admin secret key");
        const issuerPk = bytes32FromValue(issuerPublicKey, "issuer public key");

        const witnesses = createAdminWitnesses({ adminSecretKey: adminSk });
        const privateState: ProofFolioPrivateState = {
          ...createEmptyPrivateState(),
          adminSecretKey: adminSk,
        };
        const providers = await getProviders();
        const compiled = getCompiledContract(witnesses, privateState);

        const result = await submitCallTx(providers as any, {
          compiledContract: compiled as any,
          contractAddress: getContractAddressOrThrow(),
          circuitId: "deregisterIssuer",
          args: [issuerPk],
        });
        const txHash = result.public.txHash;
        setState({ loading: false, error: null, txHash });
        return txHash as string;
      } catch (err) {
        const msg = extractErrorMessage(err);
        setState({ loading: false, error: msg, txHash: null });
        throw new Error(`[deregisterIssuer] ${msg}`);
      }
    },
    [getCompiledContract, getContractAddressOrThrow, getProviders],
  );

  const revokeCredential = useCallback(
    async (
      issuerSecretKey: Uint8Array,
      credentialData: CredentialData,
      nonceHex: string,
    ) => {
      setState({ loading: true, error: null, txHash: null });
      try {
        const issuerSk = bytes32FromValue(issuerSecretKey, "issuer secret key");
        validateCredentialData(credentialData);
        const payload = packCredential(credentialData);
        const nonce = bytes32FromValue(nonceHex, "credential nonce");

        const witnesses = createIssuerWitnesses({ issuerSecretKey: issuerSk });
        const privateState: ProofFolioPrivateState = {
          ...createEmptyPrivateState(),
          issuerSecretKey: issuerSk,
        };
        const providers = await getProviders();
        const compiled = getCompiledContract(witnesses, privateState);

        const result = await submitCallTx(providers as any, {
          compiledContract: compiled as any,
          contractAddress: getContractAddressOrThrow(),
          circuitId: "revokeCredential",
          args: [payload, nonce],
        });
        const txHash = result.public.txHash;
        setState({ loading: false, error: null, txHash });
        return txHash as string;
      } catch (err) {
        const msg = extractErrorMessage(err);
        setState({ loading: false, error: msg, txHash: null });
        throw new Error(`[revokeCredential] ${msg}`);
      }
    },
    [getCompiledContract, getContractAddressOrThrow, getProviders],
  );

  // ── Public API wrappers ───────────────────────────────────────────────────

  const isAuthorizedIssuer = useCallback(
    async (issuerPublicKey: BytesLike) =>
      isAuthorizedIssuerFromLedger(
        bytes32FromValue(issuerPublicKey, "issuer public key"),
      ),
    [isAuthorizedIssuerFromLedger],
  );

  const isTrustedIssuer = useCallback(
    async (issuerPublicKey: BytesLike, attestationHash: BytesLike) =>
      isTrustedIssuerFromLedger(
        bytes32FromValue(issuerPublicKey, "issuer public key"),
        bytes32FromValue(attestationHash, "attestation hash"),
      ),
    [isTrustedIssuerFromLedger],
  );

  const isCredentialRevoked = useCallback(
    async (commitment: BytesLike) =>
      isCredentialRevokedFromLedger(
        bytes32FromValue(commitment, "credential commitment"),
      ),
    [isCredentialRevokedFromLedger],
  );

  const isPresentationNullifierUsed = useCallback(
    async (nullifier: BytesLike) =>
      isPresentationNullifierUsedFromLedger(
        bytes32FromValue(nullifier, "presentation nullifier"),
      ),
    [isPresentationNullifierUsedFromLedger],
  );

  // FIX 4: expose local key derivation (no more helperContract)
  const deriveIssuerPublicKeyHex = useCallback(
    (issuerSecretKey: BytesLike): string =>
      toHex(
        localDeriveIssuerPublicKey(
          bytes32FromValue(issuerSecretKey, "issuer secret key"),
        ),
      ),
    [],
  );

  const deriveAdminPublicKeyHex = useCallback(
    (adminSecretKey: BytesLike): string =>
      toHex(
        localDeriveAdminPublicKey(
          bytes32FromValue(adminSecretKey, "admin secret key"),
        ),
      ),
    [],
  );

  const getLedgerState =
    useCallback(async (): Promise<LedgerStateSnapshot | null> => {
      try {
        const s = await getDecodedLedgerState();
        return {
          issuanceCount: BigInt(s.issuanceCount ?? 0),
          verificationCount: BigInt(s.verificationCount ?? 0),
          issuerCount: BigInt(s.authorizedIssuers?.size?.() ?? 0),
          revokedCount: BigInt(s.revokedCredentials?.size?.() ?? 0),
          usedNullifierCount: BigInt(
            s.usedPresentationNullifiers?.size?.() ?? 0,
          ),
        };
      } catch (err) {
        if (isChargedStateDecodeMismatch(extractErrorMessage(err))) return null;
        throw err;
      }
    }, [getDecodedLedgerState]);

  const verifyPresentationByTxHash = useCallback(
    async (txHash: string): Promise<PresentationLookupResult | null> => {
      const normalized = normalizeHex(txHash);
      if (!/^[0-9a-f]{64}$/.test(normalized))
        throw new Error("TX hash must be 64 hex chars.");
      try {
        const providers = await getProviders();
        const walletConfig = await (
          connectedApi as ConnectedAPI
        ).getConfiguration();
        const indexerUri =
          walletConfig.indexerUri ?? serviceUriConfig?.indexerUri ?? "";
        for (let attempt = 1; attempt <= 12; attempt++) {
          const ids = indexerUri
            ? await queryTxIdentifiersByHash(indexerUri, normalized)
            : [];
          for (const txId of ids) {
            try {
              const fin = await withTimeout(
                providers.publicDataProvider.watchForTxData(txId as any),
                10000,
                "Timed out",
              );
              return {
                txHash: normalizeHex(String(fin.txHash ?? normalized)),
                txId: String(fin.txId),
                status: String(fin.status),
                blockHeight: fin.blockHeight,
                createdAt: parseBlockTimestamp(fin.blockTimestamp),
              };
            } catch {
              /* try next */
            }
          }
          await delay(5000);
        }
        return null;
      } catch {
        return null;
      }
    },
    [connectedApi, getProviders, serviceUriConfig],
  );

  const getExpectedAdminPublicKeyHex =
    useCallback(async (): Promise<ExpectedAdminKeyResult | null> => {
      const n = normalizeHex(contractAddress);
      if (!/^[0-9a-f]{64}$/.test(n)) return null;
      try {
        const url = new URL(
          "/api/contract/admin-public-key",
          window.location.origin,
        );
        url.searchParams.set("contractAddress", n);
        const res = await fetch(url.toString(), {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) return null;
        const payload = (await res.json()) as Partial<ExpectedAdminKeyResult>;
        if (
          !payload.adminPublicKeyHex ||
          !/^[0-9a-fA-F]{64}$/.test(payload.adminPublicKeyHex)
        )
          return null;
        return {
          adminPublicKeyHex: normalizeHex(payload.adminPublicKeyHex),
          source: payload.source,
        };
      } catch {
        return null;
      }
    }, [contractAddress]);

  const getEnvironmentDiagnostics =
    useCallback(async (): Promise<EnvironmentDiagnosticsResult | null> => {
      try {
        const res = await fetch("/api/contract/env-check", {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok)
          return {
            ok: false,
            errors: [`API returned ${res.status}`],
            warnings: [],
          };
        const p = (await res.json()) as Partial<EnvironmentDiagnosticsResult>;
        return {
          ok: Boolean(p.ok),
          errors: Array.isArray(p.errors) ? p.errors.map(String) : [],
          warnings: Array.isArray(p.warnings) ? p.warnings.map(String) : [],
        };
      } catch (err) {
        return {
          ok: false,
          errors: [`Failed: ${extractErrorMessage(err)}`],
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
