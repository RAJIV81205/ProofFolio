// ─────────────────────────────────────────────────────────────────────────────
// FILE 2: src/hooks/useContract.ts
// Wraps every contract circuit as a clean async function
// ─────────────────────────────────────────────────────────────────────────────
 
import { useState, useCallback } from 'react';
import type { ServiceUriConfig } from '@midnight-ntwrk/dapp-connector-api';
 
// This is the auto-generated file from `npm run compile`
// NEVER edit it manually — recompile if the contract changes
import { Contract } from '../../contracts/managed/credential_verifier/contract/index.cjs';
import {
  createAdminWitnesses,
  createIssuerWitnesses,
  createStudentWitnesses,
  packCredential,
  generateNonce,
  type CredentialData,
} from '../lib/witness';
 
export interface ContractState {
  loading:  boolean;
  error:    string | null;
  txHash:   string | null;
}
 
export function useContract(
  contractAddress:  string,
  serviceUriConfig: ServiceUriConfig | null,
) {
  const [state, setState] = useState<ContractState>({
    loading: false,
    error:   null,
    txHash:  null,
  });
 
  // Helper: builds a provider from the Lace wallet's service config
  // serviceUriConfig comes from wallet.getConfiguration() — it contains
  // the indexer, node, and proof server URLs the wallet is configured to use
  const getProvider = useCallback(async () => {
    if (!serviceUriConfig) throw new Error('Wallet not connected');
    const { MidnightProvider } = await import('@midnight-ntwrk/midnight-js-types');
    return MidnightProvider.fromServiceUriConfig(serviceUriConfig);
  }, [serviceUriConfig]);
 
  // ── Issue a credential (University portal) ──────────────────────────────
  const issueCredential = useCallback(async (
    issuerSecretKey: Uint8Array,
    data:            CredentialData,
  ) => {
    setState({ loading: true, error: null, txHash: null });
    try {
      const payload  = packCredential(data);
      const nonce    = generateNonce();
      const provider = await getProvider();
 
      const witnesses = createIssuerWitnesses({ issuerSecretKey });
      const contract  = new Contract(witnesses);
      const instance  = await contract.attach(provider, contractAddress);
      const tx        = await instance.callTx.issueCredential(payload, nonce);
 
      setState({ loading: false, error: null, txHash: tx.public.txHash });
 
      // Return commitment + nonce so the frontend can store them for the student
      return {
        txHash:        tx.public.txHash,
        commitmentHex: Buffer.from(tx.public.commitment ?? new Uint8Array(32)).toString('hex'),
        nonceHex:      Buffer.from(nonce).toString('hex'),
        payloadHex:    Buffer.from(payload).toString('hex'),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setState({ loading: false, error: msg, txHash: null });
      throw err;
    }
  }, [contractAddress, getProvider]);
 
  // ── Prove credential (Student portal) ───────────────────────────────────
  const proveCredential = useCallback(async (
    studentSecretKey: Uint8Array,
    data:             CredentialData,
    nonceHex:         string,
  ) => {
    setState({ loading: true, error: null, txHash: null });
    try {
      const payload  = packCredential(data);
      const nonce    = new Uint8Array(Buffer.from(nonceHex, 'hex'));
      const provider = await getProvider();
 
      const witnesses = createStudentWitnesses({
        studentSecretKey,
        credentialPayload: payload,
        credentialNonce:   nonce,
      });
      const contract  = new Contract(witnesses);
      const instance  = await contract.attach(provider, contractAddress);
      const tx        = await instance.callTx.proveCredential();
 
      setState({ loading: false, error: null, txHash: tx.public.txHash });
      return { txHash: tx.public.txHash, verified: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setState({ loading: false, error: msg, txHash: null });
      return { txHash: null, verified: false, error: msg };
    }
  }, [contractAddress, getProvider]);
 
  // ── Register issuer (Admin only) ─────────────────────────────────────────
  const registerIssuer = useCallback(async (
    adminSecretKey:  Uint8Array,
    issuerPublicKey: Uint8Array,
  ) => {
    setState({ loading: true, error: null, txHash: null });
    try {
      const provider  = await getProvider();
      const witnesses = createAdminWitnesses({ adminSecretKey });
      const contract  = new Contract(witnesses);
      const instance  = await contract.attach(provider, contractAddress);
      const tx        = await instance.callTx.registerIssuer(issuerPublicKey);
 
      setState({ loading: false, error: null, txHash: tx.public.txHash });
      return tx.public.txHash;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setState({ loading: false, error: msg, txHash: null });
      throw err;
    }
  }, [contractAddress, getProvider]);
 
  // ── Read ledger state (no wallet needed) ─────────────────────────────────
  const getLedgerState = useCallback(async () => {
    try {
      const provider  = await getProvider();
      const witnesses = createAdminWitnesses({ adminSecretKey: new Uint8Array(32) });
      const contract  = new Contract(witnesses);
      const instance  = await contract.attach(provider, contractAddress);
      return await instance.queryContractState();
    } catch {
      return null;
    }
  }, [contractAddress, getProvider]);
 
  return {
    ...state,
    issueCredential,
    proveCredential,
    registerIssuer,
    getLedgerState,
  };
}
 