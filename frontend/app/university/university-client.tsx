'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@/hooks/useWallet';
import { useContract } from '@/hooks/useContract';
import { DegreeType } from '@/lib/witness';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? '';

const degreeOptions = [
  { value: DegreeType.BTech, label: 'B.Tech' },
  { value: DegreeType.MTech, label: 'M.Tech' },
  { value: DegreeType.PhD, label: 'PhD' },
  { value: DegreeType.MBA, label: 'MBA' },
  { value: DegreeType.BSc, label: 'B.Sc' },
  { value: DegreeType.MSc, label: 'M.Sc' },
];

function parseHex32(value: string): Uint8Array {
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('Issuer secret key must be 64 hex chars (32 bytes).');
  }

  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export default function UniversityClient() {
  const wallet = useWallet();
  const contract = useContract(
    CONTRACT_ADDRESS,
    wallet.serviceUriConfig,
    wallet.connectedApi,
    wallet.walletAddress,
  );
  const { deriveIssuerPublicKeyHex, isAuthorizedIssuer } = contract;
  const currentYear = new Date().getFullYear();

  const [studentId, setStudentId] = useState('');
  const [degreeType, setDegreeType] = useState(DegreeType.BTech);
  const [graduationYear, setGraduationYear] = useState(currentYear);
  const [institutionId, setInstitutionId] = useState(1);

  const [issuerAuthorized, setIssuerAuthorized] = useState(false);
  const [issuerCheckLoading, setIssuerCheckLoading] = useState(false);
  const [issuerStatusMessage, setIssuerStatusMessage] = useState<string | null>(null);
  const [issuerSecretKeyHex, setIssuerSecretKeyHex] = useState('');
  const [issuerPublicKeyHex, setIssuerPublicKeyHex] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [result, setResult] = useState<{
    txHash: string;
    nonceHex: string;
    degreeType: number;
    graduationYear: number;
    institutionId: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkIssuerOnChain = async () => {
      if (!wallet.isConnected) {
        setIssuerAuthorized(false);
        setIssuerPublicKeyHex(null);
        setIssuerStatusMessage('Connect wallet to run on-chain issuer checks.');
        return;
      }

      const normalizedKey = issuerSecretKeyHex.trim();
      if (!normalizedKey) {
        setIssuerAuthorized(false);
        setIssuerPublicKeyHex(null);
        setIssuerStatusMessage('Enter issuer secret key to verify authorization on Midnight.');
        return;
      }

      setIssuerCheckLoading(true);
      setIssuerStatusMessage('Verifying issuer authorization on Midnight...');

      try {
        const derivedIssuerPublicKeyHex = deriveIssuerPublicKeyHex(normalizedKey);
        const authorized = await isAuthorizedIssuer(derivedIssuerPublicKeyHex);
        if (cancelled) return;

        setIssuerPublicKeyHex(derivedIssuerPublicKeyHex);
        setIssuerAuthorized(authorized);
        setIssuerStatusMessage(
          authorized
            ? 'Issuer key is authorized on Midnight and can issue credentials.'
            : 'Issuer key is not authorized on Midnight. Admin must call registerIssuer first.',
        );
      } catch (error) {
        if (cancelled) return;
        setIssuerAuthorized(false);
        setIssuerPublicKeyHex(null);
        setIssuerStatusMessage(
          error instanceof Error ? error.message : 'Unable to verify issuer authorization on-chain.',
        );
      } finally {
        if (!cancelled) {
          setIssuerCheckLoading(false);
        }
      }
    };

    checkIssuerOnChain();
    return () => {
      cancelled = true;
    };
  }, [deriveIssuerPublicKeyHex, isAuthorizedIssuer, issuerSecretKeyHex, wallet.isConnected]);

  const issue = async () => {
    if (!wallet.walletAddress || !issuerAuthorized) return;

    setActionError(null);
    try {
      const issuerSecretKey = parseHex32(issuerSecretKeyHex);
      const derivedIssuerPk = deriveIssuerPublicKeyHex(issuerSecretKey);
      const stillAuthorized = await isAuthorizedIssuer(derivedIssuerPk);

      if (!stillAuthorized) {
        throw new Error('Issuer authorization is not active on Midnight. Registration is required before issuance.');
      }

      const res = await contract.issueCredential(issuerSecretKey, {
        degreeType,
        graduationYear,
        institutionId,
      });

      setResult({
        txHash: res.txHash,
        nonceHex: res.nonceHex,
        degreeType,
        graduationYear,
        institutionId,
      });

      await fetch('/api/admin/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'issue_credential',
          walletAddress: wallet.walletAddress,
          metadata: {
            studentId,
            issuerPublicKeyHex: derivedIssuerPk,
            degreeType,
            graduationYear,
            institutionId,
            txHash: res.txHash,
          },
        }),
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Credential issuance failed.');
    }
  };

  return (
    <main className="app-shell">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="pill">University Issuer Portal</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Private Credential Issuance</h1>
          <p className="mt-1 text-sm text-slate-600">
            Login with wallet. Issuing is enabled only when the issuer key is authorized on Midnight.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/university/apply" className="btn-ghost text-sm">
            Apply for Activation
          </Link>
          <Link href="/" className="btn-ghost text-sm">
            ← Back
          </Link>
        </div>
      </div>

      <div className="glass-card p-6 md:p-7">
        {!wallet.isConnected ? (
          <div>
            <p className="text-slate-700">
              Connect your university wallet and verify issuer authorization on Midnight.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={wallet.connect} disabled={wallet.connecting} className="btn-primary">
                {wallet.connecting ? 'Connecting...' : 'Login with Wallet'}
              </button>
              <Link href="/university/apply" className="btn-ghost">
                Apply for Activation
              </Link>
            </div>
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
                <div className="mt-2">
                  <p className="text-xs font-semibold text-emerald-700">Issuer key is authorized on Midnight.</p>
                  {issuerPublicKeyHex && (
                    <p className="mt-1 break-all text-[11px] text-emerald-800">Issuer PK: {issuerPublicKeyHex}</p>
                  )}
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-rose-700">{issuerStatusMessage ?? 'Issuer not authorized.'}</p>
                </div>
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

            <label className="field-label">
              Issuer Secret Key (hex, 32 bytes)
              <input
                type="password"
                value={issuerSecretKeyHex}
                onChange={(e) => setIssuerSecretKeyHex(e.target.value)}
                className="field-control"
                placeholder="64 hex chars (no spaces)"
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            <button
              onClick={issue}
              disabled={
                contract.loading ||
                !studentId ||
                !CONTRACT_ADDRESS ||
                !issuerAuthorized ||
                issuerSecretKeyHex.trim().length === 0
              }
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
            {actionError && <p className="text-sm text-rose-700">Error: {actionError}</p>}

            {result && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                <p className="font-semibold">Credential issued successfully</p>
                <p className="mt-2 break-all">
                  <span className="font-semibold">Nonce:</span> <code>{result.nonceHex}</code>
                </p>
                <p className="mt-1 break-all">
                  <span className="font-semibold">Issue TX:</span> <code>{result.txHash}</code>
                </p>
                <p className="mt-1">
                  <span className="font-semibold">Degree Type:</span> {result.degreeType}
                </p>
                <p className="mt-1">
                  <span className="font-semibold">Graduation Year:</span> {result.graduationYear}
                </p>
                <p className="mt-1">
                  <span className="font-semibold">Institution ID:</span> {result.institutionId}
                </p>
                <p className="mt-2 text-xs font-medium">Copy this package to Student Portal to avoid mismatched inputs:</p>
                <pre className="mt-1 overflow-auto rounded bg-emerald-100 p-2 text-[11px]">{JSON.stringify({
                  degreeType: result.degreeType,
                  graduationYear: result.graduationYear,
                  institutionId: result.institutionId,
                  nonceHex: result.nonceHex,
                })}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
