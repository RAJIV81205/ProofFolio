'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@/hooks/useWallet';
import { useContract } from '@/hooks/useContract';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? '';

export default function EmployerPage() {
  const wallet = useWallet();
  const contract = useContract(
    CONTRACT_ADDRESS,
    wallet.serviceUriConfig,
    wallet.connectedApi,
    wallet.walletAddress,
  );
  const { getLedgerState, verifyPresentationByTxHash } = contract;

  const [ledgerState, setLedgerState] = useState<{
    issuanceCount: bigint;
    verificationCount: bigint;
    issuerCount: bigint;
  } | null>(null);

  const [proofTxHash, setProofTxHash] = useState('');
  const [verificationResult, setVerificationResult] = useState<
    { ok: true; message: string } | { ok: false; message: string } | null
  >(null);

  useEffect(() => {
    let mounted = true;

    getLedgerState().then((state) => {
      if (!mounted || !state) return;

      setLedgerState({
        issuanceCount: state.issuanceCount,
        verificationCount: state.verificationCount,
        issuerCount: state.issuerCount,
      });
    });

    return () => {
      mounted = false;
    };
  }, [getLedgerState]);

  const verify = async () => {
    try {
      const found = await verifyPresentationByTxHash(proofTxHash);
      if (!found) {
        setVerificationResult({ ok: false, message: 'No proof found for this TX hash.' });
        return;
      }
      setVerificationResult({
        ok: true,
        message: `Valid proof transaction ${found.txHash.slice(0, 16)}... finalized at ${new Date(found.createdAt).toLocaleString()}.`,
      });
    } catch (err) {
      setVerificationResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Verification failed',
      });
    }
  };

  return (
    <main className="app-shell">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="pill">Employer Verifier</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Instant Credential Verification</h1>
          <p className="mt-1 text-sm text-slate-600">Validate candidate proofs without exposing academic records.</p>
        </div>
        <Link href="/" className="btn-ghost text-sm">
          ← Back
        </Link>
      </div>

      <div className="glass-card p-6 md:p-7">
        <p className="text-sm text-slate-600">
          Contract:{' '}
          {CONTRACT_ADDRESS ? (
            <code className="break-all rounded-lg bg-slate-100 px-2 py-1">{CONTRACT_ADDRESS}</code>
          ) : (
            <span className="text-rose-700">Not configured</span>
          )}
        </p>

        {ledgerState && (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <StatCard label="Issuers" value={ledgerState.issuerCount.toString()} />
            <StatCard label="Credentials Issued" value={ledgerState.issuanceCount.toString()} />
            <StatCard label="Presentations Verified" value={ledgerState.verificationCount.toString()} />
          </div>
        )}

        {!wallet.isConnected ? (
          <div className="mt-6">
            <p className="text-slate-700">Connect wallet for full verifier workflow.</p>
            <button
              onClick={wallet.connect}
              disabled={wallet.connecting}
              className="btn-primary mt-3"
            >
              {wallet.connecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
            {wallet.error && <p className="mt-3 text-sm text-rose-700">{wallet.error}</p>}
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <label className="field-label">
              Candidate proof TX hash
              <input
                value={proofTxHash}
                onChange={(e) => setProofTxHash(e.target.value.trim())}
                className="field-control font-mono text-xs"
                placeholder="64-char hex"
              />
            </label>

            <button
              onClick={verify}
              disabled={!proofTxHash}
              className="btn-primary"
            >
              Verify Proof
            </button>

            {verificationResult && (
              <div
                className={`rounded-lg p-3 text-sm ${
                  verificationResult.ok
                    ? 'bg-emerald-50 text-emerald-900'
                    : 'bg-rose-50 text-rose-900'
                }`}
              >
                {verificationResult.message}
              </div>
            )}

            {CONTRACT_ADDRESS && (
              <a
                href={`https://explorer.preprod.midnight.network/contracts/${CONTRACT_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-sm font-semibold text-teal-700"
              >
                Open contract in Midnight explorer →
              </a>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/85 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
