# Platform fee on donations, forwarded to a treasury

**Status:** accepted (2026-10-23)

KasihCengkring originally had no fee logic, which left the platform with no revenue. The
contract is not upgradeable and usernames are not transferable, so adding a fee means new
source and a fresh deployment — there is no in-place migration to reason about.

We charge a platform fee on every donation: a flat component plus a proportional component,
both hard-capped by immutable constants, forwarded to a treasury address in the same
transaction. The donor approves the gross amount; the contract performs two `safeTransferFrom`
calls (net → payout, fee → treasury) that sum to the gross. The fee is borne entirely by the
creator, shown in the donation form before signing, and can only be raised by the owner up to
the deploy-time caps (5% + 0.05 USDC).

## Considered options

- **Monetize outside the donation path** (subscriptions, premium creator tools, sponsorship).
  Kept an absolute no-fee promise, but produces slow, opt-in revenue that is hard to
  demonstrate and easy for a creator to ignore.
- **Accumulate fees in the contract and withdraw later.** Simpler to write, but it makes the
  contract a custodian, breaks the "balance is always zero" invariant, and adds a withdraw
  function — a new owner-drain surface the design deliberately avoids.
- **Migrate existing creators with an owner-run batch registration.** Smoother for creators,
  but it gives the owner write access to creator records, which changes the trust model far
  more than a fee does.

## Consequences

- The product can no longer claim "no platform fee". The replacement claim — no custody, fee
  forwarded in the same transaction, capped forever at deploy — has to hold consistently in
  the README, the landing page, the security docs, and the glossary.
- `MIN_DONATION_FLOOR` is 0.50 USDC so the flat component does not consume a double-digit
  share of the smallest allowed donation.
- `DonationReceived` carries a `fee` field, so the Supabase mirror and CSV export expose
  gross/fee/net columns.
- There is no deployed instance carrying this logic yet. Until one exists, `VITE_KASIH_ADDRESS`
  is unset, the UI reports the app as not deployed, and `bun run dev:local` is the only way to
  exercise the full flow.
