# KasihCengkring

Non-custodial creator donation platform on **Arc**. Supporters send USDC straight to a
creator's payout address — the contract never holds funds, takes no platform fee, and
donors need no account.

> **Status:** Arc Testnet, unaudited. Use small amounts.
> See [SECURITY.md](SECURITY.md) for the threat model and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
> for how the pieces fit.

---

## What it does

- **Creators** claim a username (`a-z 0-9 _`, 3–20 chars) and point it at a payout address.
  They set their own minimum donation; the owner sets a global cap.
- **Donors** open `/<username>`, approve USDC once, then call `donate()` with an optional
  name and message. Funds move donor → payout address in the same transaction.
- **History** and public profiles read from chain state plus an optional Supabase mirror.
  With no Supabase configured, the app still works — chain reads and event-derived UI are
  the source of truth; profile/history panels simply stay empty.
- **Pause** stops new registrations and donations but never blocks `updatePayoutAddress`:
  creators can always redirect where their money goes.

## Deployed contract

| | |
|---|---|
| Network | Arc Testnet (chain ID `5042002`) |
| Contract | [`0xe9ed1145c0ec41220a1dc6b76bee0b860d078678`](https://explorer.testnet.arc.io/address/0xe9ed1145c0ec41220a1dc6b76bee0b860d078678) |
| Deploy tx | `0x22b996fdac9180b8c25ad84e8313f2875e283b80c4cdf7eca8e89427a607ba12` |
| Deployer | `0xf324b4c7421b21f1ac9926eaf613d192497a0f97` |
| USDC (ERC-20 view) | `0x3600000000000000000000000000000000000000`, 6 decimals |
| `MIN_DONATION_FLOOR` | 0.10 USDC (`100000`) |
| `maxDonation` | 500 USDC (`500000000`) |

Full constructor args and deployment provenance live in
[`contracts/contract-metadata/KasihCengkring.json`](contracts/contract-metadata/KasihCengkring.json).

## Architecture at a glance

```
Donor wallet ──approve + donate()──► KasihCengkring ──safeTransferFrom──► Creator payout
      │                                   │
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

The app targets Arc Testnet. Add the network to your wallet when prompted; the UI offers a
switch button on the wrong chain.

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `VITE_KASIH_ADDRESS` | no | Contract address. Defaults to the deployed Arc Testnet instance. |
| `VITE_SUPABASE_URL` | no | Supabase project URL for profile/history mirror. |
| `VITE_SUPABASE_ANON_KEY` | no | Supabase anon key (RLS must be configured server-side). |

### Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Vite dev server |
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

## Security

The contract is non-custodial, has no proxy, no `delegatecall`, no `selfdestruct`, no
owner rescue path, and is covered by unit, fuzz, and invariant tests. It is **not audited**.
Read [SECURITY.md](SECURITY.md) before putting real funds anywhere near it.
