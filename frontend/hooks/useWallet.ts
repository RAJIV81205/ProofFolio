'use client';

import { useCallback, useState } from 'react';
import '@midnight-ntwrk/dapp-connector-api';
import type { Configuration, ConnectionStatus, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';

export type WalletServiceUriConfig = Record<string, unknown>;

export interface WalletState {
  isConnected: boolean;
  walletAddress: string | null;
  serviceUriConfig: WalletServiceUriConfig | null;
  connecting: boolean;
  error: string | null;
}

type ConnectedApi = {
  getShieldedAddresses: () => Promise<{ shieldedAddress: string }>;
  getConfiguration: () => Promise<Configuration>;
  getConnectionStatus: () => Promise<ConnectionStatus>;
};

function getInjectedWallets(): InitialAPI[] {
  if (typeof window === 'undefined' || !window.midnight) return [];

  const wallets = Object.values(window.midnight).filter(
    (entry): entry is InitialAPI =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof entry.connect === 'function' &&
      typeof entry.name === 'string',
  );

  // Prefer Lace when multiple wallets are present.
  wallets.sort((a, b) => {
    const aScore = /lace/i.test(a.name) ? 0 : 1;
    const bScore = /lace/i.test(b.name) ? 0 : 1;
    return aScore - bScore;
  });

  return wallets;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    walletAddress: null,
    serviceUriConfig: null,
    connecting: false,
    error: null,
  });

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true, error: null }));

    try {
      if (typeof window === 'undefined') {
        throw new Error('Wallet can only be connected in a browser.');
      }

      const wallets = getInjectedWallets();
      if (wallets.length === 0) {
        throw new Error(
          'No Midnight wallet detected in browser. Install/enable Lace Midnight extension and reload the page.',
        );
      }

      const selectedWallet = wallets[0];
      const desiredNetwork = process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK ?? 'preprod';
      let connectedApi: ConnectedApi | null = null;
      let lastConnectError: unknown = null;

      for (const network of [desiredNetwork, 'testnet', 'preprod']) {
        try {
          connectedApi = (await selectedWallet.connect(network)) as ConnectedApi;
          break;
        } catch (error) {
          lastConnectError = error;
        }
      }

      if (!connectedApi) {
        const details =
          lastConnectError instanceof Error ? ` (${lastConnectError.message})` : '';
        throw new Error(`Failed to connect wallet "${selectedWallet.name}"${details}`);
      }

      const addresses = await connectedApi.getShieldedAddresses();
      const serviceUriConfig = await connectedApi.getConfiguration();
      const connectionStatus = await connectedApi.getConnectionStatus();

      if (!connectionStatus || connectionStatus.status !== 'connected') {
        throw new Error('Wallet connected but status check failed.');
      }

      setState({
        isConnected: true,
        walletAddress: addresses.shieldedAddress,
        serviceUriConfig: serviceUriConfig ?? null,
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
      connecting: false,
      error: null,
    });
  }, []);

  return { ...state, connect, disconnect };
}
