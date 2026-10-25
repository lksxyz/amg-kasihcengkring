# KasihCengkring

Non-custodial creator donation platform on **Arc**. Supporters send USDC straight to a
creator's payout address. The contract never holds funds and donors need no account; the
only platform revenue is a small fee forwarded to the treasury in the same transaction.

> **Status:** Arc Testnet and Arc Mainnet, unaudited. Use small amounts.
> See [SECURITY.md](SECURITY.md) for the threat model and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
> for how the pieces fit.

---

## What it does

- **Creators** claim a username (`a-z 0-9 _`, 3–20 chars) and point it at a payout address.
  They set their own minimum donation; the owner sets a global cap.
- **Donors** open `/<username>`, approve USDC once, then call `donate()` with an optional
  name and message. Funds move donor → payout address in the same transaction.
- **Platform fee** is `flatFee + feeBps` of every gross donation (default 0.01 USDC + 1%),
  borne by the creator and forwarded to `treasury` in the same transaction. The donor pays
  exactly the amount they type; the contract's balance remains zero.
- **History** and public profiles read from the optional Supabase mirror; donation history
  always comes from Supabase, never an RPC log scan.
  With no Supabase configured, the app still works — chain reads and event-derived UI are
  the source of truth; profile/history panels simply stay empty.
- **Pause** stops new registrations and donations but never blocks `updatePayoutAddress`:
  creators can always redirect where their money goes.
- **Overlay** at `/overlay` (all creators) or `/overlay/<username>` shows each confirmed
  donation as an animated card — donor name, message, and amount — plus a notification sound
  for OBS or any browser source. It streams `DonationReceived` logs over a WebSocket
  (`eth_subscribe`) and falls back to HTTP polling if the socket fails, so it needs no backend
  and no wallet. The route is public; the data it renders is on-chain public anyway.

## Deployed contracts

One build targets one network at a time; `VITE_ARC_NETWORK` selects which. Both
deployments ship as built-in defaults, so the app works without any address variables.

| Network | Chain ID | Contract |
|---|---|---|
| Arc Mainnet | `5042` | `0x4030419B833B8265D8298360B507B2E2B5A0817A` |
| Arc Testnet | `5042002` | `0xbff209b432510373cc5c87d11d1889c42886cbf1` |

| | |
|---|---|
| USDC (ERC-20 view) | `0x3600000000000000000000000000000000000000`, 6 decimals (both networks) |
| `MIN_DONATION_FLOOR` | 0.50 USDC (`500000`) |
| `maxDonation` | 500 USDC (`500000000`) |
| Platform fee | 0.01 USDC + 2%, capped at 0.05 USDC + 5% |
| Treasury | set at deploy; owner-rotatable, never the contract |

Constructor: `(usdc, maxDonation, treasury, feeBps, flatFee, owner)`. `bun run dev:local`
deploys a local instance with `treasury = owner = deployer`, `feeBps = 100`, `flatFee = 10000`.

## Architecture at a glance

```
Donor wallet ──approve + donate()──► KasihCengkring ──safeTransferFrom──► Creator payout
      │                                   ├────────safeTransferFrom──────► Treasury (fee)
      │                             Arc Testnet RPC
      │                                   │
      └──── React SPA (Netlify CDN) ◄─────┘        optional read mirror
                    │                                (Supabase REST)
                    └──────────────────────────────────────► profiles / history
```

The site is a **static SPA**: no backend, no server-held keys, no custody. Every write is
signed by the user's injected wallet (MetaMask and friends) and submitted to Arc Testnet.

Details, sequence diagrams, and module responsibilities: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository layout

```
contracts/
  KasihCengkring.sol        contract source (Solidity 0.8.28, OpenZeppelin 5.1)
  test/                     Foundry unit + fuzz + invariant tests
  script/                   deterministic Create2 deployment helpers
  contract-metadata/        deployment record (address, tx, args)
src/
  pages/                    Landing, dashboard, creator profile, history, settings
  components/               Layout, donation form, skeletons
  config.ts                 wagmi config (Arc Testnet + mainnet for ENS)
  contract.ts               contract address + ABI used by the UI
  onchain-facts.ts          GENERATED chain/token facts (Arc Studio)
  onchain-money.ts          GENERATED USDC decimal-safe math
  onchain-wait.ts           GENERATED Circle transaction state machine
  tracing.ts                GENERATED diagnostics
scripts/                    deploy + ABI fetch tooling
supabase/migrations/        profiles, donations, avatar bucket (optional mirror)
supabase/functions/         creator-stats aggregation edge function
docs/
  ARCHITECTURE.md           system design and data flow
  DEPLOYMENT.md             Netlify deployment and operations
SECURITY.md                 threat model, invariants, static analysis, tests
netlify.toml                build, SPA fallback, security headers
```

Files marked **GENERATED** are written by Arc Studio; edits are overwritten.

## Getting started

Prerequisites: [Bun](https://bun.sh) 1.3+ (pinned in `.bun-version`) and Node 22 if you
prefer npm tooling. Foundry is only needed for contract work.

```bash
bun install
cp .env.example .env      # optional: the deployed address is the built-in default
bun run dev               # http://localhost:5173
```

The app defaults to Arc Testnet. Add the network to your wallet when prompted; the UI offers a
switch button on the wrong chain. To run against Arc Mainnet, set `VITE_ARC_NETWORK=mainnet`
— the network's chain, RPC, contract address, deploy block, explorer, and USDC address all
follow that one value.

### Local full loop (`bun run dev:local`)

One command starts the entire stack locally. It needs the **foundry-arc** fork
(`arc-anvil`), because stock anvil has no Arc system contracts:

```bash
bun run dev:local
```

What it does:

1. Starts `arc-anvil` on `127.0.0.1:8545` with chain ID `5042002` (reuses a node that is
   already running on that port).
2. Deploys `KasihCengkring` with the predeployed USDC (`0x3600…0000`), `maxDonation` 500 USDC,
   and the dev account as owner.
3. Funds `0xEf98df2e76dDA409fdF1F03889d150AAd387E86B` with native gas and ERC-20 USDC so the
   wallet can donate immediately.
4. Writes `.env.localdev` (`VITE_ARC_NETWORK=testnet`, the testnet-group RPC, chain name,
   contract address, and deploy block) and serves the app in Vite mode `localdev` at
   `http://localhost:5173`.
5. The header **Arc Local** button adds and switches MetaMask to that RPC
   (`wallet_addEthereumChain` + `wallet_switchEthereumChain`); the chain ID is read from the
   RPC, not hardcoded. If MetaMask already has a network for the same chain ID with a
   different RPC, the button says so instead of switching silently.

Wallet setup for the local node:

| Field | Value |
|---|---|
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `5042002` |
| Symbol | `USDC` |

Manual entry is optional: use the header network button.

To act as a creator (register, change payout, pause), import the dev owner key printed by the
script. State is in memory: restarting the node wipes it.

If MetaMask complains `RPC endpoint returned too many errors`:

- Use `http://127.0.0.1:8545`, **not** `http://localhost:8545`. On many Linux setups
  `localhost` resolves to IPv6 `::1`, while anvil listens on IPv4 only, so every poll fails.
- Keep `dev:local` running. Stopping/restarting it while MetaMask polls causes the same
  backoff; wait ~10 s or switch networks away and back after the node is up.
- Confirm the node is healthy: `curl -s -X POST -H 'content-type: application/json'
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' http://127.0.0.1:8545`.
- Request logs go to `.dev-local/anvil.log`.

Environment overrides: `ARC_ANVIL`, `ARC_PORT`, `DEV_PORT`, `FUND_ADDRESSES` (comma-separated,
defaults include the demo wallets), `FUND_ADDRESS` (single wallet alias), `FUND_NATIVE`,
`FUND_USDC`. There is no local database: the Supabase mirror is optional, and without it the
UI runs on chain reads alone.

### Environment

Switch networks with a single variable; everything else has a per-network group and a
built-in default.

| Variable | Required | Purpose |
|---|---|---|
| `VITE_ARC_NETWORK` | no | `testnet` (default) or `mainnet`. Selects the chain and the group below. |
| `VITE_TESTNET_KASIH_ADDRESS` | no | Testnet contract. Defaults to the deployed testnet instance. |
| `VITE_TESTNET_KASIH_DEPLOY_BLOCK` | no | Testnet deploy block (log scans start here). |
| `VITE_TESTNET_RPC_URL` / `VITE_TESTNET_WSS_URL` | no | Testnet RPC endpoints. Unset = public endpoints. |
| `VITE_TESTNET_EXPLORER_URL` / `VITE_TESTNET_CHAIN_NAME` | no | Wallet-prompt metadata for testnet. |
| `VITE_TESTNET_USDC_ADDRESS` | no | Testnet USDC override. Defaults to the Arc predeploy. |
| `VITE_MAINNET_KASIH_ADDRESS` | no | Mainnet contract. Defaults to the deployed mainnet instance. |
| `VITE_MAINNET_KASIH_DEPLOY_BLOCK` | no | Mainnet deploy block. |
| `VITE_MAINNET_RPC_URL` / `VITE_MAINNET_WSS_URL` | no | Mainnet RPC endpoints. Unset = public endpoints. |
| `VITE_MAINNET_EXPLORER_URL` / `VITE_MAINNET_CHAIN_NAME` | no | Wallet-prompt metadata for mainnet. |
| `VITE_MAINNET_USDC_ADDRESS` | no | Mainnet USDC override. |
| `VITE_TESTNET_SUPABASE_URL` / `VITE_TESTNET_SUPABASE_ANON_KEY` | no | Testnet mirror project (separate from mainnet). |
| `VITE_MAINNET_SUPABASE_URL` / `VITE_MAINNET_SUPABASE_ANON_KEY` | no | Mainnet mirror project. |
| `VITE_TESTNET_CREATOR_STATS_URL` / `VITE_MAINNET_CREATOR_STATS_URL` | no | Per-network stats endpoint; empty disables it. |

Legacy single-value names (`VITE_ARC_RPC_URL`, `VITE_KASIH_ADDRESS`,
`VITE_KASIH_DEPLOY_BLOCK`, `VITE_ARC_WSS_URL`, `VITE_ARC_CHAIN_NAME`,
`VITE_ARC_EXPLORER_URL`, `VITE_USDC_ADDRESS`) still work as a fallback — mainly for
`bun run dev:local`. Prefer the per-network variables.

### Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Vite dev server |
| `bun run dev:local` | Local Arc node + deploy + funded wallet + Vite (see below) |
| `bun run build` | Production bundle into `dist/` |
| `bun run preview` | Serve the built bundle locally |
| `bun run deploy` | Build, then `netlify deploy --prod` (needs Netlify auth) |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run check` | Lint + typecheck with a per-step timeout |
| `bun run contracts:build` | `forge build` |
| `bun run contracts:test` | `forge test` |
| `bun run fetch:abi <address>` | Pull a verified ABI from the Arc explorer |

## Deploying

Target: **Netlify** (static hosting, SPA fallback, security headers). Config is committed
in `netlify.toml`; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full runbook.

```bash
# one-time
bunx netlify-cli login
bunx netlify-cli init            # link this repo to a site

# deploy
bunx netlify-cli deploy --build --prod
```

Netlify build settings are already declared: build `bun run build`, publish `dist`,
Bun `1.3.14`, SPA rewrite `/* → /index.html`, immutable caching for `/assets/*`.

> **Why not alchemy.run?** Alchemy (IaC) has no Netlify provider — its hosting providers
> are Cloudflare, AWS, GCP, Fly, Railway, Hetzner and Kubernetes. Since Netlify is the
> chosen target and this app has no other cloud resources, plain `netlify.toml` is the
> whole deployment surface. If the project later needs IaC, the natural move is
> `Cloudflare.Website.Vite`, which changes the host. See
> [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#why-netlify-and-not-alchemy).

## Optional Supabase mirror

`supabase/migrations/` contains the profile, donation (with the fee split), and avatar-bucket
schema, plus `supabase/functions/creator-stats` for dashboard aggregates. Apply the schema
with `supabase db push` (or paste the files in order into the SQL editor), deploy the function
with `supabase functions deploy creator-stats`, then set the network's Supabase group
(`VITE_TESTNET_SUPABASE_*` or `VITE_MAINNET_SUPABASE_*`). See
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#supabase-mirror-optional).

## Security

The contract is non-custodial, has no proxy, no `delegatecall`, no `selfdestruct`, no
owner rescue path, and is covered by unit, fuzz, and invariant tests. It is **not audited**.
Read [SECURITY.md](SECURITY.md) before putting real funds anywhere near it.
