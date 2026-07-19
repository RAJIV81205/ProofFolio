'use client';

import { sampleSigningKey } from '@midnight-ntwrk/compact-runtime';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import {
  createUnprovenDeployTx,
  submitTxAsync,
} from '@midnight-ntwrk/midnight-js-contracts';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';

import {
  createEmptyPrivateState,
  type ProofFolioPrivateState,
} from '@/lib/witness';
import type { WalletServiceUriConfig } from '@/hooks/useWallet';
import { build1amProviders } from '@/hooks/useContract';

// @ts-ignore generated contract bundle has its own declaration file.
import { Contract } from '@/contracts/managed/credential_verifier/contract/index.js';

const CONTRACT_NAME = 'credential_verifier';
const PRIVATE_STATE_ID = 'ProofFolio-browser-deploy';
const ARTIFACTS_PATH = '/api/contract/artifacts';

function emptyBytes32(): Uint8Array {
  return new Uint8Array(32);
}

function createDeploymentWitnesses(adminSecretKey: Uint8Array) {
  const witness = (ctx: any, value: Uint8Array) => [ctx.privateState, value];
  return {
    adminSecretKey: (ctx: any) => witness(ctx, adminSecretKey),
    issuerSecretKey: (ctx: any) => witness(ctx, emptyBytes32()),
    studentSecretKey: (ctx: any) => witness(ctx, emptyBytes32()),
    credentialPayload: (ctx: any) => witness(ctx, emptyBytes32()),
    credentialNonce: (ctx: any) => witness(ctx, emptyBytes32()),
    credentialIssuerPk: (ctx: any) => witness(ctx, emptyBytes32()),
    findCredentialPath: () => {
      throw new Error('findCredentialPath is unavailable during deployment.');
    },
  };
}

function parseSecretKey(value: string): Uint8Array {
  const normalized = value.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error('Admin secret key must be exactly 64 hex characters.');
  }
  return Uint8Array.from(normalized.match(/.{2}/g)!, (byte) => parseInt(byte, 16));
}

function createBrowserPrivateStateProvider() {
  let scope = '';
  const states = new Map<string, unknown>();
  const signingKeys = new Map<string, unknown>();
  const scoped = (id: string) => `${scope}:${id}`;
  return {
    setContractAddress(address: string) { scope = address; },
    async set(id: string, state: unknown) { states.set(scoped(id), state); },
    async get(id: string) { return states.get(scoped(id)) ?? null; },
    async setSigningKey(address: string, key: unknown) { signingKeys.set(address, key); },
    async getSigningKey(address: string) { return signingKeys.get(address) ?? null; },
  };
}

export async function deployCredentialVerifier(
  connectedApi: ConnectedAPI,
  serviceUriConfig: WalletServiceUriConfig | null,
  adminSecretKeyHex: string,
): Promise<{ contractAddress: string; transactionId: string }> {
  const adminSecretKey = parseSecretKey(adminSecretKeyHex);
  const providers = await build1amProviders(connectedApi, serviceUriConfig);
  const privateStateProvider = createBrowserPrivateStateProvider();
  const compiledContract = CompiledContract.make(CONTRACT_NAME, Contract).pipe(
    CompiledContract.withWitnesses(createDeploymentWitnesses(adminSecretKey)),
    CompiledContract.withCompiledFileAssets(ARTIFACTS_PATH),
  );
  const initialPrivateState: ProofFolioPrivateState = {
    ...createEmptyPrivateState(),
    adminSecretKey,
  };

  const signingKey = sampleSigningKey();
  const deployTxData = await (createUnprovenDeployTx as any)(
    {
      zkConfigProvider: providers.zkConfigProvider,
      walletProvider: providers.walletProvider,
    },
    {
      compiledContract,
      args: [],
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState,
      signingKey,
    },
  );

  const transactionId = await (submitTxAsync as any)(providers, {
    unprovenTx: deployTxData.private.unprovenTx,
  });
  await privateStateProvider.setContractAddress(String(deployTxData.public.contractAddress));
  await privateStateProvider.set(PRIVATE_STATE_ID, deployTxData.private.initialPrivateState);
  await privateStateProvider.setSigningKey(String(deployTxData.public.contractAddress), deployTxData.private.signingKey ?? signingKey);

  return {
    contractAddress: String(deployTxData.public.contractAddress),
    transactionId: String(transactionId),
  };
}
