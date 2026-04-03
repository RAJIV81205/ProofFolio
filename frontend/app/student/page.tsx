// ─────────────────────────────────────────────────────────────────────────────
// FILE 4: src/pages/StudentPage.tsx
// Student portal — generate a ZK proof and share it with employers
// ─────────────────────────────────────────────────────────────────────────────
 
import React, { useState } from 'react';
import { useWallet }   from '../hooks/useWallet';
import { useContract } from '../hooks/useContract';
import { DegreeType }  from '../lib/witness';
 
export function StudentPage() {
  const wallet   = useWallet();
  const contract = useContract(CONTRACT_ADDRESS, wallet.serviceUriConfig);
 
  const [nonceHex, setNonceHex]   = useState('');
  const [degreeType, setDegreeType] = useState(DegreeType.BTech);
  const [gradYear, setGradYear]   = useState(2022);
  const [txHash, setTxHash]       = useState<string | null>(null);
 
  // Student secret key — in production, derived from Lace wallet signing
  const studentSecretKey = new Uint8Array(32).fill(2); // placeholder
 
  const handleProve = async () => {
    const res = await contract.proveCredential(
      studentSecretKey,
      { degreeType, graduationYear: gradYear, institutionId: 1001 },
      nonceHex,
    );
    if (res.txHash) setTxHash(res.txHash);
  };
 
  if (!wallet.isConnected) {
    return (
      <div>
        <h2>Student Portal</h2>
        <button onClick={wallet.connect}>Connect Lace Wallet</button>
      </div>
    );
  }
 
  return (
    <div>
      <h2>Prove Your Credential</h2>
      <p>This generates a ZK proof on your device. Nothing personal goes on-chain.</p>
 
      <select value={degreeType} onChange={e => setDegreeType(Number(e.target.value))}>
        <option value={DegreeType.BTech}>B.Tech</option>
        <option value={DegreeType.MTech}>M.Tech</option>
        <option value={DegreeType.PhD}>PhD</option>
      </select>
 
      <input
        type="number"
        value={gradYear}
        onChange={e => setGradYear(Number(e.target.value))}
        placeholder="Graduation Year"
      />
 
      <input
        value={nonceHex}
        onChange={e => setNonceHex(e.target.value)}
        placeholder="Nonce (from university, hex)"
      />
 
      <button onClick={handleProve} disabled={contract.loading || !nonceHex}>
        {contract.loading ? 'Generating proof (takes ~20s)...' : 'Generate ZK Proof'}
      </button>
 
      {contract.error && <p style={{ color: 'red' }}>Error: {contract.error}</p>}
 
      {txHash && (
        <div>
          <p>✅ Proof submitted! Share this tx hash with the employer:</p>
          <code>{txHash}</code>
        </div>
      )}
    </div>
  );
}