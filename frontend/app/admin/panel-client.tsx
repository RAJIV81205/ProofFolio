'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

interface AuditLog {
  id: string;
  action: 'allow_issuer' | 'remove_issuer' | 'issue_credential';
  walletAddress: string;
  actor: string;
  createdAt: string;
  metadata?: {
    txHash?: string;
    degreeType?: number;
    graduationYear?: number;
    institutionId?: number;
  };
}

export default function AdminPanelClient({ username }: { username: string }) {
  const [walletAddress, setWalletAddress] = useState('');
  const [issuers, setIssuers] = useState<string[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeIssuerCount = useMemo(() => issuers.length, [issuers]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/issuers', { method: 'GET', cache: 'no-store' });
      const payload = (await res.json()) as { issuers?: string[]; logs?: AuditLog[]; error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'Failed to load admin data.');
      setIssuers(payload.issuers ?? []);
      setLogs(payload.logs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const addIssuer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!walletAddress.trim()) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/issuers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      });
      const payload = (await res.json()) as { issuers?: string[]; error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'Failed to add issuer wallet.');
      setIssuers(payload.issuers ?? []);
      setWalletAddress('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add issuer wallet.');
    } finally {
      setBusy(false);
    }
  };

  const removeIssuer = async (issuer: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/issuers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: issuer }),
      });
      const payload = (await res.json()) as { issuers?: string[]; error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'Failed to remove issuer wallet.');
      setIssuers(payload.issuers ?? []);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove issuer wallet.');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  };

  return (
    <main className="app-shell">
      <section className="glass-card p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="pill">Admin Console</p>
            <h1 className="mt-3 text-3xl font-bold">Security & Issuer Governance</h1>
            <p className="mt-1 text-sm text-slate-600">Signed in as {username}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/university" className="btn-ghost text-sm">
              Open University Portal
            </Link>
            <button className="btn-primary text-sm" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-3">
        <MetricCard label="Allowed issuer wallets" value={activeIssuerCount.toString()} />
        <MetricCard label="Recent security logs" value={logs.length.toString()} />
        <MetricCard label="Session control" value="Active" />
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <article className="glass-card p-6">
          <h2 className="text-xl font-semibold">Issuer Allowlist</h2>
          <p className="mt-1 text-sm text-slate-600">
            Only wallets in this list can issue credentials from the university panel.
          </p>

          <form onSubmit={addIssuer} className="mt-4 flex flex-col gap-3 md:flex-row">
            <input
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              className="field-control mt-0"
              placeholder="Paste issuer wallet address"
              disabled={busy}
              required
            />
            <button type="submit" className="btn-primary md:min-w-40" disabled={busy}>
              Add wallet
            </button>
          </form>

          {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

          <div className="mt-4 space-y-2">
            {loading ? (
              <p className="text-sm text-slate-600">Loading allowlist...</p>
            ) : issuers.length === 0 ? (
              <p className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-900">
                No issuer wallets yet. Add at least one approved university wallet.
              </p>
            ) : (
              issuers.map((issuer) => (
                <div
                  key={issuer}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 p-3 md:flex-row md:items-center md:justify-between"
                >
                  <code className="text-xs text-slate-700">{issuer}</code>
                  <button
                    onClick={() => removeIssuer(issuer)}
                    disabled={busy}
                    className="btn-ghost border-rose-200 text-xs text-rose-700"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="glass-card p-6">
          <h2 className="text-xl font-semibold">Audit Trail</h2>
          <p className="mt-1 text-sm text-slate-600">Tracks allowlist and issuance events.</p>

          <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {logs.length === 0 ? (
              <p className="text-sm text-slate-600">No logs recorded yet.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="rounded-xl border border-slate-200 bg-white/80 p-3 text-xs">
                  <p className="font-semibold uppercase tracking-wide text-slate-500">{log.action}</p>
                  <p className="mt-1 break-all text-slate-700">{log.walletAddress}</p>
                  {log.metadata?.txHash && <p className="mt-1 break-all text-slate-600">TX: {log.metadata.txHash}</p>}
                  <p className="mt-1 text-slate-500">{new Date(log.createdAt).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="glass-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
    </article>
  );
}
