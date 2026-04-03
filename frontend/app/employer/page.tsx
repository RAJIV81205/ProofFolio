 
// ─────────────────────────────────────────────────────────────────────────────
// FILE 5: src/pages/EmployerPage.tsx
// Verifier portal — employer checks if a proof is valid
// ─────────────────────────────────────────────────────────────────────────────
 
import React, { useState, useEffect } from 'react';
import { useWallet }   from '../hooks/useWallet';
import { useContract } from '../hooks/useContract';
 
export function EmployerPage() {
  const wallet   = useWallet();
  const contract = useContract(CONTRACT_ADDRESS, wallet.serviceUriConfig);
 
  const [ledgerState, setLedgerState] = useState<{
    issuanceCount: bigint;
    verificationCount: bigint;
  } | null>(null);
 
  // Fetch public ledger stats on mount (no wallet needed for reads)
  useEffect(() => {
    if (wallet.isConnected) {
      contract.getLedgerState().then(state => {
        if (state) {
          setLedgerState({
            issuanceCount:     state.issuanceCount,
            verificationCount: state.verificationCount,
          });
        }
      });
    }
  }, [wallet.isConnected]);
 
  if (!wallet.isConnected) {
    return (
      <div>
        <h2>Employer / Verifier Portal</h2>
        <button onClick={wallet.connect}>Connect Lace Wallet</button>
      </div>
    );
  }
 
  return (
    <div>
      <h2>Verify Credentials</h2>
 
      {ledgerState && (
        <div>
          <p>Total credentials issued: <strong>{ledgerState.issuanceCount.toString()}</strong></p>
          <p>Total verifications done: <strong>{ledgerState.verificationCount.toString()}</strong></p>
          <p><em>
            Note: These numbers are public. Individual identities, degree types,
            and institutions are NOT visible — only the counts.
          </em></p>
        </div>
      )}
 
      <hr />
      <p>
        To verify a candidate: ask them to share their proof transaction hash.
        Look it up on the Midnight explorer to confirm it called <code>proveCredential()</code>
        on your contract address and succeeded.
      </p>
      <a
        href={`https://explorer.preprod.midnight.network/contracts/${CONTRACT_ADDRESS}`}
        target="_blank"
        rel="noreferrer"
      >
        Open contract on Midnight explorer →
      </a>
    </div>
  );
}
 