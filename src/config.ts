/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 *
 * Network selection:
 *   VITE_ARC_NETWORK=mainnet  → Arc mainnet (chain 5042), wss://rpc.mainnet.arc.io
 *   VITE_ARC_NETWORK=testnet  → Arc testnet (chain 5042002), wss://rpc.testnet.arc.io  [default]
 *
 * Override individual endpoints:
 *   VITE_ARC_RPC_URL  — custom HTTP RPC
 *   VITE_ARC_WSS_URL  — custom WebSocket RPC
 */

import { http, webSocket, fallback, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc, arcTestnet } from 'viem/chains'
// re-exported so callers import from config, not viem/chains
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

const isMainnet = (import.meta.env.VITE_ARC_NETWORK as string | undefined) === 'mainnet'
const arcChain = isMainnet ? arc : arcTestnet

const defaultWss = isMainnet ? 'wss://rpc.mainnet.arc.io' : 'wss://rpc.testnet.arc.io'
const defaultHttp = isMainnet ? 'https://rpc.mainnet.arc.io' : undefined

// Per-endpoint overrides
const arcRpcUrl = (import.meta.env.VITE_ARC_RPC_URL || import.meta.env.VITE_LOCAL_RPC_URL) as string | undefined
const arcWssUrl = (import.meta.env.VITE_ARC_WSS_URL as string | undefined) ?? defaultWss

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcChain.id, arcRpcUrl ?? arcChain.rpcUrls.default.http[0])

const arcTransport = fallback([
  webSocket(arcWssUrl),
  arcRpcUrl ? http(arcRpcUrl) : defaultHttp ? http(defaultHttp) : http(),
])

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
