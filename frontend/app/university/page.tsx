// ─────────────────────────────────────────────────────────────────────────────
// FILE 3: src/pages/UniversityPage.tsx
// Issuer portal — university staff use this to issue credentials
// ─────────────────────────────────────────────────────────────────────────────
 
import React, { useState } from 'react';
import { useWallet }   from '../hooks/useWallet';
import { useContract } from '../hooks/useContract';
import { DegreeType }  from '../lib/witness';
 
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
 
export function UniversityPage() {
  const wallet   = useWallet();
  const contract = useContract(CONTRACT_ADDRESS, wallet.serviceUriConfig);
 
  const [form, setForm] = useState({
    degreeType:     DegreeType.BTech,
    graduationYear: 2022,
    institutionId:  1001,
  });
  const [result, setResult] = useState<{ commitmentHex: string; nonceHex: string } | null>(null);
 
  // In production: load issuer secret key from Lace wallet signing
  // For hackathon demo: stored in sessionStorage (NOT for production!)
  const issuerSecretKey = new Uint8Array(32).fill(1); // placeholder
 
  const handleIssue = async () => {
    const res = await contract.issueCredential(issuerSecretKey, form);
    if (res) setResult({ commitmentHex: res.commitmentHex, nonceHex: res.nonceHex });
  };
 
  if (!wallet.isConnected) {
    return (
      <div>
        <h2>University Portal</h2>
        <button onClick={wallet.connect} disabled={wallet.connecting}>
          {wallet.connecting ? 'Connecting...' : 'Connect Lace Wallet'}
        </button>
        {wallet.error && <p style={{ color: 'red' }}>{wallet.error}</p>}
      </div>
    );
  }
 
  return (
    <div>
      <h2>Issue Credential</h2>
      <p>Connected: {wallet.walletAddress}</p>
 
      <select
        value={form.degreeType}
        onChange={e => setForm(f => ({ ...f, degreeType: Number(e.target.value) }))}
      >
        <option value={DegreeType.BTech}>B.Tech</option>
        <option value={DegreeType.MTech}>M.Tech</option>
        <option value={DegreeType.PhD}>PhD</option>
        <option value={DegreeType.MBA}>MBA</option>
      </select>
 
      <input
        type="number"
        value={form.graduationYear}
        onChange={e => setForm(f => ({ ...f, graduationYear: Number(e.target.value) }))}
        placeholder="Graduation Year"
      />
 
      <button onClick={handleIssue} disabled={contract.loading}>
        {contract.loading ? 'Generating ZK proof...' : 'Issue Credential'}
      </button>
 
      {contract.error && <p style={{ color: 'red' }}>Error: {contract.error}</p>}
 
      {result && (
        <div>
          <p>✅ Credential issued! Give these to the student:</p>
          <p><strong>Commitment:</strong> <code>{result.commitmentHex}</code></p>
          <p><strong>Nonce:</strong> <code>{result.nonceHex}</code></p>
          <p><em>The student must store both securely — needed to generate proofs later.</em></p>
        </div>
      )}
    </div>
  );
}