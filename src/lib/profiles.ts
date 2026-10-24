/**
 * Profile mirror helpers.
 *
 * `profiles` is an anon-writable mirror (see supabase/migrations and SECURITY.md), so a row
 * can only be trusted when it is attached to the wallet that owns the username *on chain*.
 * `CreatorRegistered` is the one unforgeable link: it is indexed by `usernameHash` and carries
 * the registering wallet, so a squatter cannot make their row resolve to someone else's page.
 *
 * `syncProfileUsername` is the write side of that: the chain has already confirmed the claim, so
 * the mirror only needs to catch up. It is best-effort and never throws — a mirror that is
 * missing, unreachable, or holding a conflicting username must not break registration.
 */
import { keccak256, parseAbiItem, toBytes, type Address, type Hex, type PublicClient } from 'viem';
import { KASIH_ADDRESS } from '../contract';

export const CREATOR_REGISTERED = parseAbiItem(
  'event CreatorRegistered(bytes32 indexed usernameHash, string username, address indexed wallet, address payoutAddress)',
);

export interface ProfileRow {
  wallet_address: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  twitter_url: string | null;
  website_url: string | null;
  avatar_url: string | null;
}

const supabase = () => {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && key ? { url, key } : null;
};

/** Mirrors the contract: `usernameHash = keccak256(bytes(username))`, usernames are lowercase. */
export function hashUsername(username: string): Hex {
  return keccak256(toBytes(username.toLowerCase()));
}

const walletCache = new Map<string, Address | null>();

/** Username → registering wallet, resolved from `CreatorRegistered` logs. */
export async function resolveCreatorWallet(
  client: PublicClient,
  username: string,
): Promise<Address | null> {
  const key = username.toLowerCase();
  if (walletCache.has(key)) return walletCache.get(key) ?? null;

  const logs = await client.getLogs({
    address: KASIH_ADDRESS,
    event: CREATOR_REGISTERED,
    args: { usernameHash: hashUsername(key) },
    fromBlock: 0n,
  });
  const wallet = logs[logs.length - 1]?.args.wallet ?? null;
  walletCache.set(key, wallet);
  return wallet;
}

export async function fetchProfileByWallet(wallet: Address): Promise<ProfileRow | null> {
  const config = supabase();
  if (!config) return null;

  const resp = await fetch(
    `${config.url}/rest/v1/profiles?wallet_address=eq.${wallet.toLowerCase()}&select=*`,
    { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` } },
  );
  if (!resp.ok) throw new Error(`profiles ${resp.status}`);
  const rows = (await resp.json()) as ProfileRow[];
  return rows[0] ?? null;
}

export type SyncResult = 'current' | 'synced' | 'conflict' | 'unavailable';

/**
 * Makes the mirror agree with the chain for this wallet's username.
 *
 * Skips the write when the row already matches. A `conflict` means another wallet holds the
 * username in `profiles` (its `username` column is unique) — the browser cannot evict it with
 * the anon key, so that case is left to a service-role reconciler.
 */
export async function syncProfileUsername(
  wallet: Address,
  username: string,
): Promise<SyncResult> {
  const config = supabase();
  if (!config || !username) return 'unavailable';

  try {
    const existing = await fetchProfileByWallet(wallet);
    if (existing?.username === username) return 'current';

    const resp = await fetch(`${config.url}/rest/v1/profiles?on_conflict=wallet_address`, {
      method: 'POST',
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ wallet_address: wallet.toLowerCase(), username }),
    });
    if (resp.ok) return 'synced';
    // 409 = unique violation on `username`; 23505 is the Postgres code in the body.
    if (resp.status === 409) return 'conflict';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}
