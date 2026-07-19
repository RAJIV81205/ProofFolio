'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { deployCredentialVerifier } from '@/lib/browserDeploy';

export default function DeployPage() {
  const wallet = useWallet();
  const [isLocal, setIsLocal] = useState<boolean | null>(null);
  const [adminSecretKey, setAdminSecretKey] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setIsLocal(['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname));
  }, []);

  if (isLocal === false) {
    return (
      <main className="app-shell">
        <div className="glass-card max-w-2xl p-6 md:p-7">
          <p className="pill">Local development only</p>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">Browser deployment unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">
            Run ProofFolio locally to access the 1AM deployment portal.
          </p>
          <Link href="/" className="btn-primary mt-4 inline-block">← Back home</Link>
        </div>
      </main>
    );
  }

  const deploy = async () => {
    if (!wallet.connectedApi) return;
    setBusy(true);
    setError('');
    setStatus('Preparing browser deployment…');
    try {
      const result = await deployCredentialVerifier(
        wallet.connectedApi,
        wallet.serviceUriConfig,
        adminSecretKey,
      );
      setContractAddress(result.contractAddress);
      setTransactionId(result.transactionId);
      setStatus('Deployment submitted through 1AM.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app-shell">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="pill">Browser Deployment</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Deploy ProofFolio</h1>
          <p className="mt-1 text-sm text-slate-600">
            Midnight preprod · 1AM wallet · browser proving
          </p>
        </div>
        <Link href="/" className="btn-ghost text-sm">← Back</Link>
      </div>

      <div className="glass-card max-w-2xl p-6 md:p-7">
        {!wallet.isConnected ? (
          <div>
            <p className="text-slate-700">Connect 1AM on Midnight preprod to deploy.</p>
            <button onClick={wallet.connect} disabled={wallet.connecting} className="btn-primary mt-4">
              {wallet.connecting ? 'Connecting…' : 'Connect 1AM Wallet'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white/80 p-3 text-sm">
              <p className="text-slate-500">Network</p>
              <p className="font-semibold text-slate-900">{wallet.serviceUriConfig?.networkId ?? 'preprod'}</p>
            </div>

            <label className="field-label">
              Admin secret key (32 bytes, browser-only)
              <input
                value={adminSecretKey}
                onChange={(event) => setAdminSecretKey(event.target.value.trim())}
                placeholder="64 hex characters"
                className="field-control font-mono"
                type="password"
                autoComplete="off"
                disabled={busy || Boolean(contractAddress)}
              />
            </label>

            <p className="text-xs text-slate-500">
              Key enters only browser witness execution. 1AM balances, proves, and submits transaction.
            </p>

            {!contractAddress && (
              <button onClick={deploy} disabled={busy || !adminSecretKey} className="btn-primary w-full">
                {busy ? status || 'Deploying…' : 'Deploy Contract'}
              </button>
            )}

            {contractAddress && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-900">Contract address</p>
                <code className="mt-2 block break-all text-xs text-emerald-950">{contractAddress}</code>
                {transactionId && <p className="mt-3 break-all text-xs text-emerald-800">Transaction: {transactionId}</p>}
              </div>
            )}
          </div>
        )}

        {wallet.error && <p className="mt-4 text-sm text-rose-700">{wallet.error}</p>}
        {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}
        {status && !contractAddress && <p className="mt-4 text-sm text-slate-600">{status}</p>}
      </div>
    </main>
  );
}
