# KasihCengkring — Arc Mainnet Deploy Runbook

> **You must run these commands yourself from your own machine.**
> Arc Studio cannot deploy to, sign for, or transact on mainnet.
> Double-check every address before signing. Losses on mainnet are irreversible.

---

## Prerequisites

- [Arc Foundry](https://docs.arc.io/arc/tutorials/install-arc-foundry.md) installed (`arc-forge`, `arc-cast`)
- A funded mainnet wallet (needs USDC for gas — Arc gas is paid in USDC)
- The repo cloned locally and dependencies installed (`bun install`)

---

## Step 1 — Build the contract

```bash
forge build
```

Confirm it compiles clean (warnings in test files are OK).

---

## Step 2 — Set your deployer private key

```bash
export PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
```

Never paste a private key into this file or into chat.
Use a hardware wallet or a dedicated deployer EOA — not your main wallet.

---

## Step 3 — Deploy

Constructor signature: `(address usdc, uint256 maxDonation, address treasury, uint16 feeBps, uint256 flatFee, address initialOwner)`

Parameters confirmed:
| Parameter | Value | Notes |
|---|---|---|
| `usdc` | `0x3600000000000000000000000000000000000000` | Arc mainnet USDC (6 decimals, verified) |
| `maxDonation` | `500000000` | 500 USDC |
| `treasury` | **your wallet address** | Receives platform fees — replace this |
| `feeBps` | `200` | 2% proportional fee |
| `flatFee` | `10000` | 0.01 USDC flat fee per donation |
| `initialOwner` | **your wallet address** | Same as deployer — replace this |

```bash
arc-forge create contracts/KasihCengkring.sol:KasihCengkring \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --constructor-args \
    0x3600000000000000000000000000000000000000 \
    500000000 \
    YOUR_TREASURY_ADDRESS \
    200 \
    10000 \
    YOUR_OWNER_ADDRESS
```

Replace `YOUR_TREASURY_ADDRESS` and `YOUR_OWNER_ADDRESS` with your actual wallet addresses.

---

## Step 4 — Record the deployed address

After deployment, note the contract address from the output. Then:

1. Add to your Netlify environment variables:
   ```
   VITE_KASIH_ADDRESS=0xYOUR_MAINNET_CONTRACT_ADDRESS
   VITE_ARC_WSS_URL=wss://rpc.mainnet.arc.io
   ```

2. Update `AGENTS.md` with the mainnet address and tx hash.

3. Verify the contract on-chain before going live:
   ```bash
   arc-cast call YOUR_MAINNET_CONTRACT_ADDRESS "MIN_DONATION_FLOOR()(uint256)" \
     --rpc-url https://rpc.mainnet.arc.io
   # Expected: 500000

   arc-cast call YOUR_MAINNET_CONTRACT_ADDRESS "feeBps()(uint16)" \
     --rpc-url https://rpc.mainnet.arc.io
   # Expected: 200

   arc-cast call YOUR_MAINNET_CONTRACT_ADDRESS "treasury()(address)" \
     --rpc-url https://rpc.mainnet.arc.io
   # Expected: your treasury address
   ```

---

## Step 5 — Transfer ownership (if deployer ≠ intended owner)

If you used a separate deployer key and want to hand ownership to a multisig or hardware wallet:

```bash
arc-cast send YOUR_MAINNET_CONTRACT_ADDRESS \
  "transferOwnership(address)" YOUR_FINAL_OWNER_ADDRESS \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $PRIVATE_KEY
```

The new owner must then call `acceptOwnership()` from their wallet to complete the two-step transfer.

---

## Step 6 — Tell Arc Studio the new address

Once deployed, come back to Arc Studio and say:
> "Mainnet contract is at 0x... — update the frontend and redeploy to Netlify"

Arc Studio will update `VITE_KASIH_ADDRESS`, switch the wagmi config to Arc mainnet, rebuild, and deploy.

---

## Security checklist before going live

- [ ] Contract address verified on https://explorer.mainnet.arc.io
- [ ] `treasury()` returns your address
- [ ] `owner()` returns your intended owner address
- [ ] `MIN_DONATION_FLOOR()` = `500000`
- [ ] `feeBps()` = `200`
- [ ] `flatFee()` = `10000`
- [ ] `maxDonation()` = `500000000`
- [ ] `paused()` = `false`
- [ ] SECURITY.md reviewed — contract is **unaudited**, use small amounts
- [ ] Netlify env vars updated with mainnet contract address and WSS URL
- [ ] Tested one small donation end-to-end on mainnet before announcing
