# PACT threat model (foundation)

## Assets

- Organization treasury funds and contract-enforced capabilities.
- Agent signing keys, owner approval credentials, and relayer credentials.
- Payment intents, nonces, reservations, policy decisions, and audit records.
- ERC-8004 identity bindings and environment configuration.

## Trust boundaries and controls

- **Contracts vs backend:** contracts enforce hard budgets, per-payment caps, expiry, and revocation. Backend dynamic rules can only reject or request review. Critical changing limits need on-chain counters or a trusted signer attestation.
- **Agent vs API:** validate every request with Zod, verify typed signatures, bind signatures to chain, contract, nonce, recipient, token, amount, and expiry, and reject replayed intents.
- **Identity vs authority:** verify ERC-8004 identity independently; identity verification alone never grants capability.
- **Owner vs agent:** human approvals are scoped to one payment intent and cannot silently become reusable capability.
- **Database vs chain:** MongoDB is an application record and index, not proof of settlement. Reconcile indexed state against chain events and make processing idempotent.
- **Environment vs environment:** isolate addresses, RPCs, databases, and relayer credentials. Load secrets only from environment or a secret manager; never commit them.
- **Logs vs sensitive data:** use structured request IDs for traceability while excluding private keys, bearer credentials, and unnecessary personal data.

## Phase 1 open items

Verify Monad Devnet chain ID from official network information before populating it. Define concrete contract interfaces, signature domain fields, nonce policy, and reservation semantics in their owning phases before implementation depends on them.
