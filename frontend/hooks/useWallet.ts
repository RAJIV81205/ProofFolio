// ─────────────────────────────────────────────────────────────────────────────
// FILE 1: src/hooks/useWallet.ts
// Connects to Lace wallet via the DApp Connector API
// ─────────────────────────────────────────────────────────────────────────────
 
import { useState, useCallback } from 'react';
import '@midnight-ntwrk/dapp-connector-api';
import type { ServiceUriConfig } from '@midnight-ntwrk/dapp-connector-api';
 
export interface WalletState {
  isConnected:      boolean;
  walletAddress:    string | null;
  serviceUriConfig: ServiceUriConfig | null;
  connecting:       boolean;
  error:            string | null;
}
 
export function useWallet() {
  const [state, setState] = useState<WalletState>({
    isConnected:      false,
    walletAddress:    null,
    serviceUriConfig: null,
    connecting:       false,
    error:            null,
  });
 
  const connect = useCallback(async () => {
    setState(s => ({ ...s, connecting: true, error: null }));
    try {
      // window.midnight.mnLace is injected by the Lace browser extension
      const wallet = window.midnight?.mnLace;
      if (!wallet) throw new Error('Lace wallet not found. Install the extension first.');
 
      // Connect to preprod (change to 'undeployed' for local Devnet)
      const connectedApi = await wallet.connect('preprod');
 
      const addresses         = await connectedApi.getShieldedAddresses();
      const serviceUriConfig  = await connectedApi.getConfiguration();
      const connectionStatus  = await connectedApi.getConnectionStatus();
 
      if (!connectionStatus) throw new Error('Wallet connected but status check failed.');
 
      setState({
        isConnected:      true,
        walletAddress:    addresses.shieldedAddress,
        serviceUriConfig: serviceUriConfig ?? null,
        connecting:       false,
        error:            null,
      });
    } catch (err) {
      setState(s => ({
        ...s,
        connecting: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, []);
 
  const disconnect = useCallback(() => {
    setState({
      isConnected:      false,
      walletAddress:    null,
      serviceUriConfig: null,
      connecting:       false,
      error:            null,
    });
  }, []);
 
  return { ...state, connect, disconnect };
}
 
 