/**
 * Read-only RPC client for the OBS overlay.
 *
 * Donation cards should appear as soon as a block lands, so the overlay streams
 * `DonationReceived` logs over an `eth_subscribe` WebSocket connection instead of
 * polling. HTTP stays in the transport list for backfill queries (`getLogs`) and as
 * a fallback, and the rest of the app keeps the plain HTTP transport from
 * `src/config.ts`: only the overlay opens a long-lived socket.
 */

import { createPublicClient, fallback, http, webSocket } from 'viem';
import { arcChain } from '../config';

const httpUrl = (import.meta.env.VITE_ARC_RPC_URL || import.meta.env.VITE_LOCAL_RPC_URL) as
  | string
  | undefined;

const configuredWssUrl = import.meta.env.VITE_ARC_WSS_URL as string | undefined;

const isMainnet = (import.meta.env.VITE_ARC_NETWORK as string | undefined) === 'mainnet';
const DEFAULT_WSS = isMainnet ? 'wss://rpc.mainnet.arc.io' : 'wss://rpc.testnet.arc.io';

function resolveWebSocketUrl(): string | undefined {
  if (configuredWssUrl) return configuredWssUrl;
  if (!httpUrl) return DEFAULT_WSS;
  // Same host with a ws(s) scheme. Providers that expose WS on a different path
  // (e.g. `.../websocket`) must set VITE_ARC_WSS_URL.
  return httpUrl.replace(/^http/, 'ws');
}

const webSocketUrl = resolveWebSocketUrl();

const transport = webSocketUrl
  ? fallback([webSocket(webSocketUrl, { keepAlive: true, reconnect: true }), http(httpUrl)])
  : http(httpUrl);

export const overlayClient = createPublicClient({
  chain: arcChain,
  transport,
});
