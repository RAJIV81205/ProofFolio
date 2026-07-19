/**
 * witness.ts — ProofFolio v2  (FIXED)
 *
 * KEY FIX: Every witness function MUST return [privateState, value].
 * The Midnight compact-runtime requires this tuple shape.
 * Returning just `value` (a plain Uint8Array) causes the proof server
 * to receive malformed circuit inputs → "Proof server check failed (400): bad input".
 *
 * Docs reference:
 *   "Each witness function returns a tuple of the updated private state
 *    and the witness value." — Midnight docs, Use the Compact JS Implementation
 */

import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';

// ─────────────────────────────────────────────────────────────────────────────
// Private state shape — carried through every witness call
// ─────────────────────────────────────────────────────────────────────────────

export type ProofFolioPrivateState = {
  readonly studentSecretKey:   Uint8Array;
  readonly issuerSecretKey:    Uint8Array;
  readonly adminSecretKey:     Uint8Array;
  readonly credentialPayload:  Uint8Array;
  readonly credentialNonce:    Uint8Array;
  readonly credentialIssuerPk: Uint8Array;
};

export const createEmptyPrivateState = (): ProofFolioPrivateState => ({
  studentSecretKey:   new Uint8Array(32),
  issuerSecretKey:    new Uint8Array(32),
  adminSecretKey:     new Uint8Array(32),
  credentialPayload:  new Uint8Array(32),
  credentialNonce:    new Uint8Array(32),
  credentialIssuerPk: new Uint8Array(32),
});

// ─────────────────────────────────────────────────────────────────────────────
// Payload layout  (32 bytes, big-endian)
// [0]      degreeType        uint8
// [1-2]    graduationYear    uint16
// [3-6]    institutionId     uint32
// [7-10]   issuedAt          uint32  (unix seconds, 0 = not set)
// [11-14]  validUntil        uint32  (unix seconds, 0 = no expiry)
// [15-31]  zero padding
// ─────────────────────────────────────────────────────────────────────────────

export enum DegreeType {
  BTech   = 0,
  MTech   = 1,
  PhD     = 2,
  MBA     = 3,
  Diploma = 4,
  BCA     = 5,
  MCA     = 6,
  BSc     = 7,
  MSc     = 8,
  BEd     = 9,
  LLB     = 10,
  MBBS    = 11,
  Other   = 255,
}

export const DEGREE_LABELS: Record<number, string> = {
  [DegreeType.BTech]:   'B.Tech',
  [DegreeType.MTech]:   'M.Tech',
  [DegreeType.PhD]:     'Ph.D',
  [DegreeType.MBA]:     'MBA',
  [DegreeType.Diploma]: 'Diploma',
  [DegreeType.BCA]:     'BCA',
  [DegreeType.MCA]:     'MCA',
  [DegreeType.BSc]:     'B.Sc',
  [DegreeType.MSc]:     'M.Sc',
  [DegreeType.BEd]:     'B.Ed',
  [DegreeType.LLB]:     'LLB',
  [DegreeType.MBBS]:    'MBBS',
  [DegreeType.Other]:   'Other',
};

export interface CredentialData {
  degreeType:     DegreeType;
  graduationYear: number;
  institutionId:  number;
  issuedAt:       number;   // unix seconds
  validUntil:     number;   // unix seconds, 0 = no expiry
}

export interface DisclosureSelection {
  degree:        string | null;
  year:          string | null;
  institutionId: string | null;
}

export function packCredential(data: CredentialData): Uint8Array {
  const buf = new Uint8Array(32);
  buf[0]  = data.degreeType & 0xff;
  buf[1]  = (data.graduationYear >> 8) & 0xff;
  buf[2]  = data.graduationYear & 0xff;
  buf[3]  = (data.institutionId >> 24) & 0xff;
  buf[4]  = (data.institutionId >> 16) & 0xff;
  buf[5]  = (data.institutionId >> 8)  & 0xff;
  buf[6]  = data.institutionId & 0xff;
  buf[7]  = (data.issuedAt >> 24) & 0xff;
  buf[8]  = (data.issuedAt >> 16) & 0xff;
  buf[9]  = (data.issuedAt >> 8)  & 0xff;
  buf[10] = data.issuedAt & 0xff;
  buf[11] = (data.validUntil >> 24) & 0xff;
  buf[12] = (data.validUntil >> 16) & 0xff;
  buf[13] = (data.validUntil >> 8)  & 0xff;
  buf[14] = data.validUntil & 0xff;
  return buf;
}

export function unpackCredential(buf: Uint8Array): CredentialData {
  return {
    degreeType:     buf[0] as DegreeType,
    graduationYear: (buf[1] << 8) | buf[2],
    institutionId:  ((buf[3] << 24) | (buf[4] << 16) | (buf[5] << 8) | buf[6]) >>> 0,
    issuedAt:       ((buf[7] << 24) | (buf[8] << 16) | (buf[9] << 8) | buf[10]) >>> 0,
    validUntil:     ((buf[11] << 24) | (buf[12] << 16) | (buf[13] << 8) | buf[14]) >>> 0,
  };
}

export function generateNonce(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

// ─────────────────────────────────────────────────────────────────────────────
// Witness factories  — ALL return [privateState, value] tuples
// ─────────────────────────────────────────────────────────────────────────────

// ── Student witnesses (for presentCredential) ─────────────────────────────

export interface StudentWitnessInputs {
  studentSecretKey:   Uint8Array;
  credentialPayload:  Uint8Array;
  credentialNonce:    Uint8Array;
  credentialIssuerPk: Uint8Array;
}

export function createStudentWitnesses(inputs: StudentWitnessInputs) {
  const ps: ProofFolioPrivateState = {
    ...createEmptyPrivateState(),
    studentSecretKey:   inputs.studentSecretKey,
    credentialPayload:  inputs.credentialPayload,
    credentialNonce:    inputs.credentialNonce,
    credentialIssuerPk: inputs.credentialIssuerPk,
  };

  return {
    // ✅ FIXED: returns [privateState, value] tuple
    studentSecretKey: (ctx: WitnessContext<any, ProofFolioPrivateState>): [ProofFolioPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.studentSecretKey],

    credentialPayload: (ctx: WitnessContext<any, ProofFolioPrivateState>): [ProofFolioPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.credentialPayload],

    credentialNonce: (ctx: WitnessContext<any, ProofFolioPrivateState>): [ProofFolioPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.credentialNonce],

    credentialIssuerPk: (ctx: WitnessContext<any, ProofFolioPrivateState>): [ProofFolioPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.credentialIssuerPk],

    findCredentialPath: (ctx: WitnessContext<any, ProofFolioPrivateState>, commitment: Uint8Array) => {
      const tree = ctx.ledger.credentialCommitments;
      const path = tree.findPathForLeaf(commitment);
      if (!path) throw new Error(
        'Credential commitment not found in Merkle tree. ' +
        'Ensure issueCredential() was confirmed on-chain AND all credential fields ' +
        '(degreeType, graduationYear, institutionId, issuedAt, validUntil, nonce, issuerPk) ' +
        'exactly match what was used during issuance.'
      );
      return [ctx.privateState, path];
    },

    // stubs — not used in this circuit but required by Contract constructor
    adminSecretKey:  (ctx: WitnessContext<any, ProofFolioPrivateState>): [ProofFolioPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.adminSecretKey],
    issuerSecretKey: (ctx: WitnessContext<any, ProofFolioPrivateState>): [ProofFolioPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.issuerSecretKey],
  };
}

// ── Issuer witnesses (for issueCredential, revokeCredential) ──────────────

export interface IssuerWitnessInputs {
  issuerSecretKey: Uint8Array;
}

export function createIssuerWitnesses(inputs: IssuerWitnessInputs) {
  const ps: ProofFolioPrivateState = {
    ...createEmptyPrivateState(),
    issuerSecretKey: inputs.issuerSecretKey,
  };

  return {
    issuerSecretKey: (ctx: WitnessContext<any, ProofFolioPrivateState>): [ProofFolioPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.issuerSecretKey],

    // stubs
    adminSecretKey: (ctx: WitnessContext<any, ProofFolioPrivateState>): [ProofFolioPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.adminSecretKey],
    studentSecretKey: (ctx: WitnessContext<any, ProofFolioPrivateState>): [ProofFolioPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.studentSecretKey],
    credentialPayload: (ctx: WitnessContext<any, ProofFolioPrivateState>): [ProofFolioPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.credentialPayload],
    credentialNonce: (ctx: WitnessContext<any, ProofFolioPrivateState>): [ProofFolioPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.credentialNonce],
    credentialIssuerPk: (ctx: WitnessContext<any, ProofFolioPrivateState>): [ProofFolioPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.credentialIssuerPk],
    findCredentialPath: (ctx: WitnessContext<any, ProofFolioPrivateState>, _commitment: Uint8Array) =>
      [ctx.privateState, { value: _commitment, path: [] }],
  };
}

// ── Admin witnesses (for registerIssuer, deregisterIssuer) ────────────────

export interface AdminWitnessInputs {
  adminSecretKey: Uint8Array;
}

export function createAdminWitnesses(inputs: AdminWitnessInputs) {
  const ps: ProofFolioPrivateState = {
    ...createEmptyPrivateState(),
    adminSecretKey: inputs.adminSecretKey,
  };

  return {
    adminSecretKey: (ctx: WitnessContext<any, ProofFolioPrivateState>): [ProofFolioPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.adminSecretKey],

    // stubs
    issuerSecretKey: (ctx: WitnessContext<any, ProofFolioPrivateState>): [ProofFolioPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.issuerSecretKey],
    studentSecretKey: (ctx: WitnessContext<any, ProofFolioPrivateState>): [ProofFolioPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.studentSecretKey],
    credentialPayload: (ctx: WitnessContext<any, ProofFolioPrivateState>): [ProofFolioPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.credentialPayload],
    credentialNonce: (ctx: WitnessContext<any, ProofFolioPrivateState>): [ProofFolioPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.credentialNonce],
    credentialIssuerPk: (ctx: WitnessContext<any, ProofFolioPrivateState>): [ProofFolioPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.credentialIssuerPk],
    findCredentialPath: (ctx: WitnessContext<any, ProofFolioPrivateState>, _commitment: Uint8Array) =>
      [ctx.privateState, { value: _commitment, path: [] }],
  };
}
