'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@/hooks/useWallet';
import { useContract } from '@/hooks/useContract';
import { DegreeType } from '@/lib/witness';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? '';

function randomHex32(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function parseHex32(value: string, label: string): Uint8Array {
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`${label} must be 64 hex chars (32 bytes).`);
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export default function StudentPage() {
  const wallet = useWallet();
  const contract = useContract(
    CONTRACT_ADDRESS,
    wallet.serviceUriConfig,
    wallet.connectedApi,
    wallet.walletAddress,
  );
  const currentYear = new Date().getFullYear();

  const [degreeType, setDegreeType] = useState(DegreeType.BTech);
  const [graduationYear, setGraduationYear] = useState(currentYear);
  const [institutionId, setInstitutionId] = useState(1);
  const [nonceHex, setNonceHex] = useState('');
  const [credentialPackage, setCredentialPackage] = useState('');
  const [challengeHex, setChallengeHex] = useState(randomHex32());
  const [studentSecretKeyHex, setStudentSecretKeyHex] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const submitProof = async () => {
    setPageError(null);
    try {
      const studentSecretKey = parseHex32(studentSecretKeyHex, 'Student secret key');
      const res = await contract.presentCredential(
        studentSecretKey,
        { degreeType, graduationYear, institutionId },
        nonceHex,
        challengeHex,
      );

      if (res.verified && res.txHash) {
        setTxHash(res.txHash);
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to submit presentation proof.');
    }
  };

  const importPackage = () => {
    setPageError(null);
    try {
      const parsed = JSON.parse(credentialPackage) as {
        degreeType?: number;
        graduationYear?: number;
        institutionId?: number;
        nonceHex?: string;
      };

      if (typeof parsed.degreeType !== 'number') throw new Error('Package missing degreeType.');
      if (typeof parsed.graduationYear !== 'number') throw new Error('Package missing graduationYear.');
      if (typeof parsed.institutionId !== 'number') throw new Error('Package missing institutionId.');
      if (typeof parsed.nonceHex !== 'string') throw new Error('Package missing nonceHex.');

      setDegreeType(parsed.degreeType);
      setGraduationYear(parsed.graduationYear);
      setInstitutionId(parsed.institutionId);
      setNonceHex(parsed.nonceHex.trim());
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Invalid credential package JSON.');
    }
  };

  return (
    <main className="app-shell">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="pill">Student Portal</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Generate ZK Presentation Proof</h1>
          <p className="mt-1 text-sm text-slate-600">Share proof integrity, not personal records.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="btn-ghost text-sm">
            ← Back
          </Link>
        </div>
      </div>

      <div className="glass-card p-6 md:p-7">
        {!wallet.isConnected ? (
          <div>
            <p className="text-slate-700">Connect your wallet to generate a privacy-preserving proof.</p>
            <button
              onClick={wallet.connect}
              disabled={wallet.connecting}
              className="btn-primary mt-4"
            >
              {wallet.connecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
            {wallet.error && <p className="mt-3 text-sm text-rose-700">{wallet.error}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white/80 p-3 text-sm">
              <p className="text-slate-600">Connected wallet</p>
              <p className="mt-1 break-all font-medium text-slate-900">{wallet.walletAddress}</p>
            </div>

            <label className="field-label">
              Degree Type
              <select
                value={degreeType}
                onChange={(e) => setDegreeType(Number(e.target.value))}
                className="field-control"
              >
                <option value={DegreeType.BTech}>B.Tech</option>
                <option value={DegreeType.MTech}>M.Tech</option>
                <option value={DegreeType.PhD}>PhD</option>
                <option value={DegreeType.MBA}>MBA</option>
              </select>
            </label>

            <label className="field-label">
              Graduation Year
              <input
                type="number"
                min={1990}
                max={2100}
                value={graduationYear}
                onChange={(e) => setGraduationYear(Number(e.target.value))}
                className="field-control"
              />
            </label>

            <label className="field-label">
              Institution ID
              <input
                type="number"
                min={1}
                value={institutionId}
                onChange={(e) => setInstitutionId(Number(e.target.value))}
                className="field-control"
              />
            </label>

            <label className="field-label">
              Credential Nonce (hex from university)
              <input
                value={nonceHex}
                onChange={(e) => setNonceHex(e.target.value.trim())}
                className="field-control font-mono text-xs"
                placeholder="64-char hex"
              />
            </label>

            <label className="field-label">
              Credential Package JSON (from university panel)
              <textarea
                value={credentialPackage}
                onChange={(e) => setCredentialPackage(e.target.value)}
                className="field-control min-h-24 font-mono text-xs"
                placeholder='{"degreeType":0,"graduationYear":2026,"institutionId":1,"nonceHex":"..."}'
                spellCheck={false}
              />
              <button type="button" className="btn-ghost mt-2" onClick={importPackage}>
                Import Package
              </button>
            </label>

            <label className="field-label">
              Student Secret Key (hex, 32 bytes)
              <input
                type="password"
                value={studentSecretKeyHex}
                onChange={(e) => setStudentSecretKeyHex(e.target.value.trim())}
                className="field-control font-mono text-xs"
                placeholder="64-char hex"
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            <label className="field-label">
              Verifier Challenge (32 bytes hex)
              <input
                value={challengeHex}
                onChange={(e) => setChallengeHex(e.target.value.trim())}
                className="field-control font-mono text-xs"
              />
            </label>
            <button type="button" className="btn-ghost" onClick={() => setChallengeHex(randomHex32())}>
              Generate New Challenge
            </button>

            <button
              onClick={submitProof}
              disabled={contract.loading || !nonceHex || !studentSecretKeyHex || !CONTRACT_ADDRESS}
              className="btn-primary"
            >
              {contract.loading ? 'Generating proof...' : 'Generate & Submit Proof'}
            </button>

            {!CONTRACT_ADDRESS && (
              <p className="text-sm text-rose-700">
                Missing NEXT_PUBLIC_CONTRACT_ADDRESS in frontend/.env.local
              </p>
            )}

            {contract.error && <p className="text-sm text-rose-700">Error: {contract.error}</p>}
            {pageError && <p className="text-sm text-rose-700">Error: {pageError}</p>}

            {txHash && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                <p className="font-semibold">Proof submitted</p>
                <p className="mt-2 break-all">
                  <span className="font-medium">Proof TX:</span> <code>{txHash}</code>
                </p>
                <p className="mt-2 text-xs">Share TX hash with employer for verification.</p>
                <p className="mt-2 text-xs font-medium text-emerald-800">
                  Next step: open Employer Portal and submit this proof transaction hash.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
