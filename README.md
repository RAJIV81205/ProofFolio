# CredZK

## Privacy-Preserving Academic Credential Verification on Midnight

> **Tagline:** Verify qualifications, not personal data.

---

# 1. Project Overview

**CredZK** is a privacy-first academic credential verification protocol built on the **Midnight Network** using **Compact smart contracts** and **zero-knowledge proofs (ZKPs)**.

The platform enables:

* **Universities** to issue tamper-proof academic credentials
* **Students** to prove their qualifications privately
* **Employers** to instantly verify authenticity

Unlike traditional verification systems, CredZK never exposes:

* student names
* marksheets
* transcripts
* DOB
* personal identifiers

Only cryptographic proofs are shared.

---

# 2. Problem Statement

Credential fraud is a massive global issue.

Common problems:

* fake degrees and forged certificates
* slow manual verification process
* privacy leakage through transcript sharing
* employer dependency on third-party verification agencies
* risk of document tampering

Students are often forced to share **full academic records** even when the employer only needs proof of one claim.

Example:

Instead of sharing an entire transcript, employers usually only need:

> "Does this person have a valid Computer Science degree issued after 2020?"

CredZK solves this exact problem.

---

# 3. Why Do We Need This?

This project is needed because modern verification systems lack:

## Privacy

Sensitive data should not be shared unnecessarily.

## Trust

Employers need instant cryptographic trust.

## Speed

Verification should happen in seconds.

## Fraud prevention

Fake credentials must be impossible to forge.

## Replay protection

Previously used proofs should not be reused.

---

# 4. What Problems It Solves

CredZK solves:

* fake degree fraud
* transcript forgery
* identity leakage
* verification delays
* replay attacks
* fake university claims
* unverifiable PDFs / scanned documents

---

# 5. Core Solution

The solution works in 3 layers:

## Issuer Layer

University issues credential hash on-chain.

## Prover Layer

Student generates proof locally.

## Verifier Layer

Employer verifies proof without seeing private data.

---

# 6. Tech Stack

## Blockchain / ZK

* Midnight Network
* Compact smart contracts
* Zero Knowledge Proof circuits
* Merkle Tree commitments
* Nullifier anti-replay logic

## Frontend

* React
* Next.js / Vite
* TypeScript
* Tailwind CSS

## Wallet

* Lace Wallet
* Midnight dApp connector

## Backend / Local Witness

* TypeScript witness providers
* Local encrypted storage

---

# 7. Main Features

## Private credential issuance

Universities issue only commitment hashes.

## Selective disclosure

Students prove only required claims.

## Instant verification

Employers receive valid / invalid response.

## Replay protection

Nullifiers prevent proof reuse.

## Audit trail

Verification count stored on-chain.

## Authorized issuer registry

Only approved universities can issue.

---

# 8. Architecture

## Public Ledger

Stores:

* authorizedIssuers
* credentialCommitments
* usedNullifiers
* verificationCount

## Private Local Storage

Stores:

* studentName
* degreeType
* graduationYear
* secret keys
* nonce

Private data never leaves device.

---

# 9. Smart Contract Design

## Contract Name

`credential_verifier.compact`

## Public Ledgers

```ts
export ledger authorizedIssuers: Set<Bytes<32>>;
export ledger credentialCommitments: HistoricMerkleTree<10, Bytes<32>>;
export ledger usedNullifiers: Set<Bytes<32>>;
export ledger verificationCount: Counter;
```

---

# 10. Contract Functions

## register_issuer()

Registers authorized universities.

```ts
export circuit register_issuer(issuerPk: Bytes<32>): [] {
  authorizedIssuers.insert(disclose(issuerPk));
}
```

## issue_credential()

University issues credential commitment.

```ts
export circuit issue_credential(credData: Bytes<32>, nonce: Bytes<32>): [] {
  const commitment = credentialCommitment(credData, nonce);
  credentialCommitments.insert(disclose(commitment));
}
```

## prove_credential()

Student generates local ZK proof.

```ts
export circuit prove_credential(): [] {
  const nul = credentialNullifier(sk, nonce);
  usedNullifiers.insert(disclose(nul));
  verificationCount.increment(1);
}
```

---

# 11. Witness Layer

## File

`witness.ts`

This layer supplies local private data.

```ts
export interface CredentialStore {
  issuerSecretKey?: Uint8Array;
  studentSecretKey?: Uint8Array;
  credentialData?: Uint8Array;
  credentialNonce?: Uint8Array;
}
```

```ts
export function createWitnesses(store: CredentialStore) {
  return {
    issuerSecretKey: () => store.issuerSecretKey!,
    studentSecretKey: () => store.studentSecretKey!,
    credentialData: () => store.credentialData!,
    credentialNonce: () => store.credentialNonce!
  };
}
```

---

# 12. Frontend User Flow

## Page 1 — University Portal

Input:

* student id
* degree type
* graduation year
* institution

Action:
`issue_credential()`

Output:
credential issued confirmation

---

## Page 2 — Student Portal

* connect wallet
* select credential
* choose proof condition
* generate ZK proof locally
* generate shareable link / QR

---

## Page 3 — Employer Portal

* scan QR / paste proof link
* verify credential
* check freshness
* display result

---

# 13. High-Level Flow

1. University registers
2. Credential issued
3. Commitment stored on-chain
4. Student creates ZK proof
5. Employer verifies
6. Nullifier stored
7. Verification count increments

---

# 14. Included Code Samples

## Frontend deploy flow

```ts
async function connectAndDeploy() {
  const provider = await MidnightProvider.connect();
  const witnesses = createWitnesses(localCredentialStore);
  const contract = new Contract(witnesses);
  return contract.deployTx(provider);
}
```

---

# 15. Why Midnight?

Midnight is ideal because it provides:

* privacy-first smart contracts
* local witness computation
* ZK-native circuits
* secure selective disclosure
* compact contract support

This project directly aligns with Midnight’s strongest use case:

> **private verification systems**

---

# 16. MVP Roadmap

## Phase 1

* issuer registration
* credential issuance
* local witness setup

## Phase 2

* proof generation
* QR sharing
* employer verification

## Phase 3

* dashboard analytics
* institution onboarding
* revocation support

---

# 17. Future Scope

* government certificates
* medical licenses
* skill badges
* professional certificates
* passport verification
* KYC credentials

---

# 18. Submission Pitch

CredZK transforms academic verification from a slow, document-heavy, privacy-invasive process into an instant, cryptographically trusted zero-knowledge protocol.

It ensures trust without disclosure.

**One proof. Zero data exposure.**

---

# 19. One-Click Deployment (Production Flow)

This repository now includes a robust deployment pipeline that follows Midnight docs and real-world ops needs:

* compile contract artifacts if missing
* verify proof server availability (optionally auto-start Docker container)
* create/restore wallet from seed
* wait for funding and DUST readiness
* deploy contract on Midnight
* write `deployment.json`
* update `frontend/.env.local` with contract address

## Commands

```bash
npm install
npm run compile
npm run start-proof-server
npm run deploy
```

## Non-interactive deployment (CI / production automation)

```bash
MIDNIGHT_NETWORK=preprod \
MIDNIGHT_SEED=<64_HEX_SEED> \
CREDZK_ADMIN_KEY=<64_HEX_ADMIN_KEY> \
npm run deploy:non-interactive
```

## Secure defaults

* seed is **never written** to disk by deploy script
* `deployment.json` and `frontend/.env.local` are gitignored
* admin key can be injected via `CREDZK_ADMIN_KEY` instead of prompts
