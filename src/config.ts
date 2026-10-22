/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// The RPC this build talks to. Set VITE_ARC_RPC_URL to any Arc node (local, testnet,
// mainnet); unset means the chain's default public RPC from viem.
const arcRpcUrl = (import.meta.env.VITE_ARC_RPC_URL || import.meta.env.VITE_LOCAL_RPC_URL) as
  | string
  | undefined

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcRpcUrl ?? arcTestnet.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arcTestnet, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: arcRpcUrl ? http(arcRpcUrl) : http(),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
