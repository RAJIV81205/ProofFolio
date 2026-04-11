'use client';

import { useState } from 'react';
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

function normalizeHex(value: string): string {
  return value.trim().toLowerCase().replace(/^0x/, '');
}

function isHex32(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
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
  const [validityDays, setValidityDays] = useState(0);

  const [issuerSecretKeyHex, setIssuerSecretKeyHex] = useState('');

  type IssueFlowStage = 'idle' | 'verifying' | 'issuing' | 'success' | 'error';
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [issueFlowStage, setIssueFlowStage] = useState<IssueFlowStage>('idle');
  const [issueFlowMessage, setIssueFlowMessage] = useState('');
  const [issueFlowError, setIssueFlowError] = useState<string | null>(null);

  const [result, setResult] = useState<{
    txHash: string;
    nonceHex: string;
    issuerPublicKeyHex: string;
    degreeType: number;
    graduationYear: number;
    institutionId: number;
    issuedAt: number;
    validUntil: number;
  } | null>(null);
  const issueInProgress = issueFlowStage === 'verifying' || issueFlowStage === 'issuing' || contract.loading;
  const secretDerivedIssuerPublicKeyHex = (() => {
    const normalized = normalizeHex(issuerSecretKeyHex);
    if (!isHex32(normalized)) return null;
    try {
      return normalizeHex(deriveIssuerPublicKeyHex(normalized));
    } catch {
      return null;
    }
  })();

  const issue = async () => {
    if (!wallet.walletAddress) return;

    setIssueModalOpen(true);
    setIssueFlowStage('verifying');
    setIssueFlowError(null);
    setIssueFlowMessage('Verifying access on Midnight...');
    setResult(null);

    try {
      if (!CONTRACT_ADDRESS) {
        throw new Error('Missing contract address configuration.');
      }

      if (!studentId.trim()) {
        throw new Error('Student ID is required before issuing credential.');
      }

      const normalizedInput = normalizeHex(issuerSecretKeyHex);
      if (!normalizedInput) {
        throw new Error('Issuer secret key is required for issuing credentials.');
      }

      if (!isHex32(normalizedInput)) {
        throw new Error('Issuer secret key must be exactly 64 hex characters.');
      }

      const issuerSecretKey = parseHex32(issuerSecretKeyHex);
      const derivedIssuerPk = normalizeHex(deriveIssuerPublicKeyHex(issuerSecretKey));

      // Contract-only access check: no backend key/status lookup.
      const authorized = await isAuthorizedIssuer(derivedIssuerPk);
      if (!authorized) {
        const rawInputLooksAuthorized = await isAuthorizedIssuer(normalizedInput);
        if (rawInputLooksAuthorized) {
          throw new Error('Entered value appears to be issuer public key. Please enter issuer secret key.');
        }
        throw new Error('Derived issuer key is not authorized on Midnight. Ask admin to register this key first.');
      }

      setIssueFlowStage('issuing');
      setIssueFlowMessage('Access verified on contract. Waiting for wallet signature to issue credential...');

      const issuedAt = Math.floor(Date.now() / 1000);
      const validUntil = validityDays > 0 ? issuedAt + validityDays * 24 * 60 * 60 : 0;

      const res = await contract.issueCredential(issuerSecretKey, {
        degreeType,
        graduationYear,
        institutionId,
        issuedAt,
        validUntil,
      });

      setResult({
        txHash: res.txHash,
        nonceHex: res.nonceHex,
        issuerPublicKeyHex: res.issuerPublicKeyHex,
        degreeType,
        graduationYear,
        institutionId,
        issuedAt,
        validUntil,
      });

      setIssueFlowStage('success');
      setIssueFlowMessage('Credential issued successfully.');
    } catch (error) {
      setIssueFlowStage('error');
      setIssueFlowError(error instanceof Error ? error.message : 'Credential issuance failed.');
      setIssueFlowMessage('Unable to issue credential.');
    }
  };

  const closeIssueModal = () => {
    if (issueFlowStage === 'verifying' || issueFlowStage === 'issuing') {
      return;
    }

    setIssueModalOpen(false);
    setIssueFlowStage('idle');
    setIssueFlowMessage('');
    setIssueFlowError(null);
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
              Connect your university wallet, fill details, and click issue. Access verification will run in the issue popup.
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
              <p className="mt-2 text-xs text-slate-600">Verification and on-chain access checks happen after you click Issue Credential.</p>
              {secretDerivedIssuerPublicKeyHex && (
                <p className="mt-2 break-all text-[11px] text-slate-700">Derived From Secret: {secretDerivedIssuerPublicKeyHex}</p>
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

              <label className="field-label">
                Validity (days, 0 = no expiry)
                <input
                  type="number"
                  min={0}
                  value={validityDays}
                  onChange={(e) => setValidityDays(Math.max(0, Number(e.target.value) || 0))}
                  className="field-control"
                />
              </label>
            </div>

            <label className="field-label">
              Issuer Secret Key (hex, 32 bytes) - do not paste public key here
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
                issueInProgress ||
                !CONTRACT_ADDRESS ||
                issuerSecretKeyHex.trim().length === 0
              }
              className="btn-primary"
            >
              {issueInProgress ? 'Processing...' : 'Issue Credential'}
            </button>

            {!CONTRACT_ADDRESS && (
              <p className="text-sm text-rose-700">
                Missing `NEXT_PUBLIC_CONTRACT_ADDRESS` in `frontend/.env.local`.
              </p>
            )}

            {contract.error && <p className="text-sm text-rose-700">Error: {contract.error}</p>}
          </div>
        )}
      </div>

      {issueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h2 className="text-xl font-semibold text-slate-900">Issue Credential</h2>
            <p className="mt-2 text-sm text-slate-600">{issueFlowMessage}</p>

            {(issueFlowStage === 'verifying' || issueFlowStage === 'issuing') && (
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                <span>{issueFlowStage === 'verifying' ? 'Verifying access...' : 'Issuing credential...'}</span>
              </div>
            )}

            {issueFlowStage === 'error' && issueFlowError && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {issueFlowError}
              </div>
            )}

            {issueFlowStage === 'success' && result && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                <p className="font-semibold">Credential issued successfully</p>
                <p className="mt-2 break-all"><span className="font-semibold">Nonce:</span> {result.nonceHex}</p>
                <p className="mt-1 break-all"><span className="font-semibold">Issue TX:</span> {result.txHash}</p>
                <p className="mt-1 break-all"><span className="font-semibold">Issuer PK:</span> {result.issuerPublicKeyHex}</p>
                <p className="mt-1"><span className="font-semibold">Degree Type:</span> {result.degreeType}</p>
                <p className="mt-1"><span className="font-semibold">Graduation Year:</span> {result.graduationYear}</p>
                <p className="mt-1"><span className="font-semibold">Institution ID:</span> {result.institutionId}</p>
                <p className="mt-1"><span className="font-semibold">Issued At:</span> {result.issuedAt}</p>
                <p className="mt-1"><span className="font-semibold">Valid Until:</span> {result.validUntil === 0 ? 'No expiry' : String(result.validUntil)}</p>
              </div>
            )}

            {(issueFlowStage === 'success' || issueFlowStage === 'error') && (
              <div className="mt-5 flex justify-end">
                <button className="btn-primary" onClick={closeIssueModal}>Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
