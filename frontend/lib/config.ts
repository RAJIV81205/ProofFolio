export type NetworkName = 'local' | 'preprod' | 'preview';

const DEFAULT_NETWORK: NetworkName = 'preview';

function readPublicEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

const NETWORK = ((readPublicEnv('NEXT_PUBLIC_MIDNIGHT_NETWORK') as NetworkName | undefined) ??
  DEFAULT_NETWORK) as NetworkName;

const defaults = {
  local: {
    networkId: 'Undeployed',
    indexerUri: 'http://localhost:8088/api/v3/graphql',
    indexerWsUri: 'ws://localhost:8088/api/v3/graphql/ws',
    proofServerUri: 'http://127.0.0.1:6300',
    nodeUri: 'http://localhost:9944',
  },
  preprod: {
    networkId: 'Preprod',
    indexerUri: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWsUri: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    proofServerUri: 'https://api-preprod.1am.xyz',
    nodeUri: 'wss://rpc.preprod.midnight.network',
  },
  preview: {
    networkId: 'Preview',
    indexerUri: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWsUri: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
    proofServerUri: 'https://api-preview.1am.xyz',
    nodeUri: 'wss://rpc.preview.midnight.network',
  },
} as const;

const activeDefaults = defaults[NETWORK];

export const networkConfig = {
  network: NETWORK,
  networkId: activeDefaults.networkId,
  indexerUri: readPublicEnv('NEXT_PUBLIC_MIDNIGHT_INDEXER_HTTP') ?? activeDefaults.indexerUri,
  indexerWsUri: readPublicEnv('NEXT_PUBLIC_MIDNIGHT_INDEXER_WS') ?? activeDefaults.indexerWsUri,
  proofServerUri:
    readPublicEnv('NEXT_PUBLIC_MIDNIGHT_PROOF_SERVER') ?? activeDefaults.proofServerUri,
  nodeUri: readPublicEnv('NEXT_PUBLIC_MIDNIGHT_NODE_WS') ?? activeDefaults.nodeUri,
} as const;

export type WalletRuntimeConfig = {
  indexerUri: string;
  indexerWsUri: string;
  proofServerUri: string;
  nodeUri: string;
  networkId: string;
};

export function resolveRuntimeConfig(fromWallet: Partial<WalletRuntimeConfig> | null): WalletRuntimeConfig {
  return {
    indexerUri: fromWallet?.indexerUri?.trim() || networkConfig.indexerUri,
    indexerWsUri: fromWallet?.indexerWsUri?.trim() || networkConfig.indexerWsUri,
    proofServerUri: fromWallet?.proofServerUri?.trim() || networkConfig.proofServerUri,
    nodeUri: fromWallet?.nodeUri?.trim() || networkConfig.nodeUri,
    networkId: fromWallet?.networkId?.trim() || networkConfig.network.toLowerCase(),
  };
}
