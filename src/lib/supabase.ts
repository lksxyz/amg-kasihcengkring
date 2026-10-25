/**
 * Supabase mirror configuration, selected per network.
 *
 * Testnet and mainnet keep separate projects so test donations never mix with real
 * ones. Both groups can live in one `.env`; `VITE_ARC_NETWORK` picks the right pair.
 *
 *   VITE_TESTNET_SUPABASE_URL / VITE_TESTNET_SUPABASE_ANON_KEY
 *   VITE_MAINNET_SUPABASE_URL / VITE_MAINNET_SUPABASE_ANON_KEY
 *   VITE_TESTNET_CREATOR_STATS_URL / VITE_MAINNET_CREATOR_STATS_URL (optional)
 *
 * The shared names VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_CREATOR_STATS_URL
 * remain as a fallback for older deployments.
 */
import { ARC_NETWORK } from '../network';

const env = import.meta.env;

interface SupabaseEnv {
  url?: string;
  anonKey?: string;
  statsUrl?: string;
}

const NETWORK_ENV: Record<typeof ARC_NETWORK, SupabaseEnv> = {
  testnet: {
    url: env.VITE_TESTNET_SUPABASE_URL as string | undefined,
    anonKey: env.VITE_TESTNET_SUPABASE_ANON_KEY as string | undefined,
    statsUrl: env.VITE_TESTNET_CREATOR_STATS_URL as string | undefined,
  },
  mainnet: {
    url: env.VITE_MAINNET_SUPABASE_URL as string | undefined,
    anonKey: env.VITE_MAINNET_SUPABASE_ANON_KEY as string | undefined,
    statsUrl: env.VITE_MAINNET_CREATOR_STATS_URL as string | undefined,
  },
};

const LEGACY: SupabaseEnv = {
  url: env.VITE_SUPABASE_URL as string | undefined,
  anonKey: env.VITE_SUPABASE_ANON_KEY as string | undefined,
  statsUrl: env.VITE_CREATOR_STATS_URL as string | undefined,
};

const selected = NETWORK_ENV[ARC_NETWORK];

/** Project URL for the selected network, or undefined when the mirror is off. */
export const SUPABASE_URL = (selected.url || LEGACY.url || '').trim() || undefined;

/** Public anon key for the selected network. RLS is the only thing protecting writes. */
export const SUPABASE_ANON_KEY = (selected.anonKey || LEGACY.anonKey || '').trim() || undefined;

/** True when both halves of the mirror are configured for the selected network. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const statsOverride = selected.statsUrl ?? LEGACY.statsUrl;

/**
 * Creator-stats endpoint. Defaults to `<project>/functions/v1/creator-stats`; an explicit
 * empty value disables the call (dashboard stats then come from chain logs only).
 */
export const CREATOR_STATS_URL =
  statsOverride !== undefined
    ? statsOverride
    : SUPABASE_URL
      ? `${SUPABASE_URL}/functions/v1/creator-stats`
      : '';

/** Headers for Supabase REST and edge-function calls. */
export function supabaseHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY ?? '',
    Authorization: `Bearer ${SUPABASE_ANON_KEY ?? ''}`,
  };
}
