'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useWallet } from '@/hooks/useWallet';

interface ApplicationForm {
  institutionName: string;
  officialEmail: string;
  website: string;
  accreditationId: string;
  country: string;
  city: string;
  representativeName: string;
  walletAddress: string;
  supportingNotes: string;
}

const emptyForm: ApplicationForm = {
  institutionName: '',
  officialEmail: '',
  website: '',
  accreditationId: '',
  country: '',
  city: '',
  representativeName: '',
  walletAddress: '',
  supportingNotes: '',
};

export default function UniversityApplyPage() {
  const wallet = useWallet();
  const [form, setForm] = useState<ApplicationForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (wallet.walletAddress) {
      setForm((prev) => ({ ...prev, walletAddress: wallet.walletAddress ?? prev.walletAddress }));
    }
  }, [wallet.walletAddress]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/university/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? 'Unable to submit application.');
      }

      setSuccess('Application submitted. Admin will review and approve/reject your wallet.');
      setForm((prev) => ({ ...emptyForm, walletAddress: prev.walletAddress }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit application.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="app-shell">
      <section className="glass-card p-6 md:p-8">
        <p className="pill">University Onboarding</p>
        <h1 className="mt-3 text-3xl font-bold">Issuer Verification Application</h1>
        <p className="mt-1 text-sm text-slate-600">
          Submit your institution details for admin review. Issuing credentials is enabled only after approval.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {!wallet.isConnected ? (
            <button onClick={wallet.connect} disabled={wallet.connecting} className="btn-primary text-sm">
              {wallet.connecting ? 'Connecting wallet...' : 'Connect Wallet'}
            </button>
          ) : (
            <span className="pill">Wallet connected</span>
          )}
          <Link href="/" className="btn-ghost text-sm">
            ← Back to home
          </Link>
        </div>

        <form onSubmit={submit} className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="field-label">
            Institution Name
            <input
              className="field-control"
              value={form.institutionName}
              onChange={(e) => setForm((prev) => ({ ...prev, institutionName: e.target.value }))}
              required
            />
          </label>

          <label className="field-label">
            Official Email
            <input
              type="email"
              className="field-control"
              value={form.officialEmail}
              onChange={(e) => setForm((prev) => ({ ...prev, officialEmail: e.target.value }))}
              required
            />
          </label>

          <label className="field-label">
            Website
            <input
              className="field-control"
              value={form.website}
              placeholder="https://example.edu"
              onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
              required
            />
          </label>

          <label className="field-label">
            Accreditation ID
            <input
              className="field-control"
              value={form.accreditationId}
              onChange={(e) => setForm((prev) => ({ ...prev, accreditationId: e.target.value }))}
              required
            />
          </label>

          <label className="field-label">
            Country
            <input
              className="field-control"
              value={form.country}
              onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
              required
            />
          </label>

          <label className="field-label">
            City
            <input
              className="field-control"
              value={form.city}
              onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
              required
            />
          </label>

          <label className="field-label">
            Representative Name
            <input
              className="field-control"
              value={form.representativeName}
              onChange={(e) => setForm((prev) => ({ ...prev, representativeName: e.target.value }))}
              required
            />
          </label>

          <label className="field-label">
            Issuer Wallet Address
            <input
              className="field-control"
              value={form.walletAddress}
              onChange={(e) => setForm((prev) => ({ ...prev, walletAddress: e.target.value }))}
              required
            />
          </label>

          <label className="field-label md:col-span-2">
            Supporting Notes
            <textarea
              className="field-control min-h-28"
              value={form.supportingNotes}
              onChange={(e) => setForm((prev) => ({ ...prev, supportingNotes: e.target.value }))}
              placeholder="Optional details for admin verification"
            />
          </label>

          {error && <p className="md:col-span-2 text-sm text-rose-700">{error}</p>}
          {success && <p className="md:col-span-2 text-sm text-emerald-700">{success}</p>}

          <div className="md:col-span-2">
            <button disabled={submitting} className="btn-primary">
              {submitting ? 'Submitting...' : 'Submit Application'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
