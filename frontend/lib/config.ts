export type NetworkName = 'local' | 'preprod';

const NETWORK: NetworkName =
  (process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK as NetworkName) ?? 'preprod';

const configs = {
  local: {
    networkId: 'Undeployed',
    indexerUri: 'http://localhost:8088/api/v1/graphql',
    indexerWsUri: 'ws://localhost:8088/api/v1/graphql/ws',
    proofServerUri: 'http://localhost:6300',
    nodeUri: 'http://localhost:9944',
  },
  preprod: {
    networkId: 'Preprod',
    indexerUri: 'https://indexer.preprod.midnight.network/api/v3/graphql',
    indexerWsUri: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
    proofServerUri: 'http://127.0.0.1:6300',
    nodeUri: 'wss://rpc.preprod.midnight.network',
  },
} as const;

export const networkConfig = configs[NETWORK];
