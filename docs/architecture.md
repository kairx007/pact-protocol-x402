# PACT architecture

PACT provides programmable financial authority for autonomous agents. Company funds remain in Monad smart contracts. The Express API coordinates identity checks, dynamic policy evaluation, payment reservations, and settlement; Next.js provides the organization dashboard. MongoDB stores application records. A Viem event watcher initially synchronizes chain events. REST and MCP are the agent integration surfaces.

## Domain model

An Organization is controlled by an Owner and has a Treasury. Agents belong to an Organization. An Agent may have an ERC-8004 Agent Identity, but identity is separate from Capability: an agent can exist without financial authority. A Capability grants bounded authority over a Treasury and token. Policies apply guardrails. A signed Payment Intent requests a transfer; a Reservation temporarily holds funds; a Payment records settlement. An Approval records a human authorization for a specific intent.

## Authority boundary

Smart contracts enforce hard constraints and are the final financial enforcement layer. Dynamic backend policies may impose additional restrictions but can never increase contract-granted authority. Critical dynamic rules require on-chain counters or an attestation from an explicitly trusted policy signer. A backend-only dynamic policy is not trustless.

## Environment separation

Keep contract deployments, token and ERC-8004 registry addresses, RPC endpoints, database namespaces, and relayer credentials separate for local, devnet, testnet, and mainnet. Never infer an unset network constant.
