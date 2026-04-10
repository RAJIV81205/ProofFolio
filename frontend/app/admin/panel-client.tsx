'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

interface AuditLog {
  id: string;
  action: 'allow_issuer' | 'remove_issuer' | 'issue_credential' | 'approve_application' | 'reject_application';
  walletAddress: string;
  actor: string;
  createdAt: string;
  metadata?: {
    txHash?: string;
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
  supportingNotes?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AdminPanelClient({ username }: { username: string }) {
  const [walletAddress, setWalletAddress] = useState('');
  const [issuers, setIssuers] = useState<string[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pendingApplications, setPendingApplications] = useState<UniversityApplication[]>([]);
  const [reviewedApplications, setReviewedApplications] = useState<UniversityApplication[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
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
      setPendingApplications(applicationsPayload.pending ?? []);
      setReviewedApplications(applicationsPayload.reviewed ?? []);
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
      const res = await fetch('/api/admin/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          decision,
          reviewNote: reviewNotes[applicationId] ?? '',
        }),
      });

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'Unable to review application.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to review application.');
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

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="btn-primary"
                      onClick={() => reviewApplication(app.id, 'approved')}
                      disabled={activeReviewId === app.id}
                    >
                      Approve
                    </button>
                    <button
                      className="btn-ghost border-rose-200 text-rose-700"
                      onClick={() => reviewApplication(app.id, 'rejected')}
                      disabled={activeReviewId === app.id}
                    >
                      Reject
                    </button>
                  </div>
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

          <div className="mt-4 max-h-[380px] space-y-2 overflow-y-auto pr-1">
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
          <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto pr-1">
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
          <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto pr-1">
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
