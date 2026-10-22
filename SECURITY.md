# KasihCengkring — Security Model

> **NOT AUDITED.** This contract has not received a formal third-party security audit.
> Use small amounts. Do not send funds you cannot afford to lose.

---

## Overview

KasihCengkring is a non-custodial USDC creator donation platform deployed on Arc Testnet
(`0xe9ed1145c0ec41220a1dc6b76bee0b860d078678`).
Funds flow directly from donor to creator payout address via `safeTransferFrom`.
The contract **never holds funds at rest** — its USDC balance is always zero.

---

## Architecture

| Property | Value |
|---|---|
| Solidity | `0.8.28` exact (pinned) |
| OpenZeppelin | `5.1.0` (Paris-compatible) |
| EVM target | Paris (Arc requirement) |
| Proxy / upgradeability | None |
| `delegatecall` | None |
| `selfdestruct` | None |
| `tx.origin` | None |
| Platform fee | None |
| Rescue function | None (by design — contract never holds funds) |
| EIP-2612 / EIP-3009 | Not used (see rationale below) |

---

## Threat Model

### Assets at risk

- **Donor USDC**: pre-approved `amount` for the `donate()` call. The approval is exact-amount and consumed immediately by `safeTransferFrom`. No residual allowance remains after a successful donation.
- **Creator payout address**: where donations are sent. Creator controls it via `updatePayoutAddress`.

### Trust boundaries

| Actor | Capabilities | Cannot |
|---|---|---|
| **Owner** | Pause/unpause, `setMaxDonation` | Move/freeze/redirect funds, change payout addresses, delete records |
| **Creator** | Register username, set payout address and minimum, update both | Claim another creator's username; change another creator's settings |
| **Donor** | Call `donate()` (requires prior USDC approval) | Donate below effectiveMin or above maxDonation |
| **Anyone** | Read all public state (username availability, creator info, min/max) | — |

### Key invariants

1. **Contract USDC balance is always zero.** `donate()` transfers from `msg.sender` directly to `creator.payoutAddress` — never through `address(this)`. Verified by fuzz invariant test.
2. **Usernames are immutable once registered.** No transfer, rename, or delete.
3. **One username per wallet.** `walletToUsernameHash[msg.sender] != bytes32(0)` check enforces this.
4. **Payout address can always be changed** even when paused, so creators are never locked out of redirecting funds.

---

## Security Controls

### Reentrancy

`nonReentrant` (OpenZeppelin `ReentrancyGuard`) on all state-changing external functions.
`donate()` follows checks-effects-interactions: all storage reads are cached before the event is emitted,
and the `safeTransferFrom` interaction is last.
Covered by `test_ReentrancyGuard_DonateBlocksReentrantDonate`.

### Access control

`Ownable2Step`: ownership transfer requires the new owner to explicitly accept (`acceptOwnership()`).
This prevents accidental ownership transfers to wrong addresses.
Covered by `test_Ownable2Step_*` tests.

### Pausing

`Pausable` blocks `register`, `donate`, and `updateMinDonation` when paused.
`updatePayoutAddress` is intentionally **not** paused — creators must always be able to redirect funds.
Covered by `test_Pause_*` and `test_Unpause_*` tests.

### Donation limits

- `MIN_DONATION_FLOOR` = 0.10 USDC — immutable constant.
- `maxDonation` — owner-set, must be ≥ floor. **Risk control only, not AML.** Compliance is the operator's responsibility.
- `effectiveMin = min(creator.minDonation, maxDonation)` — when owner lowers `maxDonation` below a creator's personal min, donations are bounded by `maxDonation` on both sides.
- All boundary conditions covered by fuzz test `testFuzz_donateSucceedsIffInRange`.

### Input validation

- Username: `a-z 0-9 _`, 3–20 chars, uppercase rejected (not converted), checked byte-by-byte.
- Payout address: cannot be `address(0)`, `address(usdc)`, or `address(this)`.
- `donorName`: ≤ 40 bytes.
- `message`: ≤ 200 bytes.
- Reserved usernames: admin, support, help, root, system, moderator, mod, owner, kasih, cengkring, kasihcengkring, donate, tip, about, faq, app, api, www, mail, static, assets, images.

### EIP-3009 rationale

`donateWithAuthorization` (EIP-3009 `receiveWithAuthorization`) was evaluated and rejected.
`receiveWithAuthorization` requires `address(this)` as the `to` field in the authorization.
This means anyone can front-run the `donateWithAuthorization` call and consume the nonce,
leaving the donation stranded — but since the contract never holds funds, the USDC would need
to have been sent separately, which opens a fund-lock vector. With no rescue function (by design),
any USDC accidentally sent to the contract would be permanently lost.
The two-tx approve + `donate()` path is safe and covers all use cases.

### No rescue function

The contract intentionally has no `rescueTokens`, `sweep`, or similar function.
This is a feature, not a bug: it removes an entire class of owner-rug/drain vectors.
The invariant that the contract balance is always zero makes a rescue function unnecessary.

---

## Static Analysis

Slither 0.11.6 against `KasihCengkring.sol` with `--filter-paths node_modules`:

> **0 findings**

All 102 detectors ran against the contract. No High, Medium, Low, Informational, or Optimization findings.

---

## Test Coverage

90 Foundry tests, all passing. Coverage targets:

| Area | Tests |
|---|---|
| Registration edge cases | 20 tests (invalid chars, lengths, reserved, taken, paused, zero address, USDC address, contract address) |
| Donation happy path + balance accounting | Balance delta verified on donor and creator for every happy-path test |
| Min/max/floor boundaries | Exact-boundary tests + fuzz `testFuzz_donateSucceedsIffInRange` (256 runs) |
| effectiveMin behavior | `maxDonation` lowered below creator min — boundary tested both ways |
| Paused state | All paused-blocked functions + updatePayoutAddress works while paused |
| Reentrancy | Reentrant donate via malicious MockERC20 |
| Payout address blocked | contract address, USDC address, zero address |
| Access control | Non-owner pause/unpause/setMaxDonation all revert |
| Two-step ownership | Transfer does not change owner; stranger cannot accept; new owner must accept |
| Event field values | DonationReceived, CreatorRegistered, PayoutAddressUpdated, MinDonationUpdated, MaxDonationUpdated all verified |
| Invariant | Contract USDC balance is always zero |

---

## SWC Registry Self-Review

| SWC | Title | Status |
|---|---|---|
| SWC-100 | Function Default Visibility | N/A — all functions have explicit visibility |
| SWC-101 | Integer Overflow/Underflow | Not applicable — Solidity 0.8 built-in checks |
| SWC-104 | Unchecked Call Return Value | Mitigated — `SafeERC20.safeTransferFrom` |
| SWC-105 | Unprotected Ether Withdrawal | Not applicable — no ETH |
| SWC-106 | Unprotected `selfdestruct` | Not present |
| SWC-107 | Reentrancy | Mitigated — `ReentrancyGuard` + CEI order |
| SWC-108 | State Variable Default Visibility | N/A — all state variables have explicit visibility |
| SWC-112 | Delegatecall to Untrusted Callee | Not present |
| SWC-115 | Authorization via `tx.origin` | Not present |
| SWC-116 | Block values as Time | `block.timestamp` used only for the event `DonationReceived.timestamp` — read-only metadata, not a control flow condition |
| SWC-124 | Write to Arbitrary Storage Location | Not present |
| SWC-131 | Presence of Unused Variables | Not present |
| SWC-134 | Message Call with Hardcoded Gas | Not present |
| SWC-135 | Code With No Effects | Not present |

---

## Known Limitations

- **maxDonation is a risk control, not an AML solution.** The operator is responsible for compliance with applicable laws. `maxDonation` can slow high-volume actors but does not enforce identity or jurisdiction checks.
- **Payout address is not verified.** Creators can set any valid non-zero, non-contract-address as their payout. If they set an address they do not control, donations are permanently unrecoverable.
- **Username squatting.** Usernames are first-come, first-served on-chain. There is no dispute resolution.
- **No refunds.** Donations are irreversible once `donate()` is confirmed.
- **Not audited.** A formal third-party audit is strongly recommended before mainnet deployment with significant volume.

---

## Application Layer

- **No server, no secrets.** The deployed app is a static SPA. Every state-changing call is
  signed in the user's wallet; Netlify only serves files. There is no API key that can move
  funds.
- **Public Supabase key is expected.** `VITE_SUPABASE_ANON_KEY` ships in the bundle. All
  confidentiality and write control must come from Supabase row-level security. In particular
  `donations.hidden` updates (history page) rely on RLS; an anon key with broad `UPDATE`
  rights would let anyone hide or unhide donations. Verify RLS policies before enabling the
  mirror.
- **Mirror is untrusted input.** Profile text and donation rows are rendered from Supabase.
  React escapes text; do not introduce `dangerouslySetInnerHTML` for mirrored fields.
- **Hosting compromise is UI-only.** A malicious CDN could display false balances or
  addresses, but cannot sign or move funds. Users must confirm the transaction in their
  wallet; the contract remains the source of truth.
- **Baseline headers** are declared in `netlify.toml` (`nosniff`, frame denial, referrer and
  permissions policies). A strict CSP is not set because ConnectKit/WalletConnect inject
  inline code; adding one requires testing the wallet flow end to end.
- **Supply chain.** `bun.lock` is committed and installs are lockfile-frozen in CI/deploys.
  Review dependency changes before upgrading wallet libraries.

---

## Deployment

| Network | Address | Deployer | Explorer |
|---|---|---|---|
| Arc Testnet | `0xe9ed1145c0ec41220a1dc6b76bee0b860d078678` | `0xf324b4c7421b21f1ac9926eaf613d192497a0f97` | [View](https://explorer.testnet.arc.io/address/0xe9ed1145c0ec41220a1dc6b76bee0b860d078678) |

Constructor args: `usdc_=0x3600000000000000000000000000000000000000`, `maxDonation_=500000000` (500 USDC), `initialOwner=0xf324b4c7421b21f1ac9926eaf613d192497a0f97`

Web app: static SPA on Netlify. Build, SPA fallback, headers, and the contract-redeploy
handoff are documented in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
