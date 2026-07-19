# ProofFolio: Privacy-Preserving Academic Credential Verification

> **Tagline:** Verify qualifications, not personal data. Built on the Midnight Network.

---

## ❌ The Problem

Credential fraud is a massive global issue, but current verification systems are broken:
* **Privacy Leakage:** Students are forced to share full academic records (transcripts, DOBs) just to prove a single degree.
* **High Fraud:** PDFs and scanned documents are easily forged.
* **Slow Verification:** Manual background checks take weeks and rely on costly third-party agencies.
* **Replay Attacks:** Once a document is shared, it can be copied or reused maliciously.

## ✅ Our Solution

**ProofFolio** is a privacy-first credential verification protocol built using **Zero-Knowledge Proofs (ZKPs)** on the **Midnight Network**.
It allows universities to issue tamper-proof credentials on-chain. Students can then generate local cryptographic proofs to prove their qualifications to employers *without* revealing their actual personal data.

**One proof. Zero data exposure.**

## 💡 Use Cases

* **Academic Degrees:** Prove graduation year and degree type without sharing grades.
* **Professional Certifications:** Verify active medical, legal, or technical licenses.
* **Skill Badges:** Confirm completion of bootcamps or training programs.
* **KYC / Identity:** (Future scope) Prove age or citizenship without revealing passport details.

## 🛠 Tech Stack

* **Blockchain / Smart Contracts:** Midnight Network, Compact (smart contract language)
* **Zero-Knowledge:** ZK-SNARKs, local ZK circuits, Merkle Tree commitments, Nullifiers
* **Frontend:** React, Next.js (App Router), TypeScript, Tailwind CSS
* **Wallet & Integration:** Lace Wallet, Midnight dApp Connector, Midnight.js

## ✨ Features

* **Authorized Issuer Registry:** Only whitelisted universities can issue credentials to prevent fake institutions.
* **Private Issuance:** Universities only publish a hashed commitment to the blockchain, never the raw data.
* **Instant Verification:** Employers receive a definitive Yes/No response in seconds via blockchain consensus.
* **Replay Protection:** Cryptographic nullifiers ensure that a specific proof cannot be reused.
* **On-Chain Audit Trail:** The ledger publicly tracks the total number of verifications without linking them to individuals.

## 📜 Contract Address

* **Network:** Midnight Preprod
* **Contract Address:** *8131a6c88f0b726c57bcf471cf8831947749e4dc68bd458c3692af73605f74d3*

## 🔐 Privacy Functions

ProofFolio leverages Midnight's data-protecting architecture:
* **Selective Disclosure:** Students only prove the claims the employer asked for.
* **Local Witness Execution:** Private data (student secret keys, raw credential JSON) stays fully local in the wallet/browser.
* **Zero-Knowledge Proofs:** The network verifies the truth of a statement ("This student holds a valid degree") without ever seeing the inputs that make it true.

## 🔄 Application Flows

1. **University Portal (Issuance)**
   * Registers as an authorized issuer.
   * Inputs student details locally.
   * Hashes the credential and posts the commitment to the Midnight ledger.
2. **Student Portal (Proof Generation)**
   * Imports credential package (metadata + secret key).
   * Generates a local ZK proof satisfying the employer's challenge.
   * Never sends private data to the network.
3. **Employer Portal (Verification)**
   * Receives the proof transaction hash from the student.
   * Validates the proof against the Midnight smart contract.
   * Views verified claims instantly on a secure dashboard.

---

## 💻 Developer Guide

### Quick Start
```bash
npm install
npm run compile
cd frontend && npm run dev
```

Open `http://localhost:3000/deploy`, connect the 1AM browser extension on Midnight
preprod, enter the deployment admin secret key, and click **Deploy Contract**.
Deployment uses 1AM's proving, balancing, and submission providers in-browser.
No funded server wallet or local proof server is required. The deployed contract
address appears on the page after submission.
Copy that address into `frontend/.env.local` as
`NEXT_PUBLIC_CONTRACT_ADDRESS` for the issuer, student, employer, and admin portals.

### Testing & Integration
Use the built-in testing suite to run end-to-end ZK transactions logic:
* **URL:** `http://localhost:3000/developer-integration-guide`
* Provides wallet detection, contract ledger reads, and full lifecycle execution (`registerIssuer`, `issueCredential`, `presentCredential`).
