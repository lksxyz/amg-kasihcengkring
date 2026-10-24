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
import { arcTestnet } from 'viem/chains';

const httpUrl = (import.meta.env.VITE_ARC_RPC_URL || import.meta.env.VITE_LOCAL_RPC_URL) as
  | string
  | undefined;

const configuredWssUrl = import.meta.env.VITE_ARC_WSS_URL as string | undefined;

function resolveWebSocketUrl(): string | undefined {
  if (configuredWssUrl) return configuredWssUrl;
  // No custom RPC: use the WebSocket endpoints that ship with the Arc chain definition.
  if (!httpUrl) return arcTestnet.rpcUrls.default.webSocket?.[0];
  // Same host with a ws(s) scheme. Providers that expose WS on a different path
  // (e.g. `.../websocket`) must set VITE_ARC_WSS_URL.
  return httpUrl.replace(/^http/, 'ws');
}

const webSocketUrl = resolveWebSocketUrl();

const transport = webSocketUrl
  ? fallback([webSocket(webSocketUrl, { keepAlive: true, reconnect: true }), http(httpUrl)])
  : http(httpUrl);

export const overlayClient = createPublicClient({
  chain: arcTestnet,
  transport,
});
