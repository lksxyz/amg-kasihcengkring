# Deployment

Two independent things get deployed:

1. **Contract** — Arc Testnet, deployed through Arc Studio tooling (`bun run deploy:self` or
   `bun run compass:deploy`). Address lives in `contracts/contract-metadata/`.
2. **Web app** — static SPA on Netlify. Built from this repo, no server, no secrets.

This document covers the web app and the handoff between the two.

## Why Netlify and not Alchemy?

Alchemy ([alchemy.run](https://alchemy.run)) is an IaC/Effects framework. Its current
providers cover Cloudflare, AWS, GCP, Fly, Railway, Hetzner, Kubernetes, Neon, PlanetScale,
Turso, and similar targets. **There is no Netlify provider**, so an Alchemy stack cannot
create or update a Netlify site. Using Alchemy here would mean writing and maintaining a
custom provider around Netlify's deploy API for a single static site — more surface than it
removes.

Given the requirements, the deployment surface is:

- `netlify.toml` — build, publish directory, SPA rewrite, headers (applies to Git builds).
- `public/_redirects` + `public/_headers` — the same rewrite and headers *inside* `dist/`, so
  `netlify deploy --dir=dist` keeps them; `netlify.toml` is ignored by CLI and drag-and-drop
  deploys.
- Netlify environment variables — optional contract address override.
- Netlify CLI or Git integration — the actual deploy trigger.

If the target ever changes to Cloudflare, `Cloudflare.Website.Vite` from
`@alchemy.run/cloudflare` becomes a legitimate one-resource replacement; the app itself does
not need code changes.

## Netlify configuration

Committed in [`netlify.toml`](../netlify.toml):

| Setting | Value | Why |
|---|---|---|
| Build command | `bun run build` | Vite production build |
| Publish directory | `dist` | Vite default output |
| `BUN_VERSION` | `1.3.14` | Matches `.bun-version`; Netlify installs it |
| `NODE_VERSION` | `22` | Tooling compatibility for any Node-only binary |
| Redirect | `/* → /index.html` (200) | SPA deep links (`/app`, `/:username`) |
| `/assets/*` | `Cache-Control: max-age=31536000, immutable` | Vite hashes filenames |
| `/index.html` | `max-age=0, must-revalidate` | New deploys are picked up immediately |
| Security headers | `nosniff`, `DENY` framing, referrer policy, permissions policy | Baseline hardening |

The rewrite and headers are declared **twice on purpose**: `netlify.toml` covers Git-connected
builds, and `public/_redirects` / `public/_headers` are copied into `dist/` so a
`netlify deploy --prod --dir=dist` publishes identical behaviour. Netlify only reads those two
files from the published directory, and a site deployed that way ignores `netlify.toml`
entirely — which shows up as a 404 on every deep link and missing security headers.

`bun run build` runs `vite build` only. Type errors are caught by `bun run check` before
pushing, so a Netlify build is not blocked by a lint nit. If you want Netlify to gate on
types, change the build command to `bun run typecheck && vite build`.

## First deploy

### Option A — Git integration (recommended)

1. Push the repo to GitHub/GitLab/Bitbucket.
2. Netlify → **Add new site** → **Import an existing project** → pick the repo.
3. Netlify reads `netlify.toml`; confirm build `bun run build`, publish `dist`.
4. **Site configuration → Environment variables** (optional):
   - `VITE_ARC_NETWORK = testnet` (or `mainnet`)
   - The matching group: `VITE_TESTNET_KASIH_ADDRESS` / `VITE_MAINNET_KASIH_ADDRESS`
     (both default to the deployed instances), deploy block, and RPC if not public.
   - `VITE_TESTNET_SUPABASE_URL` + `VITE_TESTNET_SUPABASE_ANON_KEY` (or the mainnet pair)
     if the mirror is enabled.
5. Deploy. Every push to the production branch redeploys; pull requests get deploy previews.

### Option B — CLI

```bash
bunx netlify-cli login          # browser auth, stores token in ~/.netlify
bunx netlify-cli init           # link this directory to a site
bunx netlify-cli deploy --build --prod
```

`bun run deploy` wraps the last command (it builds before uploading `dist`).

Non-interactive environments need `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`; do not commit
them. `.netlify/` is gitignored.

## Supabase mirror (optional)

Profiles, avatars, and donation history are read through Supabase REST. Without it the app
still runs on chain reads; profile/history panels stay empty.

Migrations live in [`supabase/migrations/`](../supabase/migrations) and are applied in
filename order:

1. `20261022090000_profiles.sql` — profile table, `updated_at` trigger, RLS.
2. `20261022090100_donations.sql` — donation mirror + `hidden` flag, RLS.
3. `20261022090200_avatars_storage.sql` — public `avatars` bucket + upload policies.
4. `20261023000000_donation_fees.sql` — `fee_raw` + generated `net_raw`, so the mirror keeps
   gross, fee, and net after the platform fee landed in the contract.

Apply with the Supabase CLI:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Or paste each file into the dashboard SQL editor, in order.

Then set `VITE_TESTNET_SUPABASE_URL` + `VITE_TESTNET_SUPABASE_ANON_KEY` (or the
`VITE_MAINNET_*` pair) in Netlify (or `.env` for local work) and redeploy. Testnet and
mainnet each have their own Supabase project; apply the migrations to both.

Notes:

- Addresses are stored lowercase; the app normalizes wallet addresses before querying.
- The anon key is public. Writes are currently allowed by RLS because there is no auth
  backend: anyone can edit a profile or hide a donation. Treat these fields as cosmetic and
  move writes behind a signature-verifying edge function before mainnet.
- `donations` is populated by an indexer using the service role; the browser never inserts
  donations.
- `GET /functions/v1/creator-stats` is the aggregation edge function in
  [`supabase/functions/creator-stats/`](../supabase/functions/creator-stats). Deploy it with
  `supabase functions deploy creator-stats --project-ref <ref>`; it needs no extra secret (it
  reads `donations` with the injected anon key, which RLS already opens for select). The client
  calls it automatically once the network's Supabase group is configured; set
  `VITE_TESTNET_CREATOR_STATS_URL` / `VITE_MAINNET_CREATOR_STATS_URL` to override it, or to an
  empty value to disable the call (dashboard stats then come from chain logs).

## Contract redeploy handoff

1. `bun run contracts:build && bun run contracts:test`
2. Deploy via Arc Studio (`bun run deploy:self`) or the Compass path (`bun run compass:deploy`).
3. Update `contracts/contract-metadata/KasihCengkring.json` with the new address/tx (the
   deploy script writes it).
4. Set `VITE_KASIH_ADDRESS` in Netlify to the new address and redeploy — the app ships with
   no default address, so an unset value means "not deployed".
5. Update the deployment section in `README.md` and `AGENTS.md`.
6. Verify in the deployed UI: contract link in the footer, creator read, donation form.

A stale `VITE_KASIH_ADDRESS` is the most common post-redeploy failure: reads hit the old
contract and registration appears broken.

## Rollback

- **UI**: Netlify → Deploys → pick the last good deploy → **Publish deploy**. Instant, no
  rebuild.
- **Contract**: not upgradeable by design. Rollback means deploying a new instance and
  switching `VITE_KASIH_ADDRESS`; existing creator records do not migrate automatically.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Deep link 404 on refresh | Rewrite missing/ignored | `public/_redirects` must be in `dist/`; check `curl -I https://<site>/app` returns 200, not 404 |
| Build fails on `bun` | Bun not installed by Netlify | Keep `BUN_VERSION`; or commit `bunfig.toml` and use `bun run build` explicitly |
| Wallet connects, reads empty | Wrong chain | UI shows a switch prompt; Arc Testnet is chain `5042002` |
| Donation reverts with "donation limit" | Amount outside `effectiveMin..maxDonation` | Check creator min and global cap; UI refetches allowance |
| Registration says username taken | Already registered, reserved, or actually taken | Reserved list is in the contract constructor |
| History empty | Supabase env vars absent or RLS blocks reads | Expected without the mirror; chain data still works |
| Contract link 404 | Explorer base changed | `onchain-facts.ts` is generated; regenerate instead of patching |
| Wallet shows "nonce #N skipped" on Arc Local | Anvil was restarted and dropped pending txs, but the wallet kept its local nonce counter | Clear the account's pending activity in the wallet, then either resend (the wallet re-reads the chain nonce) or realign the chain with `cast rpc anvil_setNonce <addr> <hex-nonce>`. For a clean slate run `ARC_STATE=off bun run dev:local` |

## Production requirements

### Contract
- Network: Arc Testnet only today (chain ID `5042002`); there is no Arc mainnet yet.
- Deployer and owner keys on a hardware wallet or multisig. Ownership is `Ownable2Step`.
- Deployer funded with USDC for gas; verify source on ArcScan.
- Update `contracts/contract-metadata/`, plus the deployment sections in `README.md` and `AGENTS.md`.
- Formal audit before holding real value; the contract is explicitly unaudited.
- Decide `maxDonation` policy and rehearse pause/unpause and ownership transfer.

### Frontend (Netlify)
- Repository connected to a Netlify site; build settings come from `netlify.toml`.
- Required env vars:
  - `VITE_ARC_NETWORK` — `testnet` or `mainnet`; selects the whole group below.
  - `VITE_MAINNET_KASIH_ADDRESS` / `VITE_TESTNET_KASIH_ADDRESS` — usually the built-in default.
  - `VITE_MAINNET_RPC_URL` / `VITE_TESTNET_RPC_URL` — production RPC (HTTPS, CORS enabled,
    adequate rate limits); unset = the public endpoint.
  - `VITE_MAINNET_CHAIN_NAME` / `VITE_MAINNET_EXPLORER_URL` (and the testnet equivalents)
    when the wallet prompt should show a custom name or explorer.
- Optional: `VITE_MAINNET_SUPABASE_URL`, `VITE_MAINNET_SUPABASE_ANON_KEY` (or the testnet
  pair), and `VITE_MAINNET_WSS_URL` / `VITE_TESTNET_WSS_URL` (WebSocket RPC for the overlay
  when the provider uses a different WS host or path than the HTTP RPC).
- Custom domain + DNS + HTTPS in Netlify.
- Run `bun run typecheck`, `bun run build`, and `forge test` before deploying.
- Decide whether to keep the Arc Studio watermark and the generated diagnostics modules.

### Supabase mirror (optional)
- Create one project per network, `supabase link`, `supabase db push` (four migrations in
  `supabase/migrations/`) against each.
- `creator-stats` lives in `supabase/functions/creator-stats/`; deploy it per project. The
  client calls `<project>/functions/v1/creator-stats` automatically, or override with
  `VITE_TESTNET_CREATOR_STATS_URL` / `VITE_MAINNET_CREATOR_STATS_URL`.
- A `DonationReceived` indexer (service role) is needed to populate `donations`; without it the UI
  falls back to `eth_getLogs`, which gets slower and may hit RPC range limits.
- Review RLS before launch: current policies allow anon writes (profiles, `hidden` flag). Move writes
  behind a signature-verifying edge function or make the mirror read-only.
- Never place the `service_role` key in frontend or Netlify's public environment.

### RPC and data
- Public RPCs cap `eth_getLogs` ranges. For production history use a paid RPC, an indexer, or
  chunked queries.
- Confirm the RPC allows requests from the Netlify domain (CORS).
- Configure a backup RPC URL if the primary provider rate-limits.

### Operations
- Uptime/error monitoring for the site and RPC.
- Incident runbook: pause contract, creator payout update, owner `maxDonation` change, contract
  redeploy with a new `VITE_KASIH_ADDRESS`.
- Keep secrets in the host secret manager; the repo only carries `.env.example`.
- Verify no secret leaked into the bundle: `grep -r "service_role" dist/` must be empty.

### Launch blockers
1. Contract audit.
2. Authenticated (or read-only) profile/donation writes in Supabase.
3. Donation indexer or RPC log limits resolved.
4. `creator-stats` deployed per network, or accept chain-computed stats.
5. Service-role `profile-sync` reconciler: evict `profiles` rows whose username belongs to
   another wallet on chain (the anon key cannot delete, so the browser cannot self-heal a
   squatting conflict). Until then pages render without mirrored metadata.
6. Production env vars set for contract and RPC.
7. Bundle secret scan clean.

## Post-deploy checklist

- [ ] `/`, `/app`, `/app/history`, `/app/setting`, `/<username>` all load directly (deep link test).
- [ ] Connect wallet → wrong-chain prompt switches to Arc Testnet.
- [ ] Creator record reads for a known username; footer contract link resolves on ArcScan.
- [ ] Donation flow: approve → donate → explorer transaction link.
- [ ] `dist/assets/*` responses show immutable caching; `index.html` is revalidated.
- [ ] Security headers present (`curl -I`).
- [ ] No secrets in the bundle (`grep -r "service_role" dist/` is empty).
