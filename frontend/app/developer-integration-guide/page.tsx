'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@/hooks/useWallet';
import { useContract } from '@/hooks/useContract';
import {
  runIntegrationSuite,
  type IntegrationRunResult,
  type IntegrationStep,
} from '@/lib/devIntegrationSuite';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? '';

function randomHex32() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function statusBadgeClass(status: IntegrationStep['status']) {
  switch (status) {
    case 'success':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'failed':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    case 'running':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'skipped':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

export default function DeveloperIntegrationGuidePage() {
  const wallet = useWallet();
  const contract = useContract(
    CONTRACT_ADDRESS,
    wallet.serviceUriConfig,
    wallet.connectedApi,
    wallet.walletAddress,
  );

  const [adminSecretKeyHex, setAdminSecretKeyHex] = useState('');
  const [issuerSecretKeyHex, setIssuerSecretKeyHex] = useState('');
  const [studentSecretKeyHex, setStudentSecretKeyHex] = useState(randomHex32());
  const [runTransactions, setRunTransactions] = useState(true);
  const [includeDeregister, setIncludeDeregister] = useState(false);

  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<IntegrationStep[]>([]);
  const [result, setResult] = useState<IntegrationRunResult | null>(null);
  const [runnerError, setRunnerError] = useState<string | null>(null);

  const canRun = useMemo(() => {
    if (!wallet.isConnected || !wallet.connectedApi) return false;
    if (!CONTRACT_ADDRESS) return false;
    if (!adminSecretKeyHex || !issuerSecretKeyHex || !studentSecretKeyHex) return false;
    return true;
  }, [
    adminSecretKeyHex,
    issuerSecretKeyHex,
    studentSecretKeyHex,
    wallet.isConnected,
    wallet.connectedApi,
  ]);

  const runSuite = async () => {
    setRunnerError(null);
    setResult(null);

    if (!wallet.connectedApi) {
      setRunnerError('Connect the 1AM wallet first.');
      return;
    }

    try {
      setRunning(true);
      const suiteResult = await runIntegrationSuite({
        connectedApi: wallet.connectedApi,
        contract,
        contractAddress: CONTRACT_ADDRESS,
        adminSecretKeyHex,
        issuerSecretKeyHex,
        studentSecretKeyHex,
        runTransactions,
        includeDeregister,
        onStepUpdate: setSteps,
      });

      setResult(suiteResult);
    } catch (error) {
      setRunnerError(error instanceof Error ? error.message : 'Integration suite failed unexpectedly.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="app-shell">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="pill">Developer Integration Guide</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">1AM Wallet + Midnight E2E Test Runner</h1>
          <p className="mt-1 text-sm text-slate-600">
            One page to verify wallet integration, contract state, and every supported transaction flow.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/" className="btn-ghost text-sm">
            ← Back
          </Link>
          <button
            type="button"
            onClick={wallet.connect}
            disabled={wallet.connecting}
            className="btn-primary"
          >
            {wallet.connecting ? 'Connecting...' : wallet.isConnected ? 'Wallet Connected' : 'Connect 1AM Wallet'}
          </button>
        </div>
      </div>

      <section className="glass-card p-6 md:p-7">
        <h2 className="text-xl font-semibold text-slate-900">Run Full Integration Suite</h2>
        <p className="mt-1 text-sm text-slate-600">
          This executes real Midnight transactions through the connected 1AM wallet.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="field-label">
            Contract Address
            <input
              value={CONTRACT_ADDRESS}
              readOnly
              className="field-control bg-slate-50 font-mono text-xs"
            />
          </label>

          <label className="field-label">
            Connected Wallet
            <input
              value={wallet.walletAddress ?? 'Not connected'}
              readOnly
              className="field-control bg-slate-50 font-mono text-xs"
            />
          </label>

          <label className="field-label">
            Admin Secret Key (hex, 32 bytes)
            <input
              type="password"
              value={adminSecretKeyHex}
              onChange={(event) => setAdminSecretKeyHex(event.target.value.trim())}
              className="field-control"
              placeholder="64 hex chars"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <label className="field-label">
            Issuer Secret Key (hex, 32 bytes)
            <input
              type="password"
              value={issuerSecretKeyHex}
              onChange={(event) => setIssuerSecretKeyHex(event.target.value.trim())}
              className="field-control"
              placeholder="64 hex chars"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <label className="field-label md:col-span-2">
            Student Secret Key (hex, 32 bytes)
            <div className="mt-1 flex gap-2">
              <input
                type="password"
                value={studentSecretKeyHex}
                onChange={(event) => setStudentSecretKeyHex(event.target.value.trim())}
                className="field-control"
                placeholder="64 hex chars"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="btn-ghost whitespace-nowrap"
                onClick={() => setStudentSecretKeyHex(randomHex32())}
              >
                Regenerate
              </button>
            </div>
          </label>
        </div>

        <div className="mt-4 grid gap-2 text-sm text-slate-700">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={runTransactions}
              onChange={(event) => setRunTransactions(event.target.checked)}
            />
            Run write transactions (register, issue, present, revoke)
          </label>

          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeDeregister}
              onChange={(event) => setIncludeDeregister(event.target.checked)}
              disabled={!runTransactions}
            />
            Include issuer cleanup by calling deregisterIssuer at the end
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={runSuite} disabled={running || !canRun}>
            {running ? 'Running integration suite...' : 'Run integration suite'}
          </button>

          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setSteps([]);
              setResult(null);
              setRunnerError(null);
            }}
            disabled={running}
          >
            Clear results
          </button>
        </div>

        {!CONTRACT_ADDRESS && (
          <p className="mt-3 text-sm text-rose-700">
            Missing NEXT_PUBLIC_CONTRACT_ADDRESS in frontend/.env.local
          </p>
        )}
        {wallet.error && <p className="mt-3 text-sm text-rose-700">Wallet error: {wallet.error}</p>}
        {contract.error && <p className="mt-3 text-sm text-rose-700">Contract error: {contract.error}</p>}
        {runnerError && <p className="mt-3 text-sm text-rose-700">Runner error: {runnerError}</p>}
      </section>

      <section className="glass-card mt-5 p-6 md:p-7">
        <h2 className="text-xl font-semibold text-slate-900">Suite Steps</h2>
        <p className="mt-1 text-sm text-slate-600">Each step reports a pass/fail status with detailed output.</p>

        {steps.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No run yet. Connect wallet, provide keys, and run the suite.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {steps.map((step) => (
              <div key={step.id} className="rounded-xl border border-slate-200 bg-white/85 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">{step.title}</p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${statusBadgeClass(step.status)}`}
                  >
                    {step.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{step.detail}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {result && (
        <section className="glass-card mt-5 p-6 md:p-7">
          <h2 className="text-xl font-semibold text-slate-900">Run Summary</h2>
          <p className={`mt-2 text-sm ${result.success ? 'text-emerald-700' : 'text-rose-700'}`}>{result.message}</p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <SummaryRow label="Network" value={result.outputs.networkId ?? 'N/A'} />
            <SummaryRow label="Issuer Public Key" value={result.outputs.issuerPublicKeyHex ?? 'N/A'} mono />
            <SummaryRow label="Register TX" value={result.outputs.registerTxHash ?? 'N/A'} mono />
            <SummaryRow label="Issue TX" value={result.outputs.issueTxHash ?? 'N/A'} mono />
            <SummaryRow label="Present TX" value={result.outputs.presentTxHash ?? 'N/A'} mono />
            <SummaryRow label="Revoke TX" value={result.outputs.revokeTxHash ?? 'N/A'} mono />
            <SummaryRow label="Deregister TX" value={result.outputs.deregisterTxHash ?? 'N/A'} mono />
            <SummaryRow label="Commitment" value={result.outputs.commitmentHex ?? 'N/A'} mono />
          </div>

          {result.outputs.environmentWarnings && result.outputs.environmentWarnings.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Environment warnings</p>
              <ul className="mt-1 list-disc pl-5">
                {result.outputs.environmentWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="glass-card mt-5 p-6 md:p-7">
        <h2 className="text-xl font-semibold text-slate-900">Developer Integration Checklist</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>Detect wallet at window.midnight["1am"] and connect to preview or preprod.</li>
          <li>Read addresses, balances, and runtime configuration from ConnectedAPI.</li>
          <li>Build providers using wallet proving and wallet balanceUnsealedTransaction delegation.</li>
          <li>Load on-chain contract state before running transactions.</li>
          <li>Execute registerIssuer, issueCredential, presentCredential, revokeCredential, and optional deregisterIssuer.</li>
          <li>Verify each transaction hash via public data provider.</li>
          <li>Confirm ledger changes after the run to validate final state.</li>
        </ol>

        <p className="mt-4 text-xs text-slate-500">
          Important: this page performs real on-chain transactions when transaction mode is enabled.
        </p>
      </section>
    </main>
  );
}

function SummaryRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/85 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 break-all text-sm text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
