'use client';

export interface TestingSessionData {
  studentId?: string;
  degreeType?: number;
  graduationYear?: number;
  institutionId?: number;
  nonceHex?: string;
  commitmentHex?: string;
  issueTxHash?: string;
  challengeHex?: string;
  proofTxHash?: string;
  nullifierHex?: string;
  verificationMessage?: string;
  updatedAt?: string;
}

const SESSION_KEY = 'credzk:v1:testing-session';

export function readTestingSession(): TestingSessionData {
  if (typeof window === 'undefined') return {};
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as TestingSessionData;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export function mergeTestingSession(patch: TestingSessionData): TestingSessionData {
  if (typeof window === 'undefined') return patch;
  const next = {
    ...readTestingSession(),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  return next;
}

export function clearTestingSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SESSION_KEY);
}
