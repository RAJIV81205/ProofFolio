'use client';

import { useCallback, useState } from 'react';
import {
  createAdminWitnesses,
  createIssuerWitnesses,
  createStudentWitnesses,
  generateNonce,
  packCredential,
  type CredentialData,
} from '@/lib/witness';
import type { WalletServiceUriConfig } from '@/hooks/useWallet';

type Hex = string;

interface LocalCredentialRecord {
  txHash: Hex;
  commitmentHex: Hex;
  payloadHex: Hex;
  nonceHex: Hex;
  issuedAt: string;
  revoked: boolean;
}

interface LocalPresentationRecord {
  txHash: Hex;
  challengeHex: Hex;
  nullifierHex: Hex;
  commitmentHex: Hex;
  createdAt: string;
}

interface LocalState {
  issuers: Hex[];
  trustAnchors: Hex[];
  credentials: LocalCredentialRecord[];
  presentations: LocalPresentationRecord[];
}

const STORAGE_KEY = 'credzk:v1:local-state';

export interface ContractState {
  loading: boolean;
  error: string | null;
  txHash: string | null;
}

const emptyState: LocalState = {
  issuers: [],
  trustAnchors: [],
  credentials: [],
  presentations: [],
};

const hexRegex = /^[0-9a-f]+$/i;

function toHex(bytes: Uint8Array): Hex {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeHex(hex: string): Hex {
  const normalized = hex.trim().toLowerCase().replace(/^0x/, '');
  if (normalized.length === 0 || normalized.length % 2 !== 0 || !hexRegex.test(normalized)) {
    throw new Error('Invalid hex input.');
  }
  return normalized;
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = normalizeHex(hex);
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function randomHex(bytes = 32): Hex {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr);
}

async function sha256Hex(bytes: Uint8Array): Promise<Hex> {
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return toHex(new Uint8Array(digest));
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((acc, part) => acc + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function readLocalState(): LocalState {
  if (typeof window === 'undefined') return emptyState;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyState;

  try {
    const parsed = JSON.parse(raw) as LocalState;
    return {
      issuers: parsed.issuers ?? [],
      trustAnchors: parsed.trustAnchors ?? [],
      credentials: parsed.credentials ?? [],
      presentations: parsed.presentations ?? [],
    };
  } catch {
    return emptyState;
  }
}

function writeLocalState(state: LocalState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useContract(contractAddress: string, _serviceUriConfig: WalletServiceUriConfig | null) {
  const [state, setState] = useState<ContractState>({
    loading: false,
    error: null,
    txHash: null,
  });

  const requireContract = useCallback(() => {
    if (!contractAddress || contractAddress.trim().length === 0) {
      throw new Error('Contract address missing. Set NEXT_PUBLIC_CONTRACT_ADDRESS in frontend/.env.local');
    }
  }, [contractAddress]);

  const issueCredential = useCallback(
    async (issuerSecretKey: Uint8Array, data: CredentialData) => {
      setState({ loading: true, error: null, txHash: null });
      try {
        requireContract();

        // Validate witness shape early.
        createIssuerWitnesses({ issuerSecretKey });

        const payload = packCredential(data);
        const nonce = generateNonce();
        const commitmentHex = await sha256Hex(concatBytes(payload, nonce));
        const txHash = randomHex(32);

        const persisted = readLocalState();
        persisted.credentials.push({
          txHash,
          commitmentHex,
          payloadHex: toHex(payload),
          nonceHex: toHex(nonce),
          issuedAt: new Date().toISOString(),
          revoked: false,
        });
        writeLocalState(persisted);

        setState({ loading: false, error: null, txHash });
        return {
          txHash,
          commitmentHex,
          nonceHex: toHex(nonce),
          payloadHex: toHex(payload),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown issueCredential error';
        setState({ loading: false, error: msg, txHash: null });
        throw err;
      }
    },
    [requireContract],
  );

  const presentCredential = useCallback(
    async (
      studentSecretKey: Uint8Array,
      data: CredentialData,
      nonceHex: string,
      verifierChallengeHex: string,
    ) => {
      setState({ loading: true, error: null, txHash: null });
      try {
        requireContract();

        const payload = packCredential(data);
        const nonce = hexToBytes(nonceHex);
        const challenge = hexToBytes(verifierChallengeHex);

        if (challenge.length !== 32) {
          throw new Error('Verifier challenge must be 32 bytes (64 hex characters).');
        }

        createStudentWitnesses({
          studentSecretKey,
          credentialPayload: payload,
          credentialNonce: nonce,
        });

        const commitmentHex = await sha256Hex(concatBytes(payload, nonce));
        const local = readLocalState();
        const issued = local.credentials.find((c) => c.commitmentHex === commitmentHex && !c.revoked);

        if (!issued) {
          throw new Error('Credential commitment not found. Issue credential first or check nonce/data.');
        }

        const nullifierHex = await sha256Hex(concatBytes(studentSecretKey, nonce, challenge));
        if (local.presentations.some((p) => p.nullifierHex === nullifierHex)) {
          throw new Error('This challenge has already been used for this credential (anti-replay).');
        }

        const txHash = randomHex(32);
        local.presentations.push({
          txHash,
          challengeHex: normalizeHex(verifierChallengeHex),
          nullifierHex,
          commitmentHex,
          createdAt: new Date().toISOString(),
        });
        writeLocalState(local);

        setState({ loading: false, error: null, txHash });
        return { txHash, verified: true, nullifierHex };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown presentCredential error';
        setState({ loading: false, error: msg, txHash: null });
        return { txHash: null, verified: false, error: msg };
      }
    },
    [requireContract],
  );

  const registerIssuer = useCallback(
    async (adminSecretKey: Uint8Array, issuerPublicKey: Uint8Array, attestationHash: Uint8Array) => {
      setState({ loading: true, error: null, txHash: null });
      try {
        requireContract();

        createAdminWitnesses({ adminSecretKey });

        if (issuerPublicKey.length !== 32 || attestationHash.length !== 32) {
          throw new Error('issuerPublicKey and attestationHash must each be 32 bytes.');
        }

        const txHash = randomHex(32);
        const local = readLocalState();
        const issuerHex = toHex(issuerPublicKey);
        const anchorHex = await sha256Hex(concatBytes(issuerPublicKey, attestationHash));

        if (!local.issuers.includes(issuerHex)) local.issuers.push(issuerHex);
        if (!local.trustAnchors.includes(anchorHex)) local.trustAnchors.push(anchorHex);
        writeLocalState(local);

        setState({ loading: false, error: null, txHash });
        return txHash;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown registerIssuer error';
        setState({ loading: false, error: msg, txHash: null });
        throw err;
      }
    },
    [requireContract],
  );

  const getLedgerState = useCallback(async () => {
    try {
      requireContract();
      const local = readLocalState();
      return {
        issuanceCount: BigInt(local.credentials.length),
        verificationCount: BigInt(local.presentations.length),
        issuerCount: BigInt(local.issuers.length),
      };
    } catch {
      return null;
    }
  }, [requireContract]);

  const verifyPresentationByTxHash = useCallback(async (txHash: string) => {
    const normalized = normalizeHex(txHash);
    const local = readLocalState();
    return local.presentations.find((p) => p.txHash === normalized) ?? null;
  }, []);

  return {
    ...state,
    issueCredential,
    presentCredential,
    registerIssuer,
    getLedgerState,
    verifyPresentationByTxHash,
  };
}
