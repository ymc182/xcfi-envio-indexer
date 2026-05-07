# xcfi-envio-indexer

Envio HyperIndex indexer for the xCFI ERC-4626 vault on Base mainnet.
Replaces the previous Goldsky Instant Subgraph at `xcfi-vault/1.0.0`.

- **Vault address:** `0x77652b905f46ac36d11309b71e2257958cab777d` ([Basescan](https://basescan.org/address/0x77652b905f46ac36d11309b71e2257958cab777d))
- **Chain:** Base (8453)
- **Start block:** 38877193 (vault deployment, 2025-12-01 04:13 UTC)
- **Indexed events:** `Deposit(sender, owner, assets, shares)`, `Withdraw(sender, receiver, owner, assets, shares)`

Consumed by [`investor-frontend`](https://github.com/ymc182/tge) at [`src/App.tsx`](https://github.com/ymc182/tge/blob/main/investor-frontend/src/App.tsx) for the xCFI staking-yield panel.

## Local development

```bash
pnpm install
pnpm dev          # boots Postgres + Hasura + indexer via Docker
```

GraphQL Playground at http://localhost:8080 (admin secret: `testing`).

## Tests

```bash
pnpm test         # mocha unit tests for handlers
pnpm parity       # diffs Envio vs Goldsky for every owner; requires `pnpm dev` running
```

The parity check is the migration's safety gate. It paginates Goldsky and uses
Hasura's `_aggregate { sum }` on Envio so it stays correct for owners with
>1000 events (e.g. the airdrop contract).

## Hosted deployment (Envio Cloud)

Envio Cloud auto-deploys from GitHub on push. Setup is one-time:

1. Visit https://envio.dev/app and install the **Envio Deployments** GitHub
   App on this repo.
2. Push to the `main` branch (or whatever branch is configured in the Envio
   dashboard). Envio runs codegen + builds + indexes from block 38877193 and
   serves the result at a public GraphQL URL.

Once deployed, paste the URL into `investor-frontend/src/config.ts` (or
wherever the dashboard reads it from).

## Schema

```graphql
type XToken_Deposit {
  id: ID!
  sender: String!
  owner: String!
  assets: BigInt!
  shares: BigInt!
  blockNumber: BigInt!
}

type XToken_Withdraw {
  id: ID!
  sender: String!
  receiver: String!
  owner: String!
  assets: BigInt!
  shares: BigInt!
  blockNumber: BigInt!
}
```

Addresses are stored lowercase to match the frontend's
`address.toLowerCase()` filter convention (carried over from Goldsky).

## Frontend query shape

Envio uses Hasura-style GraphQL, so the frontend query differs from Goldsky:

```graphql
query VaultEarnings($user: String!) {
  XToken_Deposit(where: { owner: { _eq: $user } }, limit: 1000) { assets }
  XToken_Withdraw(where: { owner: { _eq: $user } }, limit: 1000) { assets }
}
```

Response shape: `data.XToken_Deposit` / `data.XToken_Withdraw`.

## Hosted endpoint

Production deployment as of 2026-05-07:
`https://indexer.dev.hyperindex.xyz/2df8979/v1/graphql`

The hosted Hasura instance does NOT expose `*_aggregate` query fields — only
direct entity queries. The parity script paginates by `blockNumber` to handle
this and to handle the airdrop wallet (>1000 events).

## Rollback

If the Envio endpoint misbehaves, two-step rollback:

1. Replace `vaultSubgraphUrl` in [`investor-frontend/src/config.ts`](../investor-frontend/src/config.ts)
   with the Goldsky URL:
   ```
   https://api.goldsky.com/api/public/project_cm651vt5aie7401z4ew271x8c/subgraphs/xcfi-vault/1.0.0/gn
   ```
2. Revert the GraphQL query shape in [`investor-frontend/src/App.tsx`](../investor-frontend/src/App.tsx):
   - `XToken_Deposit(where: { owner: { _eq: $user } }, limit: 1000)` → `deposits(where: { owner: $user }, first: 1000)`
   - Same for Withdraw → `withdraws`
   - `data.XToken_Deposit` / `data.XToken_Withdraw` → `data.deposits` / `data.withdraws`

**Caveat:** Goldsky stopped indexing at block 43634240 (~2026-04-09). Any
deposit or withdraw after that is invisible to the rollback path, so user
gain calculations will undercount recent activity.

## Re-running the parity check against the hosted endpoint

```bash
ENVIO_URL=https://indexer.dev.hyperindex.xyz/2df8979/v1/graphql pnpm parity
```

Last verified: 22/22 owners match Goldsky for blocks ≤ 43634240.
