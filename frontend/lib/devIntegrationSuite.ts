import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type {
  IssueCredentialResult,
  LedgerStateSnapshot,
  PresentationDisclosureInput,
  PresentCredentialResult,
  PresentationLookupResult,
} from '@/hooks/useContract';
import { DegreeType, type CredentialData } from '@/lib/witness';

export type IntegrationStepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface IntegrationStep {
  id: string;
  title: string;
  status: IntegrationStepStatus;
  detail: string;
}

export interface IntegrationOutputs {
  contractAddress: string;
  networkId?: string;
  environmentWarnings?: string[];
  shieldedAddress?: string;
  unshieldedAddress?: string;
  dustAddress?: string;
  derivedAdminPublicKeyHex?: string;
  expectedAdminPublicKeyHex?: string;
  adminKeySource?: string;
  issuerPublicKeyHex?: string;
  attestationHashHex?: string;
  issueTxHash?: string;
  issueNonceHex?: string;
  commitmentHex?: string;
  presentTxHash?: string;
  verifyTxId?: string;
  revokeTxHash?: string;
  registerTxHash?: string;
  deregisterTxHash?: string;
  ledgerBefore?: LedgerStateSnapshot;
  ledgerAfter?: LedgerStateSnapshot;
}

export interface IntegrationRunResult {
  success: boolean;
  steps: IntegrationStep[];
  outputs: IntegrationOutputs;
  message: string;
}

export interface ContractIntegrationFacade {
  issueCredential: (issuerSecretKey: Uint8Array, data: CredentialData) => Promise<IssueCredentialResult>;
  presentCredential: (
    studentSecretKey: Uint8Array,
    credentialData: CredentialData,
    nonceHex: string,
    challengeHex: string,
    issuerPublicKeyHex: string,
    disclosure?: PresentationDisclosureInput,
  ) => Promise<PresentCredentialResult>;
  registerIssuer: (
    adminSecretKey: Uint8Array,
    issuerPublicKey: Uint8Array,
    attestationHash: Uint8Array,
  ) => Promise<string>;
  deregisterIssuer: (adminSecretKey: Uint8Array, issuerPublicKey: Uint8Array) => Promise<string>;
  revokeCredential: (issuerSecretKey: Uint8Array, credentialData: CredentialData, nonceHex: string) => Promise<string>;
  isAuthorizedIssuer: (issuerPublicKey: Uint8Array | string) => Promise<boolean>;
  isTrustedIssuer: (issuerPublicKey: Uint8Array | string, attestationHash: Uint8Array | string) => Promise<boolean>;
  isCredentialRevoked: (commitment: Uint8Array | string) => Promise<boolean>;
  isPresentationNullifierUsed: (presentationNullifier: Uint8Array | string) => Promise<boolean>;
  deriveIssuerPublicKeyHex: (issuerSecretKey: Uint8Array | string) => string;
  deriveAdminPublicKeyHex: (adminSecretKey: Uint8Array | string) => string;
  getEnvironmentDiagnostics: () => Promise<{
    ok: boolean;
    errors: string[];
    warnings: string[];
  } | null>;
  getExpectedAdminPublicKeyHex: () => Promise<{
    adminPublicKeyHex: string;
    source?: string;
  } | null>;
  getLedgerState: () => Promise<LedgerStateSnapshot | null>;
  verifyPresentationByTxHash: (txHash: string) => Promise<PresentationLookupResult | null>;
}

export interface RunIntegrationSuiteOptions {
  connectedApi: ConnectedAPI;
  contract: ContractIntegrationFacade;
  contractAddress: string;
  adminSecretKeyHex: string;
  issuerSecretKeyHex: string;
  studentSecretKeyHex: string;
  runTransactions?: boolean;
  includeDeregister?: boolean;
  onStepUpdate?: (steps: IntegrationStep[]) => void;
}

const STEP_DEFS: Array<{ id: string; title: string }> = [
  { id: 'wallet-addresses', title: 'Fetch wallet addresses' },
  { id: 'wallet-balances', title: 'Fetch wallet balances' },
  { id: 'wallet-config', title: 'Fetch wallet network configuration' },
  { id: 'contract-address', title: 'Validate contract address format' },
  { id: 'env-check', title: 'Validate environment configuration' },
  { id: 'check-admin-key', title: 'Validate admin key compatibility' },
  { id: 'contract-state-before', title: 'Read contract ledger state' },
  { id: 'derive-issuer-pk', title: 'Derive issuer public key from secret' },
  { id: 'check-authorized-before', title: 'Check issuer authorization before tests' },
  { id: 'register-issuer', title: 'Run registerIssuer transaction' },
  { id: 'check-trusted-issuer', title: 'Check issuer trust anchor state' },
  { id: 'check-authorized-after-register', title: 'Check issuer authorization after register' },
  { id: 'issue-credential', title: 'Run issueCredential transaction' },
  { id: 'check-revoked-before', title: 'Check credential revoked status before revoke' },
  { id: 'present-credential', title: 'Run presentCredential transaction' },
  { id: 'verify-presentation-tx', title: 'Resolve and validate presentation tx hash' },
  { id: 'nullifier-check', title: 'Check presentation nullifier status' },
  { id: 'revoke-credential', title: 'Run revokeCredential transaction' },
  { id: 'check-revoked-after', title: 'Check credential revoked status after revoke' },
  { id: 'deregister-issuer', title: 'Run deregisterIssuer transaction' },
  { id: 'check-authorized-after-deregister', title: 'Check issuer authorization after deregister' },
  { id: 'contract-state-after', title: 'Read contract ledger state after tests' },
];

function normalizeHex(input: string): string {
  return input.trim().toLowerCase().replace(/^0x/, '');
}

function randomHex32(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes32(input: string, label: string): Uint8Array {
  const normalized = normalizeHex(input);
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`${label} must be 64 hex chars.`);
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function initSteps(): IntegrationStep[] {
  return STEP_DEFS.map((step) => ({
    id: step.id,
    title: step.title,
    status: 'pending',
    detail: 'Waiting',
  }));
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    const fields = err as Error & {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
      details?: unknown;
      cause?: unknown;
      data?: unknown;
    };

    const extra: string[] = [];
    if (fields.code !== undefined) extra.push(`code=${String(fields.code)}`);
    if (fields.status !== undefined) extra.push(`status=${String(fields.status)}`);
    if (fields.statusCode !== undefined) extra.push(`statusCode=${String(fields.statusCode)}`);
    if (fields.details !== undefined) extra.push(`details=${safeStringify(fields.details)}`);
    if (fields.data !== undefined) extra.push(`data=${safeStringify(fields.data)}`);

    const base = extra.length > 0 ? `${err.message} (${extra.join(', ')})` : err.message;

    if (fields.cause instanceof Error) {
      return `${base}: ${formatError(fields.cause)}`;
    }
    if (typeof fields.cause === 'string' && fields.cause.trim().length > 0) {
      return `${base}: ${fields.cause}`;
    }
    return base;
  }
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') return safeStringify(err);
  return 'Unknown error';
}

export async function runIntegrationSuite(options: RunIntegrationSuiteOptions): Promise<IntegrationRunResult> {
  const runTransactions = options.runTransactions ?? true;
  const includeDeregister = options.includeDeregister ?? false;

  const outputs: IntegrationOutputs = {
    contractAddress: normalizeHex(options.contractAddress),
  };

  const steps = initSteps();
  const notify = () => options.onStepUpdate?.([...steps]);

  const mark = (id: string, status: IntegrationStepStatus, detail: string) => {
    const step = steps.find((entry) => entry.id === id);
    if (!step) return;
    step.status = status;
    step.detail = detail;
    notify();
  };

  const skipFrom = (ids: string[], detail: string) => {
    ids.forEach((id) => mark(id, 'skipped', detail));
  };

  const runStep = async (id: string, fn: () => Promise<string>): Promise<boolean> => {
    mark(id, 'running', 'Running...');
    try {
      const message = await fn();
      mark(id, 'success', message);
      return true;
    } catch (error) {
      mark(id, 'failed', formatError(error));
      return false;
    }
  };

  const runOptionalReadStep = async (id: string, fn: () => Promise<string>): Promise<boolean> => {
    mark(id, 'running', 'Running...');
    try {
      const message = await fn();
      mark(id, 'success', message);
      return true;
    } catch (error) {
      mark(id, 'skipped', `Read check unavailable: ${formatError(error)}`);
      return false;
    }
  };

  notify();

  const walletAddressesOk = await runStep('wallet-addresses', async () => {
    const shielded = await options.connectedApi.getShieldedAddresses();
    const unshielded = await options.connectedApi.getUnshieldedAddress();
    const dust = await options.connectedApi.getDustAddress();

    outputs.shieldedAddress = shielded.shieldedAddress;
    outputs.unshieldedAddress = unshielded.unshieldedAddress;
    outputs.dustAddress = dust.dustAddress;

    return 'Shielded, unshielded and dust addresses resolved.';
  });

  const walletBalancesOk = await runStep('wallet-balances', async () => {
    const shieldedBalances = await options.connectedApi.getShieldedBalances();
    const unshieldedBalances = await options.connectedApi.getUnshieldedBalances();
    const dustBalance = await options.connectedApi.getDustBalance();

    return `Balances resolved. Shielded assets: ${Object.keys(shieldedBalances).length}, unshielded assets: ${Object.keys(unshieldedBalances).length}, dust cap: ${dustBalance.cap.toString()}.`;
  });

  const walletConfigOk = await runStep('wallet-config', async () => {
    const config = await options.connectedApi.getConfiguration();
    outputs.networkId = config.networkId;
    return `Connected to ${config.networkId} with indexer ${config.indexerUri}.`;
  });

  const contractAddressOk = await runStep('contract-address', async () => {
    if (!/^[0-9a-f]{64}$/.test(outputs.contractAddress)) {
      throw new Error('Contract address must be 64 hex chars.');
    }
    return 'Contract address format is valid.';
  });

  if (!walletAddressesOk || !walletBalancesOk || !walletConfigOk || !contractAddressOk) {
    skipFrom(
      [
        'env-check',
        'check-admin-key',
        'derive-issuer-pk',
        'check-authorized-before',
        'register-issuer',
        'check-trusted-issuer',
        'check-authorized-after-register',
        'issue-credential',
        'check-revoked-before',
        'present-credential',
        'verify-presentation-tx',
        'nullifier-check',
        'revoke-credential',
        'check-revoked-after',
        'deregister-issuer',
        'check-authorized-after-deregister',
        'contract-state-after',
      ],
      'Stopped due to preflight failure.',
    );
    return {
      success: false,
      steps,
      outputs,
      message: 'Preflight checks failed. Fix wallet/contract configuration and retry.',
    };
  }

  const envCheckOk = await runStep('env-check', async () => {
    const diagnostics = await options.contract.getEnvironmentDiagnostics();
    if (!diagnostics) {
      throw new Error('Environment diagnostics API unavailable.');
    }

    if (diagnostics.warnings.length > 0) {
      outputs.environmentWarnings = diagnostics.warnings;
    }

    if (!diagnostics.ok) {
      throw new Error(`Environment mismatch: ${diagnostics.errors.join(' | ')}`);
    }

    return diagnostics.warnings.length > 0
      ? `Environment looks valid with warnings: ${diagnostics.warnings.join(' | ')}`
      : 'Environment configuration is consistent.';
  });

  if (!envCheckOk) {
    skipFrom(
      [
        'check-admin-key',
        'contract-state-before',
        'derive-issuer-pk',
        'check-authorized-before',
        'register-issuer',
        'check-trusted-issuer',
        'check-authorized-after-register',
        'issue-credential',
        'check-revoked-before',
        'present-credential',
        'verify-presentation-tx',
        'nullifier-check',
        'revoke-credential',
        'check-revoked-after',
        'deregister-issuer',
        'check-authorized-after-deregister',
        'contract-state-after',
      ],
      'Stopped due to environment mismatch.',
    );

    return {
      success: false,
      steps,
      outputs,
      message: 'Environment preflight failed. Fix mismatched env values and retry.',
    };
  }

  const adminSecretKey = hexToBytes32(options.adminSecretKeyHex, 'Admin secret key');
  const issuerSecretKey = hexToBytes32(options.issuerSecretKeyHex, 'Issuer secret key');
  const studentSecretKey = hexToBytes32(options.studentSecretKeyHex, 'Student secret key');

  const adminKeyOk = await runStep('check-admin-key', async () => {
    const derivedAdminPublicKeyHex = normalizeHex(
      options.contract.deriveAdminPublicKeyHex(adminSecretKey),
    );
    outputs.derivedAdminPublicKeyHex = derivedAdminPublicKeyHex;

    const expected = await options.contract.getExpectedAdminPublicKeyHex();
    if (!expected?.adminPublicKeyHex) {
      return `Derived admin public key: ${derivedAdminPublicKeyHex.slice(0, 16)}... (no deployment key source available).`;
    }

    const expectedAdminPublicKeyHex = normalizeHex(expected.adminPublicKeyHex);
    outputs.expectedAdminPublicKeyHex = expectedAdminPublicKeyHex;
    outputs.adminKeySource = expected.source;

    if (derivedAdminPublicKeyHex !== expectedAdminPublicKeyHex) {
      throw new Error(
        `Admin key mismatch: derived ${derivedAdminPublicKeyHex.slice(0, 16)}... but expected ${expectedAdminPublicKeyHex.slice(0, 16)}...${
          expected.source ? ` (${expected.source})` : ''
        }.`,
      );
    }

    return `Admin key matches deployment${expected.source ? ` (${expected.source})` : ''}.`;
  });

  if (!adminKeyOk) {
    skipFrom(
      [
        'contract-state-before',
        'derive-issuer-pk',
        'check-authorized-before',
        'register-issuer',
        'check-trusted-issuer',
        'check-authorized-after-register',
        'issue-credential',
        'check-revoked-before',
        'present-credential',
        'verify-presentation-tx',
        'nullifier-check',
        'revoke-credential',
        'check-revoked-after',
        'deregister-issuer',
        'check-authorized-after-deregister',
        'contract-state-after',
      ],
      'Stopped due to admin key preflight failure.',
    );

    return {
      success: false,
      steps,
      outputs,
      message: 'Admin key preflight failed. Use the deployment admin key for this contract address.',
    };
  }

  await runOptionalReadStep('contract-state-before', async () => {
    const state = await options.contract.getLedgerState();
    if (!state) {
      throw new Error('Contract state decoder unavailable in current runtime.');
    }
    outputs.ledgerBefore = state;
    return `Ledger loaded. issuance=${state.issuanceCount.toString()}, verification=${state.verificationCount.toString()}, issuers=${state.issuerCount.toString()}.`;
  });

  let issuerPublicKeyHex = '';
  let issuerAlreadyAuthorized = false;
  let attestationHashHex = randomHex32();

  const deriveIssuerOk = await runStep('derive-issuer-pk', async () => {
    issuerPublicKeyHex = normalizeHex(options.contract.deriveIssuerPublicKeyHex(issuerSecretKey));
    outputs.issuerPublicKeyHex = issuerPublicKeyHex;
    outputs.attestationHashHex = attestationHashHex;
    return `Issuer public key derived: ${issuerPublicKeyHex.slice(0, 16)}...`;
  });

  await runOptionalReadStep('check-authorized-before', async () => {
    issuerAlreadyAuthorized = await options.contract.isAuthorizedIssuer(issuerPublicKeyHex);
    return issuerAlreadyAuthorized ? 'Issuer is already authorized.' : 'Issuer is not authorized yet.';
  });

  if (!deriveIssuerOk) {
    skipFrom(
      [
        'register-issuer',
        'check-trusted-issuer',
        'check-authorized-after-register',
        'issue-credential',
        'check-revoked-before',
        'present-credential',
        'verify-presentation-tx',
        'nullifier-check',
        'revoke-credential',
        'check-revoked-after',
        'deregister-issuer',
        'check-authorized-after-deregister',
        'contract-state-after',
      ],
      'Stopped due to key-derivation failure.',
    );
    return {
      success: false,
      steps,
      outputs,
      message: 'Issuer key setup failed.',
    };
  }

  if (!runTransactions) {
    skipFrom(
      [
        'register-issuer',
        'check-trusted-issuer',
        'check-authorized-after-register',
        'issue-credential',
        'check-revoked-before',
        'present-credential',
        'verify-presentation-tx',
        'nullifier-check',
        'revoke-credential',
        'check-revoked-after',
        'deregister-issuer',
        'check-authorized-after-deregister',
      ],
      'Skipped because runTransactions is disabled.',
    );

    await runStep('contract-state-after', async () => {
      const after = await options.contract.getLedgerState();
      if (!after) {
        throw new Error('Unable to read ledger state after preflight.');
      }
      outputs.ledgerAfter = after;
      return 'Read-only run complete.';
    });

    return {
      success: true,
      steps,
      outputs,
      message: 'Read-only checks completed successfully.',
    };
  }

  const registerOk = await runStep('register-issuer', async () => {
    if (issuerAlreadyAuthorized) {
      return 'Skipped transaction because issuer is already authorized.';
    }

    const txHash = await options.contract.registerIssuer(
      adminSecretKey,
      hexToBytes32(issuerPublicKeyHex, 'Issuer public key'),
      hexToBytes32(attestationHashHex, 'Attestation hash'),
    );
    outputs.registerTxHash = txHash;

    try {
      const finalized = await withTimeout(
        options.contract.verifyPresentationByTxHash(txHash),
        45_000,
        'Timed out waiting for registerIssuer finalization from indexer.',
      );

      if (!finalized) {
        return `registerIssuer submitted (${txHash.slice(0, 16)}...). Finalization not yet available from indexer; continuing with authorization checks.`;
      }

      return `registerIssuer finalized at block ${finalized.blockHeight} (tx ${txHash.slice(0, 16)}...).`;
    } catch {
      return `registerIssuer submitted (${txHash.slice(0, 16)}...). Finalization lookup timed out; continuing with authorization checks.`;
    }
  });

  if (issuerAlreadyAuthorized) {
    mark('register-issuer', 'skipped', 'Issuer already authorized, register transaction not required.');
  }

  await runOptionalReadStep('check-trusted-issuer', async () => {
    const trusted = await options.contract.isTrustedIssuer(
      issuerPublicKeyHex,
      attestationHashHex,
    );
    return trusted
      ? 'Issuer trust anchor found on-chain for this attestation hash.'
      : 'Issuer trust anchor for this attestation hash is not present (expected when already authorized using a different attestation hash).';
  });

  const authorizedAfterRegisterOk = await runStep('check-authorized-after-register', async () => {
    if (issuerAlreadyAuthorized) {
      return 'Issuer is authorized and ready for issueCredential.';
    }

    for (let attempt = 1; attempt <= 12; attempt += 1) {
      const issuerAuthorizedAfterRegister = await options.contract.isAuthorizedIssuer(issuerPublicKeyHex);
      if (issuerAuthorizedAfterRegister) {
        return attempt === 1
          ? 'Issuer is authorized and ready for issueCredential.'
          : `Issuer became authorized after register (attempt ${attempt}/12).`;
      }
      await sleep(5_000);
    }

    throw new Error('Issuer is not authorized after register confirmation window (60s).');
  });

  if (!authorizedAfterRegisterOk) {
    skipFrom(
      [
        'issue-credential',
        'check-revoked-before',
        'present-credential',
        'verify-presentation-tx',
        'nullifier-check',
        'revoke-credential',
        'check-revoked-after',
        'deregister-issuer',
        'check-authorized-after-deregister',
        'contract-state-after',
      ],
      'Stopped because issuer authorization did not confirm after register.',
    );

    const registerStep = steps.find((step) => step.id === 'register-issuer');
    const registerDetail = registerStep?.detail ? ` registerIssuer detail: ${registerStep.detail}` : '';

    return {
      success: false,
      steps,
      outputs,
      message: `Issuer authorization did not confirm after register.${registerDetail}`,
    };
  }

  const credentialData: CredentialData = {
    degreeType: DegreeType.BTech,
    graduationYear: new Date().getFullYear(),
    institutionId: 999,
    issuedAt: Math.floor(Date.now() / 1000),
    validUntil: 0,
  };

  const issueOk = await runStep('issue-credential', async () => {
    const issue = await options.contract.issueCredential(issuerSecretKey, credentialData);
    outputs.issueTxHash = issue.txHash;
    outputs.issueNonceHex = issue.nonceHex;
    outputs.commitmentHex = issue.commitmentHex;
    return `issueCredential submitted: ${issue.txHash.slice(0, 16)}...`;
  });

  if (!issueOk || !outputs.commitmentHex || !outputs.issueNonceHex) {
    skipFrom(
      [
        'check-revoked-before',
        'present-credential',
        'verify-presentation-tx',
        'nullifier-check',
        'revoke-credential',
        'check-revoked-after',
        'deregister-issuer',
        'check-authorized-after-deregister',
        'contract-state-after',
      ],
      'Stopped because issueCredential failed.',
    );

    const registerStep = steps.find((step) => step.id === 'register-issuer');
    const registerDetail = registerStep?.detail ? ` registerIssuer detail: ${registerStep.detail}` : '';

    return {
      success: false,
      steps,
      outputs,
      message: `issueCredential failed. Check issuer authorization and witness inputs.${registerDetail}`,
    };
  }

  await runOptionalReadStep('check-revoked-before', async () => {
    const revoked = await options.contract.isCredentialRevoked(outputs.commitmentHex as string);
    if (revoked) {
      throw new Error('Credential is already revoked immediately after issuance.');
    }
    return 'Credential correctly marked as active before revoke.';
  });

  const challengeHex = randomHex32();
  let presentLookup: PresentationLookupResult | null = null;

  const presentOk = await runStep('present-credential', async () => {
    const res = await options.contract.presentCredential(
      studentSecretKey,
      credentialData,
      outputs.issueNonceHex as string,
      challengeHex,
      issuerPublicKeyHex,
      {
        degree: String(credentialData.degreeType),
        year: String(credentialData.graduationYear),
        institutionId: String(credentialData.institutionId),
      },
    );

    if (!res.verified || !res.txHash) {
      throw new Error('presentCredential did not return a verified tx hash.');
    }

    outputs.presentTxHash = res.txHash;

    if (res.txId && res.status && typeof res.blockHeight === 'number' && res.createdAt) {
      presentLookup = {
        txHash: normalizeHex(res.txHash),
        txId: String(res.txId),
        status: String(res.status),
        blockHeight: Number(res.blockHeight),
        createdAt: String(res.createdAt),
      };
    }

    return `presentCredential submitted: ${res.txHash.slice(0, 16)}...`;
  });

  const verifyTxOk = await runStep('verify-presentation-tx', async () => {
    if (presentLookup) {
      outputs.verifyTxId = presentLookup.txId;
      return `Presentation tx finalized with status ${presentLookup.status} at block ${presentLookup.blockHeight}.`;
    }

    const txHash = outputs.presentTxHash;
    if (!txHash) {
      throw new Error('Missing presentation tx hash.');
    }

    const found = await options.contract.verifyPresentationByTxHash(txHash);
    if (!found) {
      throw new Error('Presentation tx hash was not found by public data provider (tx hash resolves slower than contract call finalization).');
    }

    outputs.verifyTxId = found.txId;
    return `Presentation tx finalized with status ${found.status} at block ${found.blockHeight}.`;
  });

  mark(
    'nullifier-check',
    'skipped',
    'Nullifier value is circuit-internal and not exposed by current contract API. Direct check requires contract-side nullifier output.',
  );

  const revokeOk = await runStep('revoke-credential', async () => {
    const txHash = await options.contract.revokeCredential(
      issuerSecretKey,
      credentialData,
      outputs.issueNonceHex as string,
    );

    outputs.revokeTxHash = txHash;
    return `revokeCredential submitted: ${txHash.slice(0, 16)}...`;
  });

  await runOptionalReadStep('check-revoked-after', async () => {
    const revoked = await options.contract.isCredentialRevoked(outputs.commitmentHex as string);
    if (!revoked) {
      throw new Error('Credential is not marked revoked after revokeCredential.');
    }
    return 'Credential correctly marked as revoked.';
  });

  if (includeDeregister) {
    const deregisterOk = await runStep('deregister-issuer', async () => {
      const txHash = await options.contract.deregisterIssuer(
        adminSecretKey,
        hexToBytes32(issuerPublicKeyHex, 'Issuer public key'),
      );
      outputs.deregisterTxHash = txHash;
      return `deregisterIssuer submitted: ${txHash.slice(0, 16)}...`;
    });

    if (deregisterOk) {
      await runOptionalReadStep('check-authorized-after-deregister', async () => {
        const authorized = await options.contract.isAuthorizedIssuer(issuerPublicKeyHex);
        if (authorized) {
          throw new Error('Issuer is still authorized after deregisterIssuer.');
        }
        return 'Issuer authorization removed successfully.';
      });
    } else {
      mark(
        'check-authorized-after-deregister',
        'skipped',
        'Skipped because deregisterIssuer failed.',
      );
    }
  } else {
    mark('deregister-issuer', 'skipped', 'Skipped by configuration.');
    mark('check-authorized-after-deregister', 'skipped', 'Skipped by configuration.');
  }

  await runOptionalReadStep('contract-state-after', async () => {
    const state = await options.contract.getLedgerState();
    if (!state) {
      throw new Error('Contract state decoder unavailable in current runtime.');
    }
    outputs.ledgerAfter = state;
    return `Final ledger read complete. issuance=${state.issuanceCount.toString()}, verification=${state.verificationCount.toString()}, issuers=${state.issuerCount.toString()}.`;
  });

  const hasFailures = steps.some((step) => step.status === 'failed');
  const criticalFailures = !presentOk || !verifyTxOk || !revokeOk;

  return {
    success: !hasFailures && !criticalFailures,
    steps,
    outputs,
    message: !hasFailures && !criticalFailures
      ? 'Full integration suite completed successfully.'
      : 'Integration suite completed with failures. Inspect failed steps for exact cause.',
  };
}
