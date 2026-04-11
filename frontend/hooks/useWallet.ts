'use client';

import { useCallback, useState } from 'react';
import '@midnight-ntwrk/dapp-connector-api';
import type {
  Configuration,
  ConnectedAPI,
  ConnectionStatus,
  InitialAPI,
} from '@midnight-ntwrk/dapp-connector-api';

export type WalletServiceUriConfig = {
  indexerUri: string;
  indexerWsUri: string;
  proofServerUri: string;
  nodeUri: string;
  networkId: string;
};

export interface WalletState {
  isConnected: boolean;
  walletAddress: string | null;
  serviceUriConfig: WalletServiceUriConfig | null;
  connectedApi: ConnectedAPI | null;
  connecting: boolean;
  error: string | null;
}

function detectWallet(): Promise<InitialAPI | null> {
  return new Promise((resolve) => {
    const wallet = window.midnight?.['1am'];
    if (wallet) { resolve(wallet); return; }

    let attempts = 0;
    const interval = setInterval(() => {
      const w = window.midnight?.['1am'];
      if (w) { clearInterval(interval); resolve(w); }
      else if (++attempts > 50) { clearInterval(interval); resolve(null); }
    }, 100);
  });
}

function mapRuntimeConfiguration(config: Configuration): WalletServiceUriConfig {
  return {
    indexerUri: config.indexerUri,
    indexerWsUri: config.indexerWsUri,
    proofServerUri: config.proverServerUri ?? '',
    nodeUri: config.substrateNodeUri,
    networkId: config.networkId,
  };
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    walletAddress: null,
    serviceUriConfig: null,
    connectedApi: null,
    connecting: false,
    error: null,
  });

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true, error: null }));

    try {
      if (typeof window === 'undefined') {
        throw new Error('Wallet can only be connected in a browser.');
      }

const wallet = await detectWallet();
      if (!wallet) {
        throw new Error(
          'No 1AM wallet detected in browser. Install/enable the 1AM Midnight extension and reload the page.',
        );
      }

      const desiredNetwork = process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK ?? 'preview';
      let connectedApi: ConnectedAPI;
      try {
        connectedApi = await wallet.connect(desiredNetwork);
      } catch (error) {
        const details = error instanceof Error ? ` (${error.message})` : '';
        throw new Error(
          `Failed to connect wallet "${wallet.name}" to network "${desiredNetwork}"${details}`,
        );
      }

      const addresses = await connectedApi.getShieldedAddresses();
      const configuration = await connectedApi.getConfiguration();
      const connectionStatus = (await connectedApi.getConnectionStatus()) as ConnectionStatus;

      if (!connectionStatus || connectionStatus.status !== 'connected') {
        throw new Error('Wallet connected but status check failed.');
      }

      setState({
        isConnected: true,
        walletAddress: addresses.shieldedAddress,
        serviceUriConfig: mapRuntimeConfiguration(configuration),
        connectedApi,
        connecting: false,
        error: null,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        connecting: false,
        error: err instanceof Error ? err.message : 'Unknown wallet error',
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({
      isConnected: false,
      walletAddress: null,
      serviceUriConfig: null,
      connectedApi: null,
      connecting: false,
      error: null,
    });
  }, []);

  return { ...state, connect, disconnect };
}
