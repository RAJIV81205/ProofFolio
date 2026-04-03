/**
 * witness.ts
 *
 * Supplies private (off-chain) data to Compact circuits.
 * Nothing in this file ever touches the network — it all stays local.
 *
 * Think of this as the "private data provider" that sits between
 * your local encrypted store and the ZK circuit.
 */

import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export enum DegreeType {
  BTech = 0,
  MTech = 1,
  PhD = 2,
  MBA = 3,
  Diploma = 4,
  BCA = 5,
  MCA = 6,
  BSc = 7,
  MSc = 8,
  Other = 255,
}

export interface CredentialData {
  degreeType: DegreeType;
  graduationYear: number; // e.g. 2022
  institutionId: number; // numeric ID mapped to institution name
}

/**
 * Everything needed by circuits that act on behalf of the STUDENT
 */
export interface StudentWitnessInputs {
  studentSecretKey: Uint8Array; // 32 bytes — keep this secret!
  credentialPayload: Uint8Array; // packed Bytes<32> — see packCredential()
  credentialNonce: Uint8Array; // 32 random bytes — generated at issuance
}

/**
 * Everything needed by circuits that act on behalf of the ISSUER
 */
export interface IssuerWitnessInputs {
  issuerSecretKey: Uint8Array;
}

/**
 * Everything needed by circuits that act on behalf of the ADMIN
 */
export interface AdminWitnessInputs {
  adminSecretKey: Uint8Array;
}

// ─────────────────────────────────────────────────────────────────────────────
// Credential payload packing
// Layout: [degreeType(1)] [year_hi(1)] [year_lo(1)] [institutionId(4)] [pad(25)]
// ─────────────────────────────────────────────────────────────────────────────

export function packCredential(data: CredentialData): Uint8Array {
  const buf = new Uint8Array(32);
  buf[0] = data.degreeType & 0xff;
  buf[1] = (data.graduationYear >> 8) & 0xff;
  buf[2] = data.graduationYear & 0xff;
  buf[3] = (data.institutionId >> 24) & 0xff;
  buf[4] = (data.institutionId >> 16) & 0xff;
  buf[5] = (data.institutionId >> 8) & 0xff;
  buf[6] = data.institutionId & 0xff;
  // bytes 7–31 are zero padding
  return buf;
}

export function unpackCredential(buf: Uint8Array): CredentialData {
  return {
    degreeType: buf[0] as DegreeType,
    graduationYear: (buf[1] << 8) | buf[2],
    institutionId: (buf[3] << 24) | (buf[4] << 16) | (buf[5] << 8) | buf[6],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Nonce generation — call this ONCE at issuance and store the result
// ─────────────────────────────────────────────────────────────────────────────

export function generateNonce(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

// ─────────────────────────────────────────────────────────────────────────────
// Witness factories
// Each returns an object shaped exactly as the Compact contract expects
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Witnesses for the student's proveCredential() circuit
 */
export function createStudentWitnesses(inputs: StudentWitnessInputs) {
  return {
    studentSecretKey: (_ctx: WitnessContext) => inputs.studentSecretKey,

    credentialPayload: (_ctx: WitnessContext) => inputs.credentialPayload,

    credentialNonce: (_ctx: WitnessContext) => inputs.credentialNonce,

    // The JS SDK gives us access to the local Merkle tree state.
    // We search it for the commitment and return the path.
    findCredentialPath: (ctx: WitnessContext, commitment: Uint8Array) => {
      const tree = ctx.ledger.credentialCommitments;
      const path = tree.findPathForLeaf(commitment);
      if (!path) {
        throw new Error(
          "Credential commitment not found in tree. " +
            "Make sure the issuer has issued this credential on-chain.",
        );
      }
      return path;
    },

    // Unused witnesses — provide stubs so the runtime is happy
    adminSecretKey: (_ctx: WitnessContext) => new Uint8Array(32),
    issuerSecretKey: (_ctx: WitnessContext) => new Uint8Array(32),
  };
}

/**
 * Witnesses for the issuer's issueCredential() / revokeCredential() circuits
 */
export function createIssuerWitnesses(inputs: IssuerWitnessInputs) {
  return {
    issuerSecretKey: (_ctx: WitnessContext) => inputs.issuerSecretKey,

    // Stubs for unused witnesses
    adminSecretKey: (_ctx: WitnessContext) => new Uint8Array(32),
    studentSecretKey: (_ctx: WitnessContext) => new Uint8Array(32),
    credentialPayload: (_ctx: WitnessContext) => new Uint8Array(32),
    credentialNonce: (_ctx: WitnessContext) => new Uint8Array(32),
    findCredentialPath: (_ctx: WitnessContext, _c: Uint8Array) => {
      throw new Error("not used");
    },
  };
}

/**
 * Witnesses for admin circuits (registerIssuer, deregisterIssuer)
 */
export function createAdminWitnesses(inputs: AdminWitnessInputs) {
  return {
    adminSecretKey: (_ctx: WitnessContext) => inputs.adminSecretKey,

    // Stubs
    issuerSecretKey: (_ctx: WitnessContext) => new Uint8Array(32),
    studentSecretKey: (_ctx: WitnessContext) => new Uint8Array(32),
    credentialPayload: (_ctx: WitnessContext) => new Uint8Array(32),
    credentialNonce: (_ctx: WitnessContext) => new Uint8Array(32),
    findCredentialPath: (_ctx: WitnessContext, _c: Uint8Array) => {
      throw new Error("not used");
    },
  };
}
