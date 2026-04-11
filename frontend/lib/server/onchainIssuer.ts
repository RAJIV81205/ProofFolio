import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';

const DEFAULT_PRIVATE_STATE_ID = 'credzk-api-private-state-preprod';

function normalizeHex(value: string): string {
  return value.trim().toLowerCase().replace(/^0x/, '');
}

function assertHex32(label: string, value: string): string {
  const normalized = normalizeHex(value);
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`${label} must be exactly 64 hex characters.`);
  }
  return normalized;
}

function buildAttestationHashHex(input: {
  applicationId: string;
  institutionName: string;
  accreditationId: string;
  walletAddress: string;
  issuerPublicKeyHex: string;
}): string {
  const digest = createHash('sha256')
    .update('credzk:issuer-attestation:v1|', 'utf8')
    .update(input.applicationId, 'utf8')
    .update('|', 'utf8')
    .update(input.institutionName.trim(), 'utf8')
    .update('|', 'utf8')
    .update(input.accreditationId.trim(), 'utf8')
    .update('|', 'utf8')
    .update(input.walletAddress.trim().toLowerCase(), 'utf8')
    .update('|', 'utf8')
    .update(input.issuerPublicKeyHex, 'utf8')
    .digest('hex');

  return digest;
}

function resolveContractAddress(): string {
  const value = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? '';
  return assertHex32('NEXT_PUBLIC_CONTRACT_ADDRESS', value);
}

export interface OnChainIssuerRegistrationResult {
  issuerPublicKeyHex: string;
  attestationHashHex: string;
  txHash: string | null;
  alreadyAuthorized: boolean;
}

export async function registerIssuerPublicKeyOnChain(input: {
  issuerPublicKeyHex: string;
  applicationId: string;
  institutionName: string;
  accreditationId: string;
  walletAddress: string;
}): Promise<OnChainIssuerRegistrationResult> {
  const issuerPublicKeyHex = assertHex32('issuerPublicKeyHex', input.issuerPublicKeyHex);

  const contractAddress = resolveContractAddress();
  const privateStateId =
    process.env.CREDZK_API_PRIVATE_STATE_ID?.trim() || DEFAULT_PRIVATE_STATE_ID;

  const attestationHashHex = buildAttestationHashHex({
    applicationId: input.applicationId,
    institutionName: input.institutionName,
    accreditationId: input.accreditationId,
    walletAddress: input.walletAddress,
    issuerPublicKeyHex,
  });

  const cwd = process.cwd();
  const repoRoot = existsSync(path.join(cwd, 'scripts', 'register-issuer-public.mjs'))
    ? cwd
    : path.resolve(cwd, '..');
  const scriptPath = path.join(repoRoot, 'scripts', 'register-issuer-public.mjs');

  const args = [
    scriptPath,
    '--issuer-public-key',
    issuerPublicKeyHex,
    '--attestation-hash',
    attestationHashHex,
    '--contract-address',
    contractAddress,
    '--private-state-id',
    privateStateId,
  ];

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            [
              'On-chain registerIssuer process failed.',
              stderr.trim() || stdout.trim() || `exit code ${String(code)}`,
            ]
              .filter(Boolean)
              .join(' '),
          ),
        );
        return;
      }
      resolve(stdout);
    });
  });

  const line = output
    .split(/\r?\n/)
    .find((item) => item.startsWith('REGISTER_ISSUER_PUBLIC_RESULT='));

  if (!line) {
    throw new Error('On-chain registerIssuer completed but no result payload was returned.');
  }

  const payload = JSON.parse(
    line.slice('REGISTER_ISSUER_PUBLIC_RESULT='.length),
  ) as OnChainIssuerRegistrationResult;

  return {
    issuerPublicKeyHex: assertHex32('issuerPublicKeyHex', payload.issuerPublicKeyHex),
    attestationHashHex: assertHex32('attestationHashHex', payload.attestationHashHex),
    txHash: payload.txHash,
    alreadyAuthorized: Boolean(payload.alreadyAuthorized),
  };
}
