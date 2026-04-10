'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@/hooks/useWallet';
import { useContract } from '@/hooks/useContract';
import { DegreeType } from '@/lib/witness';
import { mergeTestingSession, readTestingSession } from '@/lib/testingSession';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? '';

export default function StudentPage() {
  const wallet = useWallet();
  const contract = useContract(CONTRACT_ADDRESS, wallet.serviceUriConfig);
  const initialSession = readTestingSession();

  const [degreeType, setDegreeType] = useState(
    typeof initialSession.degreeType === 'number' ? initialSession.degreeType : DegreeType.BTech,
  );
  const [graduationYear, setGraduationYear] = useState(initialSession.graduationYear ?? 2024);
  const [institutionId, setInstitutionId] = useState(initialSession.institutionId ?? 1001);
  const [nonceHex, setNonceHex] = useState(initialSession.nonceHex ?? '');
  const [challengeHex, setChallengeHex] = useState(initialSession.challengeHex ?? '09'.repeat(32));

  const [txHash, setTxHash] = useState<string | null>(initialSession.proofTxHash ?? null);
  const [nullifierHex, setNullifierHex] = useState<string | null>(initialSession.nullifierHex ?? null);

  const studentSecretKey = useMemo(() => new Uint8Array(32).fill(2), []);

  const submitProof = async () => {
    const res = await contract.presentCredential(
      studentSecretKey,
      { degreeType, graduationYear, institutionId },
      nonceHex,
      challengeHex,
    );

    if (res.verified && res.txHash) {
      setTxHash(res.txHash);
      setNullifierHex(res.nullifierHex ?? null);
      mergeTestingSession({
        degreeType,
        graduationYear,
        institutionId,
        nonceHex,
        challengeHex,
        proofTxHash: res.txHash,
        nullifierHex: res.nullifierHex ?? undefined,
      });
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
              Verifier Challenge (32 bytes hex)
              <input
                value={challengeHex}
                onChange={(e) => setChallengeHex(e.target.value.trim())}
                className="field-control font-mono text-xs"
              />
            </label>

            <button
              onClick={submitProof}
              disabled={contract.loading || !nonceHex || !CONTRACT_ADDRESS}
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

            {txHash && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                <p className="font-semibold">Proof submitted</p>
                <p className="mt-2 break-all">
                  <span className="font-medium">Proof TX:</span> <code>{txHash}</code>
                </p>
                {nullifierHex && (
                  <p className="mt-1 break-all">
                    <span className="font-medium">Nullifier:</span> <code>{nullifierHex}</code>
                  </p>
                )}
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
