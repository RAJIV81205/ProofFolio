'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useContract } from '@/hooks/useContract';
import { useWallet } from '@/hooks/useWallet';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? '';

function normalizeHex(value: string): string {
  return value.trim().toLowerCase().replace(/^0x/, '');
}

function isHex32(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(normalizeHex(value));
}

function hexToBytes32(value: string, label: string): Uint8Array {
  const normalized = normalizeHex(value);
  if (!isHex32(normalized)) {
    throw new Error(`${label} must be exactly 64 hex chars.`);
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function randomHex32(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface AuditLog {
  id: string;
  action: 'allow_issuer' | 'remove_issuer' | 'issue_credential' | 'approve_application' | 'reject_application';
  walletAddress: string;
  actor: string;
  createdAt: string;
  metadata?: {
    txHash?: string;
    onChainTxHash?: string;
    issuerPublicKeyHex?: string;
    attestationHashHex?: string;
    degreeType?: number;
    graduationYear?: number;
    institutionId?: number;
    applicationId?: string;
    institutionName?: string;
    reviewNote?: string;
  };
}

interface UniversityApplication {
  id: string;
  institutionName: string;
  officialEmail: string;
  website: string;
  accreditationId: string;
  country: string;
  city: string;
  representativeName: string;
  walletAddress: string;
  issuerPublicKeyHex: string;
  supportingNotes?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AdminPanelClient({ username }: { username: string }) {
  const wallet = useWallet();
  const contract = useContract(
    CONTRACT_ADDRESS,
    wallet.serviceUriConfig,
    wallet.connectedApi,
    wallet.walletAddress,
  );

  const [walletAddress, setWalletAddress] = useState('');
  const [issuers, setIssuers] = useState<string[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pendingApplications, setPendingApplications] = useState<UniversityApplication[]>([]);
  const [reviewedApplications, setReviewedApplications] = useState<UniversityApplication[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminSecretKeyHex, setAdminSecretKeyHex] = useState('');
  const [txStatus, setTxStatus] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewIssuerKeys, setReviewIssuerKeys] = useState<Record<string, string>>({});
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);

  const activeIssuerCount = useMemo(() => issuers.length, [issuers]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [issuerRes, applicationsRes] = await Promise.all([
        fetch('/api/admin/issuers', { method: 'GET', cache: 'no-store' }),
        fetch('/api/admin/applications', { method: 'GET', cache: 'no-store' }),
      ]);

      const issuerPayload = (await issuerRes.json()) as {
        issuers?: string[];
        logs?: AuditLog[];
        error?: string;
      };

      const applicationsPayload = (await applicationsRes.json()) as {
        pending?: UniversityApplication[];
        reviewed?: UniversityApplication[];
        error?: string;
      };

      if (!issuerRes.ok) throw new Error(issuerPayload.error ?? 'Failed to load issuer data.');
      if (!applicationsRes.ok) {
        throw new Error(applicationsPayload.error ?? 'Failed to load university applications.');
      }

      setIssuers(issuerPayload.issuers ?? []);
      setLogs(issuerPayload.logs ?? []);
      const pending = applicationsPayload.pending ?? [];
      setPendingApplications(pending);
      setReviewedApplications(applicationsPayload.reviewed ?? []);
      setReviewIssuerKeys((prev) => {
        const next = { ...prev };
        for (const app of pending) {
          if (next[app.id] === undefined) {
            next[app.id] = app.issuerPublicKeyHex ?? '';
          }
        }
        return next;
      });
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

  const reviewApplication = async (applicationId: string, decision: 'approved' | 'rejected') => {
    setActiveReviewId(applicationId);
    setError(null);

    try {
      const issuerPublicKeyHex = normalizeHex(reviewIssuerKeys[applicationId] ?? '');
      let attestationHashHex = '';
      let onChainTxHash = '';
      let onChainAlreadyAuthorized = false;

      if (decision === 'approved') {
        if (!wallet.isConnected || !wallet.walletAddress) {
          throw new Error('Connect your 1AM wallet before approving and registering issuer on-chain.');
        }

        const adminSecretKey = normalizeHex(adminSecretKeyHex);
        if (!isHex32(adminSecretKey)) {
          throw new Error('Admin secret key must be exactly 64 hex chars.');
        }

        if (!isHex32(issuerPublicKeyHex)) {
          throw new Error('Issuer public key must be exactly 64 hex chars.');
        }

        setTxStatus((prev) => ({ ...prev, [applicationId]: 'Checking issuer authorization on-chain...' }));
        onChainAlreadyAuthorized = await contract.isAuthorizedIssuer(issuerPublicKeyHex);
        attestationHashHex = randomHex32();

        if (!onChainAlreadyAuthorized) {
          setTxStatus((prev) => ({
            ...prev,
            [applicationId]: 'Open 1AM wallet and sign registerIssuer transaction...',
          }));
          onChainTxHash = await contract.registerIssuer(
            hexToBytes32(adminSecretKey, 'Admin secret key'),
            hexToBytes32(issuerPublicKeyHex, 'Issuer public key'),
            hexToBytes32(attestationHashHex, 'Attestation hash'),
          );

          setTxStatus((prev) => ({
            ...prev,
            [applicationId]: `registerIssuer submitted: ${onChainTxHash.slice(0, 16)}...`,
          }));
        } else {
          setTxStatus((prev) => ({
            ...prev,
            [applicationId]: 'Issuer already authorized on-chain. Skipping registerIssuer transaction.',
          }));
        }
      }

      const res = await fetch('/api/admin/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          decision,
          reviewNote: reviewNotes[applicationId] ?? '',
          issuerPublicKeyHex,
          attestationHashHex,
          onChainTxHash,
          onChainAlreadyAuthorized,
        }),
      });

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'Unable to review application.');
      setTxStatus((prev) => ({
        ...prev,
        [applicationId]:
          decision === 'approved'
            ? 'Approved and synced to Mongo after on-chain registration step.'
            : 'Application rejected.',
      }));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to review application.');
      setTxStatus((prev) => ({
        ...prev,
        [applicationId]: err instanceof Error ? err.message : 'Unable to review application.',
      }));
    } finally {
      setActiveReviewId(null);
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
            <h1 className="mt-3 text-3xl font-bold">University Verification Governance</h1>
            <p className="mt-1 text-sm text-slate-600">Signed in as {username}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/university" className="btn-ghost text-sm">
              Open University Issuance
            </Link>
            <button className="btn-primary text-sm" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-4">
        <MetricCard label="Pending Applications" value={pendingApplications.length.toString()} />
        <MetricCard label="Approved Wallets" value={activeIssuerCount.toString()} />
        <MetricCard label="Reviewed Applications" value={reviewedApplications.length.toString()} />
        <MetricCard label="Recent Security Logs" value={logs.length.toString()} />
      </section>

      <section className="mt-5 glass-card p-6">
        <h2 className="text-xl font-semibold">On-Chain Approval Signer (1AM Wallet)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Approval now follows transaction-first flow: sign registerIssuer in wallet, then Mongo is updated.
        </p>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white/80 p-3 text-sm">
          <p className="text-slate-600">Wallet status</p>
          <p className="mt-1 break-all font-medium text-slate-900">
            {wallet.isConnected ? wallet.walletAddress : 'Not connected'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!wallet.isConnected ? (
              <button onClick={wallet.connect} disabled={wallet.connecting} className="btn-primary">
                {wallet.connecting ? 'Connecting...' : 'Connect 1AM Wallet'}
              </button>
            ) : (
              <button onClick={wallet.disconnect} className="btn-ghost">
                Disconnect Wallet
              </button>
            )}
          </div>
          {wallet.error && <p className="mt-2 text-xs text-rose-700">{wallet.error}</p>}
          {contract.error && <p className="mt-2 text-xs text-rose-700">{contract.error}</p>}
        </div>

        <label className="field-label mt-4">
          Admin Secret Key (required to build registerIssuer witness)
          <input
            value={adminSecretKeyHex}
            onChange={(e) => setAdminSecretKeyHex(normalizeHex(e.target.value))}
            className="field-control mt-2 font-mono"
            placeholder="64 hex chars"
          />
        </label>
      </section>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
      )}

      <section className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <article className="glass-card p-6">
          <h2 className="text-xl font-semibold">University Applications</h2>
          <p className="mt-1 text-sm text-slate-600">
            Review institution KYC details and approve or reject issuing rights.
          </p>

          <div className="mt-4 space-y-3">
            {loading ? (
              <p className="text-sm text-slate-600">Loading applications...</p>
            ) : pendingApplications.length === 0 ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                No pending applications. Verification queue is clear.
              </p>
            ) : (
              pendingApplications.map((app) => (
                <div key={app.id} className="rounded-xl border border-slate-200 bg-white/85 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-slate-900">{app.institutionName}</h3>
                    <span className="pill">Pending</span>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-slate-700 md:grid-cols-2">
                    <p>
                      <span className="font-semibold">Representative:</span> {app.representativeName}
                    </p>
                    <p>
                      <span className="font-semibold">Official Email:</span> {app.officialEmail}
                    </p>
                    <p>
                      <span className="font-semibold">Website:</span> {app.website}
                    </p>
                    <p>
                      <span className="font-semibold">Accreditation ID:</span> {app.accreditationId}
                    </p>
                    <p>
                      <span className="font-semibold">Region:</span> {app.city}, {app.country}
                    </p>
                    <p className="break-all">
                      <span className="font-semibold">Wallet:</span> {app.walletAddress}
                    </p>
                    <p className="break-all md:col-span-2">
                      <span className="font-semibold">Issuer Public Key:</span> {app.issuerPublicKeyHex || 'Not provided'}
                    </p>
                  </div>

                  {app.supportingNotes && (
                    <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                      {app.supportingNotes}
                    </p>
                  )}

                  <textarea
                    value={reviewNotes[app.id] ?? ''}
                    onChange={(e) => setReviewNotes((prev) => ({ ...prev, [app.id]: e.target.value }))}
                    className="field-control mt-3 min-h-20 text-sm"
                    placeholder="Optional review note (reason, conditions, etc.)"
                  />

                  <input
                    value={reviewIssuerKeys[app.id] ?? ''}
                    onChange={(e) =>
                      setReviewIssuerKeys((prev) => ({
                        ...prev,
                        [app.id]: e.target.value.trim().toLowerCase().replace(/^0x/, ''),
                      }))
                    }
                    className="field-control mt-3 text-sm font-mono"
                    placeholder="Issuer Public Key (64 hex chars, required for approve)"
                  />

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="btn-primary"
                      onClick={() => reviewApplication(app.id, 'approved')}
                      disabled={activeReviewId === app.id || contract.loading}
                    >
                      {activeReviewId === app.id ? 'Processing...' : 'Approve'}
                    </button>
                    <button
                      className="btn-ghost border-rose-200 text-rose-700"
                      onClick={() => reviewApplication(app.id, 'rejected')}
                      disabled={activeReviewId === app.id}
                    >
                      Reject
                    </button>
                  </div>

                  {txStatus[app.id] && (
                    <p className="mt-2 text-xs text-slate-600">{txStatus[app.id]}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </article>

        <article className="glass-card p-6">
          <h2 className="text-xl font-semibold">Approved Wallet Allowlist</h2>
          <p className="mt-1 text-sm text-slate-600">Manual override is available for emergency onboarding.</p>

          <form onSubmit={addIssuer} className="mt-4 flex flex-col gap-3">
            <input
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              className="field-control mt-0"
              placeholder="Paste issuer wallet address"
              disabled={busy}
              required
            />
            <button type="submit" className="btn-primary" disabled={busy}>
              Add Wallet Manually
            </button>
          </form>

          <div className="mt-4 max-h-95 space-y-2 overflow-y-auto pr-1">
            {issuers.length === 0 ? (
              <p className="text-sm text-slate-600">No approved issuer wallets yet.</p>
            ) : (
              issuers.map((issuer) => (
                <div key={issuer} className="rounded-xl border border-slate-200 bg-white/80 p-3">
                  <code className="block break-all text-xs text-slate-700">{issuer}</code>
                  <button
                    onClick={() => removeIssuer(issuer)}
                    disabled={busy}
                    className="btn-ghost mt-2 border-rose-200 text-xs text-rose-700"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <article className="glass-card p-6">
          <h2 className="text-xl font-semibold">Recent Decisions</h2>
          <div className="mt-3 max-h-70 space-y-2 overflow-y-auto pr-1">
            {reviewedApplications.length === 0 ? (
              <p className="text-sm text-slate-600">No reviewed applications yet.</p>
            ) : (
              reviewedApplications.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-white/85 p-3 text-xs">
                  <p className="font-semibold uppercase tracking-wide text-slate-500">{item.status}</p>
                  <p className="mt-1 text-slate-800">{item.institutionName}</p>
                  <p className="mt-1 text-slate-600">{item.officialEmail}</p>
                  {item.reviewNote && <p className="mt-1 text-slate-600">Note: {item.reviewNote}</p>}
                </div>
              ))
            )}
          </div>
        </article>

        <article className="glass-card p-6">
          <h2 className="text-xl font-semibold">Security Audit Trail</h2>
          <div className="mt-3 max-h-70 space-y-2 overflow-y-auto pr-1">
            {logs.length === 0 ? (
              <p className="text-sm text-slate-600">No logs recorded yet.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="rounded-xl border border-slate-200 bg-white/85 p-3 text-xs">
                  <p className="font-semibold uppercase tracking-wide text-slate-500">{log.action}</p>
                  <p className="mt-1 break-all text-slate-700">{log.walletAddress}</p>
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
