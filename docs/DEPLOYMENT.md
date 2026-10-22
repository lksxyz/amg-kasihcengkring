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

- `netlify.toml` — build, publish directory, SPA rewrite, headers.
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

`bun run build` runs `vite build` only. Type errors are caught by `bun run check` before
pushing, so a Netlify build is not blocked by a lint nit. If you want Netlify to gate on
types, change the build command to `bun run typecheck && vite build`.

## First deploy

### Option A — Git integration (recommended)

1. Push the repo to GitHub/GitLab/Bitbucket.
2. Netlify → **Add new site** → **Import an existing project** → pick the repo.
3. Netlify reads `netlify.toml`; confirm build `bun run build`, publish `dist`.
4. **Site configuration → Environment variables** (optional):
   - `VITE_KASIH_ADDRESS = 0xe9ed1145c0ec41220a1dc6b76bee0b860d078678`
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` if the mirror is enabled.
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

Apply with the Supabase CLI:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Or paste each file into the dashboard SQL editor, in order.

Then set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Netlify (or
`.env.localdev` for local work) and redeploy.

Notes:

- Addresses are stored lowercase; the app normalizes wallet addresses before querying.
- The anon key is public. Writes are currently allowed by RLS because there is no auth
  backend: anyone can edit a profile or hide a donation. Treat these fields as cosmetic and
  move writes behind a signature-verifying edge function before mainnet.
- `donations` is populated by an indexer using the service role; the browser never inserts
  donations.
- `GET /functions/v1/creator-stats` is an edge function and is not created by these
  migrations. Without it, dashboard stats show placeholder values.

## Contract redeploy handoff

1. `bun run contracts:build && bun run contracts:test`
2. Deploy via Arc Studio (`bun run deploy:self`) or the Compass path (`bun run compass:deploy`).
3. Update `contracts/contract-metadata/KasihCengkring.json` with the new address/tx (the
   deploy script writes it).
4. Set `VITE_KASIH_ADDRESS` in Netlify to the new address and redeploy — or update the
   default in `src/contract.ts` and commit.
5. Update the address tables in `README.md` and `SECURITY.md`.
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
| Deep link 404 on refresh | Redirect rule missing/ignored | Confirm `netlify.toml` is at repo root and the site uses it (not UI-only settings) |
| Build fails on `bun` | Bun not installed by Netlify | Keep `BUN_VERSION`; or commit `bunfig.toml` and use `bun run build` explicitly |
| Wallet connects, reads empty | Wrong chain | UI shows a switch prompt; Arc Testnet is chain `5042002` |
| Donation reverts with "donation limit" | Amount outside `effectiveMin..maxDonation` | Check creator min and global cap; UI refetches allowance |
| Registration says username taken | Already registered, reserved, or actually taken | Reserved list is in the contract constructor |
| History empty | Supabase env vars absent or RLS blocks reads | Expected without the mirror; chain data still works |
| Contract link 404 | Explorer base changed | `onchain-facts.ts` is generated; regenerate instead of patching |

## Production requirements

### Contract
- Network: Arc Testnet only today (chain ID `5042002`); there is no Arc mainnet yet.
- Deployer and owner keys on a hardware wallet or multisig. Ownership is `Ownable2Step`.
- Deployer funded with USDC for gas; verify source on ArcScan.
- Update `contracts/contract-metadata/`, plus the address tables in `README.md` and `SECURITY.md`.
- Formal audit before holding real value; the contract is explicitly unaudited.
- Decide `maxDonation` policy and rehearse pause/unpause and ownership transfer.

### Frontend (Netlify)
- Repository connected to a Netlify site; build settings come from `netlify.toml`.
- Required env vars:
  - `VITE_KASIH_ADDRESS` — production contract address (do not ship the testnet default)
  - `VITE_ARC_RPC_URL` — production RPC (HTTPS, CORS enabled, adequate rate limits)
  - `VITE_ARC_CHAIN_NAME`, `VITE_ARC_EXPLORER_URL`
- Optional: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Custom domain + DNS + HTTPS in Netlify.
- Run `bun run typecheck`, `bun run build`, and `forge test` before deploying.
- Decide whether to keep the Arc Studio watermark and the generated diagnostics modules.

### Supabase mirror (optional)
- Create the project, `supabase link`, `supabase db push` (three migrations in `supabase/migrations/`).
- `creator-stats` edge function is not in this repo; without it the dashboard computes stats from chain.
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
4. `creator-stats` implemented, or accept chain-computed stats.
5. Production env vars set for contract and RPC.
6. Bundle secret scan clean.

## Post-deploy checklist

- [ ] `/`, `/app`, `/app/history`, `/app/setting`, `/<username>` all load directly (deep link test).
- [ ] Connect wallet → wrong-chain prompt switches to Arc Testnet.
- [ ] Creator record reads for a known username; footer contract link resolves on ArcScan.
- [ ] Donation flow: approve → donate → explorer transaction link.
- [ ] `dist/assets/*` responses show immutable caching; `index.html` is revalidated.
- [ ] Security headers present (`curl -I`).
- [ ] No secrets in the bundle (`grep -r "service_role" dist/` is empty).
