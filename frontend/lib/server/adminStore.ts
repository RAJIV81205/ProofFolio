import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface AdminAuditLog {
  id: string;
  action: 'allow_issuer' | 'remove_issuer' | 'issue_credential';
  walletAddress: string;
  actor: string;
  createdAt: string;
  metadata?: {
    degreeType?: number;
    graduationYear?: number;
    institutionId?: number;
    txHash?: string;
    commitmentHex?: string;
  };
}

interface AdminStore {
  allowedIssuers: string[];
  auditLogs: AdminAuditLog[];
}

const STORE_DIR = path.join(process.cwd(), '.data');
const STORE_FILE = path.join(STORE_DIR, 'admin-store.json');

const emptyStore: AdminStore = {
  allowedIssuers: [],
  auditLogs: [],
};

function normalizeWalletAddress(value: string): string {
  return value.trim().toLowerCase();
}

function isWalletAddressLikelyValid(value: string): boolean {
  if (value.length < 20 || value.length > 180) return false;
  return /^[a-z0-9:_-]+$/i.test(value);
}

async function ensureStoreFile() {
  await mkdir(STORE_DIR, { recursive: true });
  try {
    await readFile(STORE_FILE, 'utf8');
  } catch {
    await writeFile(STORE_FILE, JSON.stringify(emptyStore, null, 2), 'utf8');
  }
}

async function readStore(): Promise<AdminStore> {
  await ensureStoreFile();
  try {
    const raw = await readFile(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AdminStore>;
    return {
      allowedIssuers: parsed.allowedIssuers ?? [],
      auditLogs: parsed.auditLogs ?? [],
    };
  } catch {
    return emptyStore;
  }
}

async function writeStore(state: AdminStore) {
  await ensureStoreFile();
  await writeFile(STORE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export async function listAllowedIssuers() {
  const store = await readStore();
  return [...store.allowedIssuers];
}

export async function isIssuerAllowed(walletAddress: string): Promise<boolean> {
  const normalized = normalizeWalletAddress(walletAddress);
  const store = await readStore();
  return store.allowedIssuers.includes(normalized);
}

export async function addAllowedIssuer(walletAddress: string, actor: string) {
  const normalized = normalizeWalletAddress(walletAddress);
  if (!isWalletAddressLikelyValid(normalized)) {
    throw new Error('Invalid wallet address format.');
  }

  const store = await readStore();
  if (!store.allowedIssuers.includes(normalized)) {
    store.allowedIssuers.push(normalized);
    store.auditLogs.unshift({
      id: randomUUID(),
      action: 'allow_issuer',
      walletAddress: normalized,
      actor,
      createdAt: new Date().toISOString(),
    });
    store.auditLogs = store.auditLogs.slice(0, 200);
    await writeStore(store);
  }

  return store.allowedIssuers;
}

export async function removeAllowedIssuer(walletAddress: string, actor: string) {
  const normalized = normalizeWalletAddress(walletAddress);
  const store = await readStore();

  if (store.allowedIssuers.includes(normalized)) {
    store.allowedIssuers = store.allowedIssuers.filter((issuer) => issuer !== normalized);
    store.auditLogs.unshift({
      id: randomUUID(),
      action: 'remove_issuer',
      walletAddress: normalized,
      actor,
      createdAt: new Date().toISOString(),
    });
    store.auditLogs = store.auditLogs.slice(0, 200);
    await writeStore(store);
  }

  return store.allowedIssuers;
}

export async function appendAuditLog(entry: Omit<AdminAuditLog, 'id' | 'createdAt'>) {
  const store = await readStore();
  store.auditLogs.unshift({
    ...entry,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  });
  store.auditLogs = store.auditLogs.slice(0, 200);
  await writeStore(store);
}

export async function listAuditLogs() {
  const store = await readStore();
  return [...store.auditLogs];
}
