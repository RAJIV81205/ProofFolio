import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  adminSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  issuerSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  studentSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  credentialPayload(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  credentialNonce(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  credentialIssuerPk(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  findCredentialPath(context: __compactRuntime.WitnessContext<Ledger, PS>,
                     commitment_0: Uint8Array): [PS, { leaf: Uint8Array,
                                                       path: { sibling: { field: bigint
                                                                        },
                                                               goes_left: boolean
                                                             }[]
                                                     }];
}

export type ImpureCircuits<PS> = {
  registerIssuer(context: __compactRuntime.CircuitContext<PS>,
                 issuerPk_0: Uint8Array,
                 attestationHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  deregisterIssuer(context: __compactRuntime.CircuitContext<PS>,
                   issuerPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  issueCredential(context: __compactRuntime.CircuitContext<PS>,
                  payload_0: Uint8Array,
                  nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  updateCredential(context: __compactRuntime.CircuitContext<PS>,
                   oldPayload_0: Uint8Array,
                   oldNonce_0: Uint8Array,
                   newPayload_0: Uint8Array,
                   newNonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokeCredential(context: __compactRuntime.CircuitContext<PS>,
                   payload_0: Uint8Array,
                   nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  presentCredential(context: __compactRuntime.CircuitContext<PS>,
                    verifierChallenge_0: Uint8Array,
                    disclosedDegree_0: bigint,
                    disclosedYear_0: bigint,
                    disclosedInstitutionId_0: bigint,
                    discloseDegree_0: boolean,
                    discloseYear_0: boolean,
                    discloseInstitutionId_0: boolean,
                    currentTime_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  isAuthorizedIssuer(context: __compactRuntime.CircuitContext<PS>,
                     issuerPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  isTrustedIssuer(context: __compactRuntime.CircuitContext<PS>,
                  issuerPk_0: Uint8Array,
                  attestationHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  isCredentialIssued(context: __compactRuntime.CircuitContext<PS>,
                     commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  isCredentialActive(context: __compactRuntime.CircuitContext<PS>,
                     commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  isCredentialRevoked(context: __compactRuntime.CircuitContext<PS>,
                      commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  isPresentationNullifierUsed(context: __compactRuntime.CircuitContext<PS>,
                              presentationNullifier_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
}

export type ProvableCircuits<PS> = {
  registerIssuer(context: __compactRuntime.CircuitContext<PS>,
                 issuerPk_0: Uint8Array,
                 attestationHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  deregisterIssuer(context: __compactRuntime.CircuitContext<PS>,
                   issuerPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  issueCredential(context: __compactRuntime.CircuitContext<PS>,
                  payload_0: Uint8Array,
                  nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  updateCredential(context: __compactRuntime.CircuitContext<PS>,
                   oldPayload_0: Uint8Array,
                   oldNonce_0: Uint8Array,
                   newPayload_0: Uint8Array,
                   newNonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokeCredential(context: __compactRuntime.CircuitContext<PS>,
                   payload_0: Uint8Array,
                   nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  presentCredential(context: __compactRuntime.CircuitContext<PS>,
                    verifierChallenge_0: Uint8Array,
                    disclosedDegree_0: bigint,
                    disclosedYear_0: bigint,
                    disclosedInstitutionId_0: bigint,
                    discloseDegree_0: boolean,
                    discloseYear_0: boolean,
                    discloseInstitutionId_0: boolean,
                    currentTime_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  isAuthorizedIssuer(context: __compactRuntime.CircuitContext<PS>,
                     issuerPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  isTrustedIssuer(context: __compactRuntime.CircuitContext<PS>,
                  issuerPk_0: Uint8Array,
                  attestationHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  isCredentialIssued(context: __compactRuntime.CircuitContext<PS>,
                     commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  isCredentialActive(context: __compactRuntime.CircuitContext<PS>,
                     commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  isCredentialRevoked(context: __compactRuntime.CircuitContext<PS>,
                      commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  isPresentationNullifierUsed(context: __compactRuntime.CircuitContext<PS>,
                              presentationNullifier_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  registerIssuer(context: __compactRuntime.CircuitContext<PS>,
                 issuerPk_0: Uint8Array,
                 attestationHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  deregisterIssuer(context: __compactRuntime.CircuitContext<PS>,
                   issuerPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  issueCredential(context: __compactRuntime.CircuitContext<PS>,
                  payload_0: Uint8Array,
                  nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  updateCredential(context: __compactRuntime.CircuitContext<PS>,
                   oldPayload_0: Uint8Array,
                   oldNonce_0: Uint8Array,
                   newPayload_0: Uint8Array,
                   newNonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokeCredential(context: __compactRuntime.CircuitContext<PS>,
                   payload_0: Uint8Array,
                   nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  presentCredential(context: __compactRuntime.CircuitContext<PS>,
                    verifierChallenge_0: Uint8Array,
                    disclosedDegree_0: bigint,
                    disclosedYear_0: bigint,
                    disclosedInstitutionId_0: bigint,
                    discloseDegree_0: boolean,
                    discloseYear_0: boolean,
                    discloseInstitutionId_0: boolean,
                    currentTime_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  isAuthorizedIssuer(context: __compactRuntime.CircuitContext<PS>,
                     issuerPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  isTrustedIssuer(context: __compactRuntime.CircuitContext<PS>,
                  issuerPk_0: Uint8Array,
                  attestationHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  isCredentialIssued(context: __compactRuntime.CircuitContext<PS>,
                     commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  isCredentialActive(context: __compactRuntime.CircuitContext<PS>,
                     commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  isCredentialRevoked(context: __compactRuntime.CircuitContext<PS>,
                      commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  isPresentationNullifierUsed(context: __compactRuntime.CircuitContext<PS>,
                              presentationNullifier_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
}

export type Ledger = {
  authorizedIssuers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  issuerTrustAnchors: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  credentialCommitments: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  issuedCredentials: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  revokedCredentials: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  usedPresentationNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  readonly adminKey: Uint8Array;
  readonly issuanceCount: bigint;
  readonly verificationCount: bigint;
  readonly lastChallengeHash: Uint8Array;
  readonly lastDisclosedDegree: bigint;
  readonly lastDisclosedYear: bigint;
  readonly lastDisclosedInstitutionId: bigint;
  readonly lastDisclosedDegreePresent: boolean;
  readonly lastDisclosedYearPresent: boolean;
  readonly lastDisclosedInstitutionIdPresent: boolean;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
