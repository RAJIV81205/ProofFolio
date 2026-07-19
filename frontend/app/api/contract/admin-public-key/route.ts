import { NextResponse } from 'next/server';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
// @ts-ignore
import { Contract } from '../../../../contracts/managed/credential_verifier/contract/index.js';

export const runtime = 'nodejs';

type DeploymentConfig = {
  contractAddress?: string;
  adminKeyHex?: string;
};

type WitnessContext = { privateState: unknown };

function normalizeHex(value: string): string {
  return value.trim().toLowerCase().replace(/^0x/, '');
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function toBytes32(hex: string): Uint8Array {
  const normalized = normalizeHex(hex);
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('Expected 32-byte hex value.');
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function loadDeploymentConfig(repoRoot: string): Promise<DeploymentConfig | null> {
  try {
    const deploymentFile = path.join(repoRoot, 'deployment.json');
    const raw = await readFile(deploymentFile, 'utf8');
    const parsed = JSON.parse(raw) as DeploymentConfig;
    return parsed;
  } catch {
    return null;
  }
}

function deriveAdminPublicKeyHex(adminSecretKeyHex: string): string {
  const zero = new Uint8Array(32);
  const contract = new Contract({
    adminSecretKey: (ctx: WitnessContext) => [ctx.privateState, zero],
    issuerSecretKey: (ctx: WitnessContext) => [ctx.privateState, zero],
    studentSecretKey: (ctx: WitnessContext) => [ctx.privateState, zero],
    credentialPayload: (ctx: WitnessContext) => [ctx.privateState, zero],
    credentialNonce: (ctx: WitnessContext) => [ctx.privateState, zero],
    credentialIssuerPk: (ctx: WitnessContext) => [ctx.privateState, zero],
    findCredentialPath: (ctx: WitnessContext) => [ctx.privateState, { leaf: zero, path: [] }],
  });

  const helper = contract as unknown as { _adminPublicKey_0: (secretKey: Uint8Array) => Uint8Array };
  return toHex(helper._adminPublicKey_0(toBytes32(adminSecretKeyHex)));
}

export async function GET(request: Request) {
  const repoRoot = path.resolve(process.cwd(), '..');
  const requestUrl = new URL(request.url);
  const requestedContractAddress = normalizeHex(requestUrl.searchParams.get('contractAddress') ?? '');

  const deployment = await loadDeploymentConfig(repoRoot);
  const deploymentContractAddress = normalizeHex(deployment?.contractAddress ?? '');

  let source = '';
  let adminSecretKeyHex = '';

  if (deployment?.adminKeyHex) {
    if (
      requestedContractAddress &&
      /^[0-9a-f]{64}$/.test(deploymentContractAddress) &&
      deploymentContractAddress !== requestedContractAddress
    ) {
      return NextResponse.json(
        { error: 'Deployment contract mismatch for requested address.' },
        { status: 409 },
      );
    }

    adminSecretKeyHex = deployment.adminKeyHex;
    source = 'deployment.json';
  } else if (process.env.PROOFFOLIO_ADMIN_KEY) {
    adminSecretKeyHex = process.env.PROOFFOLIO_ADMIN_KEY;
    source = 'server-env';
  }

  if (!adminSecretKeyHex) {
    return NextResponse.json({ error: 'No admin key source found.' }, { status: 404 });
  }

  try {
    const adminPublicKeyHex = deriveAdminPublicKeyHex(adminSecretKeyHex);
    return NextResponse.json({ adminPublicKeyHex, source });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to derive admin public key.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
