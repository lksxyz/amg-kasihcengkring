/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 *
 * Which network this build talks to is decided in one place: `VITE_ARC_NETWORK`
 * (`testnet` by default, `mainnet` to switch). The chain, RPC, WSS endpoint, contract
 * address, deploy block, explorer, and USDC address all come from that selection — see
 * `src/network.ts`.
 */

import { http, webSocket, fallback, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc, arcTestnet } from 'viem/chains'
// re-exported so callers import from config, not viem/chains
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { ARC_CHAIN, ARC_NETWORK, ARC_RPC_URL, ARC_WSS_URL } from './network'

const isMainnet = ARC_NETWORK === 'mainnet'
const arcChain = ARC_CHAIN

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcChain.id, ARC_RPC_URL)

const arcTransport = fallback([webSocket(ARC_WSS_URL), http(ARC_RPC_URL)])

export const config = createConfig({
  chains: [arcChain, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  // oxlint-disable-next-line typescript/no-unsafe-assignment
  transports: {
    // wagmi requires an exhaustive chain→transport map; we provide both Arc variants at build time
    ...(isMainnet
      ? { [arc.id]: arcTransport, [arcTestnet.id]: http() }
      : { [arcTestnet.id]: arcTransport, [arc.id]: http() }),
    [mainnet.id]: http(), // ENS resolution
  // oxlint-disable-next-line typescript/no-explicit-any
  } as any,
})

/** The Arc chain this build targets — use this instead of hardcoding arcTestnet. */
export { arcChain }
