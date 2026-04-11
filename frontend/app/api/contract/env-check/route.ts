import { NextResponse } from 'next/server';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

export const runtime = 'nodejs';

type DeploymentConfig = {
  contractAddress?: string;
  network?: string;
};

function normalize(value: string | undefined): string {
  return (value ?? '').trim();
}

function normalizeHex(value: string | undefined): string {
  return normalize(value).toLowerCase().replace(/^0x/, '');
}

function parseEnvText(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }
  return out;
}

function compare(
  label: string,
  leftName: string,
  left: string,
  rightName: string,
  right: string,
  errors: string[],
  warnings: string[],
  mode: 'error' | 'warning' = 'error',
) {
  if (!left || !right) {
    return;
  }

  if (left !== right) {
    const message = `${label} mismatch: ${leftName}=${left} vs ${rightName}=${right}`;
    if (mode === 'error') {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }
}

export async function GET() {
  const errors: string[] = [];
  const warnings: string[] = [];

  const repoRoot = path.resolve(process.cwd(), '..');
  const envFilePath = path.join(repoRoot, 'frontend', '.env.local');
  const deploymentFilePath = path.join(repoRoot, 'deployment.json');

  let envValues: Record<string, string> = {};
  try {
    const envText = await readFile(envFilePath, 'utf8');
    envValues = parseEnvText(envText);
  } catch {
    errors.push('Unable to read frontend/.env.local');
  }

  let deployment: DeploymentConfig | null = null;
  try {
    const deploymentText = await readFile(deploymentFilePath, 'utf8');
    deployment = JSON.parse(deploymentText) as DeploymentConfig;
  } catch {
    warnings.push('deployment.json not found or unreadable; skipped deployment checks.');
  }

  const nextContract = normalizeHex(envValues.NEXT_PUBLIC_CONTRACT_ADDRESS);
  const viteContract = normalizeHex(envValues.VITE_CONTRACT_ADDRESS);
  const deploymentContract = normalizeHex(deployment?.contractAddress);

  if (!nextContract) {
    errors.push('NEXT_PUBLIC_CONTRACT_ADDRESS is missing.');
  }
  if (!viteContract) {
    warnings.push('VITE_CONTRACT_ADDRESS is missing.');
  }

  compare(
    'Contract address',
    'NEXT_PUBLIC_CONTRACT_ADDRESS',
    nextContract,
    'VITE_CONTRACT_ADDRESS',
    viteContract,
    errors,
    warnings,
    'error',
  );

  compare(
    'Contract address',
    'NEXT_PUBLIC_CONTRACT_ADDRESS',
    nextContract,
    'deployment.json.contractAddress',
    deploymentContract,
    errors,
    warnings,
    'error',
  );

  const nextNetwork = normalize(envValues.NEXT_PUBLIC_MIDNIGHT_NETWORK).toLowerCase();
  const rootNetwork = normalize(envValues.MIDNIGHT_NETWORK).toLowerCase();
  const deploymentNetwork = normalize(deployment?.network).toLowerCase();

  if (!nextNetwork) {
    errors.push('NEXT_PUBLIC_MIDNIGHT_NETWORK is missing.');
  }

  compare(
    'Network',
    'NEXT_PUBLIC_MIDNIGHT_NETWORK',
    nextNetwork,
    'MIDNIGHT_NETWORK',
    rootNetwork,
    errors,
    warnings,
    'warning',
  );

  compare(
    'Network',
    'NEXT_PUBLIC_MIDNIGHT_NETWORK',
    nextNetwork,
    'deployment.json.network',
    deploymentNetwork,
    errors,
    warnings,
    'warning',
  );

  compare(
    'Indexer HTTP',
    'NEXT_PUBLIC_MIDNIGHT_INDEXER_HTTP',
    normalize(envValues.NEXT_PUBLIC_MIDNIGHT_INDEXER_HTTP),
    'MIDNIGHT_INDEXER_HTTP',
    normalize(envValues.MIDNIGHT_INDEXER_HTTP),
    errors,
    warnings,
    'warning',
  );

  compare(
    'Indexer WS',
    'NEXT_PUBLIC_MIDNIGHT_INDEXER_WS',
    normalize(envValues.NEXT_PUBLIC_MIDNIGHT_INDEXER_WS),
    'MIDNIGHT_INDEXER_WS',
    normalize(envValues.MIDNIGHT_INDEXER_WS),
    errors,
    warnings,
    'warning',
  );

  compare(
    'Proof server',
    'NEXT_PUBLIC_MIDNIGHT_PROOF_SERVER',
    normalize(envValues.NEXT_PUBLIC_MIDNIGHT_PROOF_SERVER),
    'MIDNIGHT_PROOF_SERVER',
    normalize(envValues.MIDNIGHT_PROOF_SERVER),
    errors,
    warnings,
    'warning',
  );

  compare(
    'Node WS',
    'NEXT_PUBLIC_MIDNIGHT_NODE_WS',
    normalize(envValues.NEXT_PUBLIC_MIDNIGHT_NODE_WS),
    'MIDNIGHT_NODE_WS',
    normalize(envValues.MIDNIGHT_NODE_WS),
    errors,
    warnings,
    'warning',
  );

  if (!normalize(envValues.CREDZK_ADMIN_KEY)) {
    errors.push('CREDZK_ADMIN_KEY is missing.');
  }
  if (!normalize(envValues.CREDZK_AUTH_SECRET)) {
    warnings.push('CREDZK_AUTH_SECRET is missing.');
  }

  return NextResponse.json({
    ok: errors.length === 0,
    errors,
    warnings,
  });
}
