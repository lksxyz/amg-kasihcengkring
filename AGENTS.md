# KasihCengkring

> Built with Arc Studio - money-powered apps in minutes

Creator donation platform on Arc. Supporters send USDC directly to a creator's payout address. The contract never holds funds. No platform fee, no signup required to donate.

---

## Contract Deployments

| Network | Address | Explorer |
|---|---|---|
| Arc Testnet | `0xe9ed1145c0ec41220a1dc6b76bee0b860d078678` | [View](https://explorer.testnet.arc.io/address/0xe9ed1145c0ec41220a1dc6b76bee0b860d078678) |

- **Deploy tx:** `0x22b996fdac9180b8c25ad84e8313f2875e283b80c4cdf7eca8e89427a607ba12`
- **Deployer wallet:** `0xf324b4c7421b21f1ac9926eaf613d192497a0f97`
- **USDC (Arc Testnet):** `0x3600000000000000000000000000000000000000` (6 decimals)
- **maxDonation:** 500 USDC (`500000000`)
- **MIN_DONATION_FLOOR:** 0.10 USDC (`100000`)

## Security

See `SECURITY.md` for the full threat model, SWC review, and test coverage.

## What This App Does

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
