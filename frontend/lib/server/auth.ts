import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const ADMIN_SESSION_COOKIE = 'ProofFolio_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;

interface AdminSessionPayload {
  username: string;
  exp: number;
  iat: number;
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function decodeBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('Missing or weak ADMIN_SESSION_SECRET. Use a random value of at least 32 chars.');
  }
  return secret;
}

function signPayload(payloadB64: string): string {
  return createHmac('sha256', getSessionSecret()).update(payloadB64).digest('base64url');
}

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export function getAdminUsername(): string {
  return process.env.ADMIN_USERNAME ?? 'admin';
}

export function getAdminSessionTtlSeconds(): number {
  return SESSION_TTL_SECONDS;
}

export function verifyAdminCredentials(username: string, password: string): boolean {
  const expectedUsername = getAdminUsername();
  const configuredHash = (process.env.ADMIN_PASSWORD_SHA256 ?? '').trim().toLowerCase();

  if (!configuredHash) {
    return false;
  }

  if (username !== expectedUsername) {
    return false;
  }

  const candidateHash = hashPassword(password);
  const expectedBuf = Buffer.from(configuredHash, 'hex');
  const candidateBuf = Buffer.from(candidateHash, 'hex');

  if (expectedBuf.length !== candidateBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, candidateBuf);
}

export function createAdminSessionToken(username: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    username,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };

  const payloadB64 = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(payloadB64);
  return `${payloadB64}.${signature}`;
}

export function verifyAdminSessionToken(token: string): AdminSessionPayload | null {
  if (!token || !token.includes('.')) return null;

  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) return null;

  const expectedSig = signPayload(payloadB64);
  const expectedBuf = Buffer.from(expectedSig);
  const actualBuf = Buffer.from(signature);

  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(payloadB64)) as AdminSessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!parsed.username || parsed.exp <= now) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getAdminSessionFromServerCookies() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyAdminSessionToken(token);
}
