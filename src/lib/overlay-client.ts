/**
 * Read-only RPC client for the OBS overlay.
 *
 * Donation cards should appear as soon as a block lands, so the overlay streams
 * `DonationReceived` logs over an `eth_subscribe` WebSocket connection instead of
 * polling. HTTP stays in the transport list for backfill queries (`getLogs`) and as
 * a fallback, and the rest of the app keeps the plain HTTP transport from
 * `src/config.ts`: only the overlay opens a long-lived socket.
 *
 * Endpoints come from `src/network.ts`, so the overlay follows VITE_ARC_NETWORK.
 */

import { createPublicClient, fallback, http, webSocket } from 'viem';
import { arcChain } from '../config';
import { ARC_RPC_URL, ARC_WSS_URL } from '../network';

export const overlayClient = createPublicClient({
  chain: arcChain,
  transport: fallback([webSocket(ARC_WSS_URL, { keepAlive: true, reconnect: true }), http(ARC_RPC_URL)]),
});
