# Architecture

KasihCengkring is a static React SPA plus one non-custodial Solidity contract on Arc
Testnet. There is no backend, no database owned by the platform, and no server-side key
that can move funds.

```
┌──────────────────┐            ┌────────────────────────┐
│   Donor wallet   │            │        Creator         │
│ (MetaMask, etc.) │            │  wallet + payout addr  │
└────────┬─────────┘            └───────────┬────────────┘
         │ approve(USDC)                    │ register / update
         │ donate(username, name, msg, amt)  │
         ▼                                  ▼
┌──────────────────────────────────────────────────────────┐
│                   KasihCengkring (Arc)                   │
│  creators[usernameHash] → { payoutAddress, min, bool }   │
│  walletToUsernameHash[wallet] → usernameHash             │
│  balance is always 0 — funds never rest here             │
└────────┬─────────────────────────────────┬───────────────┘
         │ safeTransferFrom(donor → payout)│ events
         │ safeTransferFrom(donor → treasury, fee)
         ▼                                 ▼
┌──────────────────┐            ┌────────────────────────┐
│  USDC (ERC-20)   │            │   Arc Testnet RPC      │
│  6 decimals      │            └───────────┬────────────┘
└──────────────────┘                        │ read / logs
                                            ▼
                     ┌─────────────────────────────────────┐
                     │  React SPA on Netlify CDN           │
                     │  wagmi + viem + ConnectKit          │
                     └───────────────┬─────────────────────┘
                                     │ optional read-only REST
                                     ▼
                     ┌─────────────────────────────────────┐
                     │ Supabase: profiles, donations,      │
                     │ creator-stats edge function         │
                     └─────────────────────────────────────┘
```

## Layers

| Layer | Responsibility | Location |
|---|---|---|
| Contract | Registration, donation transfer and fee split, creator settings, owner cap/pause/fee | `contracts/KasihCengkring.sol` |
| Chain client | Wallet connection, reads, writes, receipts | `src/config.ts`, `src/*.ts` generated modules |
| Presentation | Routes, forms, states, error decoding | `src/pages`, `src/components` |
| Read mirror (optional) | Profiles, donation history, aggregates for UI speed | Supabase REST (env-configured) |
| Hosting | Static assets, SPA fallback, headers | `netlify.toml` |

## On-chain model

**State**

| Slot | Type | Meaning |
|---|---|---|
| `usdc` | `IERC20 immutable` | USDC token used for donations |
| `maxDonation` | `uint256` | Owner-set global ceiling, ≥ floor |
| `treasury` | `address` | Recipient of platform fees; never the contract or the token |
| `feeBps` | `uint16` | Proportional fee in basis points, ≤ `MAX_FEE_BPS` (500) |
| `flatFee` | `uint256` | Flat fee per donation in 6-dec units, ≤ `MAX_FLAT_FEE` (50 000) |
| `creators[usernameHash]` | struct | `payoutAddress`, `minDonation`, `registered` |
| `usernameByHash[usernameHash]` | `string` | Canonical username for events |
| `walletToUsernameHash[wallet]` | `bytes32` | One username per wallet |
| `reservedUsernames[hash]` | `bool` | Brand/route names blocked at deploy |

**Donation flow (two transactions, deliberately)**

1. Donor calls `USDC.approve(KasihCengkring, gross)` — exact gross amount, not unlimited.
2. Donor calls `donate(username, donorName, message, gross)`.
3. Contract validates username, registration, `donorName ≤ 40`, `message ≤ 200`,
   `effectiveMin ≤ gross ≤ maxDonation`, where `effectiveMin = min(creator.min, max)`.
   The minimum is **gross**: the fee is computed after the check.
4. Contract computes `fee = flatFee + gross * feeBps / 10_000` (rounded down) and emits
   `DonationReceived(..., gross, fee, timestamp)`.
5. Two `safeTransferFrom` calls from the donor: `gross - fee` to `payoutAddress`, `fee` to
   `treasury`. The two legs always sum to `gross`, and `treasury` is never `address(this)`.
6. The UI waits for the receipt and links to ArcScan.

Because both legs are paid by the donor from a single gross approval, the donor pays exactly
the amount shown in the form. The fee is visible as a line item before signing — it is not
added on top and it never rests in the contract.

The single-transaction EIP-3009 variant was removed on purpose: `receiveWithAuthorization`
requires the contract as `to`, which creates a nonce front-running / stranded-funds vector
in a contract that has no rescue function. The rationale is repeated in `SECURITY.md` and
in a comment at the removal site, so nobody reintroduces it by accident.

**Creator flow**

- `register(username, payoutAddress, minDonation)` — new wallet, available username, payout
  not zero / the USDC token / the contract itself, min ≥ 0.50 USDC.
- `updatePayoutAddress` — callable **while paused**; creators must always be able to redirect
  incoming funds after a key compromise.
- `updateMinDonation` — paused with donations and registration.
- Usernames are immutable: no rename, transfer, or delete.

The constructor verifies the token has code and exactly 6 decimals before accepting it.
`tryGetCreator(username)` is the non-reverting read for untrusted input, and
`getUsernameByHash(hash)` resolves a hash back to its raw username.

**Owner flow**

- `pause` / `unpause`, `setMaxDonation` (≥ floor).
- `setFee(feeBps, flatFee)` — hard-capped by immutable `MAX_FEE_BPS` (5%) and
  `MAX_FLAT_FEE` (0.05 USDC); reverts above the caps.
- `setTreasury(address)` — must be non-zero and distinct from the token and the contract.
- Ownership is `Ownable2Step`: the new owner must accept.
- `renounceOwnership` is disabled: renouncing while paused would permanently freeze registration
  and donations.
- The owner cannot move funds, change payout addresses, or edit creator data. Fee changes
  apply to future donations only; nothing already transferred is reclaimable.

**Invariant:** the contract's USDC balance is always zero. Every donation splits into exactly
two outbound transfers (creator + treasury) that sum to the gross amount. No rescue function
exists because nothing should ever be inside the contract. Foundry invariant tests enforce
the zero balance, the fee caps, and treasury validity.

## Frontend

**Routes** (`src/App.tsx`)

| Path | Page | Auth |
|---|---|---|
| `/` | LandingPage | none |
| `/app` | AppDashboard — connect, register, stats | wallet |
| `/app/history` | HistoryPage — search, filter, CSV export | wallet |
| `/app/setting` | SettingsPage — payout address, minimum | wallet |
| `/:username` | CreatorPage — public profile + donation form | none |

`/:username` is last so it cannot shadow `/app/*`.

**Providers** (`src/main.tsx`): `WagmiProvider` → `QueryClientProvider` →
`ConnectKitProvider`, plus Sonner toasts and the Arc Studio watermark.

**Network selection** (`src/network.ts`): one build targets one network.
`VITE_ARC_NETWORK=testnet|mainnet` (default `testnet`) picks the chain plus that network's
contract address, deploy block, USDC address, RPC, WSS endpoint, explorer, and wallet-prompt
name. Each value has a `VITE_TESTNET_*` / `VITE_MAINNET_*` variable, so both groups can live
in one `.env` and switching is a one-line change. The legacy single-value names
(`VITE_ARC_RPC_URL`, `VITE_KASIH_ADDRESS`, …) remain as a fallback for `bun run dev:local`.
Testnet builds render a 28 px strip above the header (`TestnetBanner`) with a link to
Circle's faucet; mainnet builds render nothing.

**wagmi config** (`src/config.ts`): the selected Arc chain is the write chain, Ethereum
mainnet is present only for ENS resolution in ConnectKit. Transport is a `fallback` of the
selected WebSocket and HTTP endpoints; there is no platform RPC key. The header network
button reads the chain ID from that RPC and adds/switches the wallet to it, so no manual
network entry is needed. The OBS overlay bypasses wagmi and uses its own read-only client
(`src/lib/overlay-client.ts`): WebSocket `eth_subscribe` for live `DonationReceived` logs,
HTTP for the initial backfill, and HTTP polling if the subscription fails. Only the overlay
keeps a long-lived socket; the rest of the app stays on plain HTTP.

**Data policy**

- Chain reads (`useReadContract`) are authoritative: creator record, min/max, availability,
  allowance, `paused`. The app prefers `tryGetCreator` and `getUsernameByHash`, and falls back
  to `getCreator` / `CreatorRegistered` logs when talking to a deployment that predates them.
- Supabase is a convenience mirror: profile metadata, donation list, aggregate stats. All
  fetches are guarded by the network's `VITE_TESTNET_SUPABASE_URL` / `VITE_MAINNET_SUPABASE_URL`
  and matching anon key, and fail silently to
  empty states. No Supabase credentials are required to donate or register.
- Profile rows are anon-writable, so a row is only used when the chain agrees it belongs to
  the creator: `/:username` resolves the registrant wallet from the `CreatorRegistered` log
  (`usernameHash` is indexed, and `usernameHash = keccak256(bytes(username))`) and then reads
  `profiles` by `wallet_address`. Write side is `src/lib/profiles.ts#syncProfileUsername`,
  which mirrors the chain-confirmed username after registration instead of waiting for the
  creator to press Save in settings.
- Donation history is mirrored, not reconstructed from `eth_getLogs` in the browser, to keep
  the SPA light. The chain remains the audit trail.

**Contract binding** (`src/contract.ts`): address comes from `src/network.ts` for the
selected network (deployed Arc mainnet and testnet instances are built-in defaults); inline
ABI kept in sync with the Solidity surface. `bun run dev:local` writes a fresh local address
plus the testnet-group RPC/deploy block to `.env.localdev` after deploying, and Vite runs
with `--mode localdev` so those values are only applied locally.

**Generated modules** (`onchain-facts.ts`, `onchain-money.ts`, `onchain-wait.ts`,
`tracing.ts`, `console-capture.ts`) come from Arc Studio. They exist to prevent three
classes of bug: wrong chain/token facts, decimal mixing between 6-decimal ERC-20 USDC and
18-decimal native gas USDC, and premature "confirmed" states for Circle-managed transfers.
Do not hand-edit them; regenerate instead.

**Money handling**: amounts are integer `bigint` in 6-decimal units end to end. Parsing goes
through `parseUsdcInput`; display goes through `formatUsdc`. No float arithmetic touches a
value that is submitted on-chain. Donation amounts are **gross**: the form computes
`fee = flatFee + gross * feeBps / 10_000` from live chain reads and shows the net before
signing, while history and CSV carry gross, fee, and net using the `fee` field of the event.

**Error handling**: `decodeRevert` maps custom errors (`AmountBelowMin`, `AmountAboveMax`,
`UsernameTaken`, …) to user-facing text. Transaction steps are explicit
(`approving → approve-pending → approved → donating → donate-pending → done`) so a rejected
wallet prompt never looks like a completed donation.

## Trust boundaries

| Actor | Can | Cannot |
|---|---|---|
| Donor | Donate within limits, read all public state | Move funds elsewhere, reclaim a donation |
| Creator | Set payout + minimum, receive donations | Take another username, rewrite history |
| Owner | Pause, set global max, set fee and treasury within caps, transfer ownership | Touch balances, payout addresses, creator records, or exceed the fee caps |
| Host (Netlify) | Serve JS, observe traffic | Sign transactions, access keys, alter contract state |
| Supabase | Serve mirrored reads | Move funds (anon key is read-scoped by RLS) |

The hosting layer is not trusted with funds. A compromised CDN could show false UI, which is
why the contract state and wallet confirmation screen remain the final authority for users.

## Deployment topology

- One static artifact (`dist/`) on Netlify's CDN, global edge, HTTPS by default.
- SPA rewrite `/* → /index.html` (status 200) makes deep links work; hashed assets are
  served first and cached immutably.
- Security headers (`X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy`) are declared in `netlify.toml`.
- Builds run on Netlify with Bun 1.3.14. `VITE_ARC_NETWORK` is the only variable needed to
  choose Arc Testnet or Arc Mainnet; the deployed contract addresses are built-in defaults.
- Deploy previews per pull request are supported by Netlify by default.

Operations runbook: [DEPLOYMENT.md](DEPLOYMENT.md).

## Known limits and extension points

- **No indexer.** The Supabase mirror is populated out of band; if it is missing, history is
  empty. A real indexer (or an Arc-native indexer) would make history trustless-lite.
- **No username transfer or recovery.** Immutability is a security choice; lost keys mean a
  new username.
- **Payout address is unverified.** Creators can point at an address they do not control;
  there is no on-chain way to reverse that.
- **Testnet only.** Mainnet requires an audit, a compliance review, and probably a cap
  strategy beyond a single owner-set `maxDonation`.
- **Optional backend.** If profiles move fully on-chain later, Supabase can be dropped without
  touching the contract; the UI already treats it as optional.
