/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, webSocket, fallback, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// HTTP RPC — override via VITE_ARC_RPC_URL (e.g. a private node or proxy)
const arcRpcUrl = (import.meta.env.VITE_ARC_RPC_URL || import.meta.env.VITE_LOCAL_RPC_URL) as
  | string
  | undefined

// WebSocket RPC — override via VITE_ARC_WSS_URL, defaults to the public Arc Testnet WSS
const arcWssUrl = (import.meta.env.VITE_ARC_WSS_URL as string | undefined) ?? 'wss://rpc.testnet.arc.io'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcRpcUrl ?? arcTestnet.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arcTestnet, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    // WSS first for real-time subscriptions; HTTP as fallback for eth_call / eth_getLogs
    [arcTestnet.id]: fallback([
      webSocket(arcWssUrl),
      arcRpcUrl ? http(arcRpcUrl) : http(),
    ]),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
