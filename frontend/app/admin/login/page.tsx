'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState('/admin');

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    if (next && next.startsWith('/')) {
      setNextPath(next);
    }
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? 'Login failed');
      }

      router.push(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-shell">
      <div className="mx-auto max-w-xl">
        <div className="glass-card p-7 md:p-10">
          <p className="pill">Secure Admin Access</p>
          <h1 className="mt-4 text-3xl font-bold">CredZK Admin Login</h1>
          <p className="mt-2 text-sm text-slate-600">
            Only configured administrators can manage issuer wallets and access issuance controls.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="field-label">
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="field-control"
                autoComplete="username"
                required
              />
            </label>

            <label className="field-label">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field-control"
                autoComplete="current-password"
                required
              />
            </label>

            {error && <p className="text-sm text-rose-700">{error}</p>}

            <button disabled={loading} className="btn-primary w-full" type="submit">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-5 text-xs text-slate-600">
            <p>
              Set `ADMIN_USERNAME`, `ADMIN_PASSWORD_SHA256`, and `ADMIN_SESSION_SECRET` in
              `frontend/.env.local`.
            </p>
          </div>

          <Link href="/" className="mt-5 inline-flex text-sm font-semibold text-teal-700">
            ← Back to landing page
          </Link>
        </div>
      </div>
    </main>
  );
}
