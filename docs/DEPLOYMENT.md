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

## Post-deploy checklist

- [ ] `/`, `/app`, `/app/history`, `/app/setting`, `/<username>` all load directly (deep link test).
- [ ] Connect wallet → wrong-chain prompt switches to Arc Testnet.
- [ ] Creator record reads for a known username; footer contract link resolves on ArcScan.
- [ ] Donation flow: approve → donate → explorer transaction link.
- [ ] `dist/assets/*` responses show immutable caching; `index.html` is revalidated.
- [ ] Security headers present (`curl -I`).
- [ ] No secrets in the bundle (`grep -r "service_role" dist/` is empty).
