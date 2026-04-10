'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@/hooks/useWallet';
import { useContract } from '@/hooks/useContract';
import { DegreeType } from '@/lib/witness';
import { mergeTestingSession, readTestingSession } from '@/lib/testingSession';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? '';

const degreeOptions = [
  { value: DegreeType.BTech, label: 'B.Tech' },
  { value: DegreeType.MTech, label: 'M.Tech' },
  { value: DegreeType.PhD, label: 'PhD' },
  { value: DegreeType.MBA, label: 'MBA' },
  { value: DegreeType.BSc, label: 'B.Sc' },
  { value: DegreeType.MSc, label: 'M.Sc' },
];

export default function UniversityClient({ adminUsername }: { adminUsername: string }) {
  const wallet = useWallet();
  const contract = useContract(CONTRACT_ADDRESS, wallet.serviceUriConfig);
  const initialSession = readTestingSession();

  const [studentId, setStudentId] = useState(initialSession.studentId ?? '');
  const [degreeType, setDegreeType] = useState(
    typeof initialSession.degreeType === 'number' ? initialSession.degreeType : DegreeType.BTech,
  );
  const [graduationYear, setGraduationYear] = useState(initialSession.graduationYear ?? 2024);
  const [institutionId, setInstitutionId] = useState(initialSession.institutionId ?? 1001);

  const [issuerAuthorized, setIssuerAuthorized] = useState(false);
  const [issuerCheckLoading, setIssuerCheckLoading] = useState(false);
  const [issuerStatusMessage, setIssuerStatusMessage] = useState<string | null>(null);

  const [result, setResult] = useState<{
    txHash: string;
    commitmentHex: string;
    nonceHex: string;
  } | null>(null);

  const issuerSecretKey = useMemo(() => new Uint8Array(32).fill(1), []);

  useEffect(() => {
    const checkIssuer = async () => {
      if (!wallet.isConnected || !wallet.walletAddress) {
        setIssuerAuthorized(false);
        setIssuerStatusMessage(null);
        return;
      }

      setIssuerCheckLoading(true);
      setIssuerStatusMessage(null);
      try {
        const res = await fetch(
          `/api/admin/issuers/authorized?wallet=${encodeURIComponent(wallet.walletAddress)}`,
          { method: 'GET', cache: 'no-store' },
        );
        const payload = (await res.json()) as { authorized?: boolean; error?: string };

        if (!res.ok) {
          throw new Error(payload.error ?? 'Unable to validate issuer wallet');
        }

        setIssuerAuthorized(Boolean(payload.authorized));
        if (!payload.authorized) {
          setIssuerStatusMessage(
            'This wallet is not approved by admin. Add it in the Admin Panel to enable issuance.',
          );
        }
      } catch (err) {
        setIssuerAuthorized(false);
        setIssuerStatusMessage(err instanceof Error ? err.message : 'Unable to validate wallet authorization.');
      } finally {
        setIssuerCheckLoading(false);
      }
    };

    checkIssuer();
  }, [wallet.isConnected, wallet.walletAddress]);

  const issue = async () => {
    if (!wallet.walletAddress || !issuerAuthorized) return;

    const res = await contract.issueCredential(issuerSecretKey, {
      degreeType,
      graduationYear,
      institutionId,
    });

    setResult({
      txHash: res.txHash,
      commitmentHex: res.commitmentHex,
      nonceHex: res.nonceHex,
    });

    mergeTestingSession({
      studentId,
      degreeType,
      graduationYear,
      institutionId,
      nonceHex: res.nonceHex,
      commitmentHex: res.commitmentHex,
      issueTxHash: res.txHash,
    });

    await fetch('/api/admin/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'issue_credential',
        walletAddress: wallet.walletAddress,
        metadata: {
          degreeType,
          graduationYear,
          institutionId,
          txHash: res.txHash,
          commitmentHex: res.commitmentHex,
        },
      }),
    });
  };

  return (
    <main className="app-shell">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="pill">University Issuer Portal</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Private Credential Issuance</h1>
          <p className="mt-1 text-sm text-slate-600">Protected by admin session for {adminUsername}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin" className="btn-ghost text-sm">
            Admin Panel
          </Link>
          <Link href="/" className="btn-ghost text-sm">
            ← Back
          </Link>
        </div>
      </div>

      <div className="glass-card p-6 md:p-7">
        {!wallet.isConnected ? (
          <div>
            <p className="text-slate-700">Connect your approved issuer wallet to continue.</p>
            <button onClick={wallet.connect} disabled={wallet.connecting} className="btn-primary mt-4">
              {wallet.connecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
            {wallet.error && <p className="mt-3 text-sm text-rose-700">{wallet.error}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white/80 p-3 text-sm">
              <p className="text-slate-600">Connected wallet</p>
              <p className="mt-1 break-all font-medium text-slate-900">{wallet.walletAddress}</p>
              {issuerCheckLoading ? (
                <p className="mt-2 text-xs text-slate-600">Checking issuer allowlist...</p>
              ) : issuerAuthorized ? (
                <p className="mt-2 text-xs font-semibold text-emerald-700">Wallet is admin-approved for issuance.</p>
              ) : (
                <p className="mt-2 text-xs font-semibold text-rose-700">{issuerStatusMessage ?? 'Wallet not authorized.'}</p>
              )}
            </div>

            <label className="field-label">
              Student ID
              <input
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="field-control"
                placeholder="e.g. STU-2026-001"
              />
            </label>

            <label className="field-label">
              Degree Type
              <select
                value={degreeType}
                onChange={(e) => setDegreeType(Number(e.target.value))}
                className="field-control"
              >
                {degreeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
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
            </div>

            <button
              onClick={issue}
              disabled={contract.loading || !studentId || !CONTRACT_ADDRESS || !issuerAuthorized}
              className="btn-primary"
            >
              {contract.loading ? 'Issuing...' : 'Issue Credential'}
            </button>

            {!CONTRACT_ADDRESS && (
              <p className="text-sm text-rose-700">
                Missing `NEXT_PUBLIC_CONTRACT_ADDRESS` in `frontend/.env.local`.
              </p>
            )}

            {contract.error && <p className="text-sm text-rose-700">Error: {contract.error}</p>}

            {result && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                <p className="font-semibold">Credential issued successfully</p>
                <p className="mt-2 break-all">
                  <span className="font-semibold">Commitment:</span> <code>{result.commitmentHex}</code>
                </p>
                <p className="mt-1 break-all">
                  <span className="font-semibold">Nonce:</span> <code>{result.nonceHex}</code>
                </p>
                <p className="mt-1 break-all">
                  <span className="font-semibold">Issue TX:</span> <code>{result.txHash}</code>
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
