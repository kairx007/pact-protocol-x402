# PACT

Programmable financial authority for autonomous agents.

This monorepo is the foundation for PACT's Monad contracts, Express and TypeScript API, Next.js dashboard, MongoDB records, TypeScript SDK, and MCP integration.

## Development

- Node.js 22 and pnpm 10.20.0
- Install dependencies: `pnpm install`
- Quality checks: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`

See [architecture](docs/architecture.md), [threat model](docs/threat-model.md), and [API specification](docs/api-spec.yaml) for Phase 1 shared decisions.

## Solidity contracts

Install Foundry, then run `cd packages/contracts && forge fmt --check && forge build && forge test -vvv`. Contract tests use local ERC-20 and ERC-8004 mocks; they do not require RPC credentials or deployed contracts.

Protect `main` with required CI checks and reviewed pull requests. Store secrets only in local environment files (ignored by Git) or a managed secret store.
