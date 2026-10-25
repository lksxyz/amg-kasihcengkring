/**
 * Donation mirror helpers.
 *
 * The Supabase `donations` table is the source of truth for every donation UI
 * (dashboard recents and /app/history). We never reconstruct history from Arc RPC
 * logs in these views. The browser writes the row itself right after `donate()`
 * confirms, because there is no indexer yet.
 *
 * The overlay is the exception: it still streams `DonationReceived` for live cards.
 */
import { decodeEventLog, parseAbiItem, type Hex, type Log } from 'viem';
import { ARC_CHAIN } from '../network';
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';

export const DONATION_RECEIVED = parseAbiItem(
  'event DonationReceived(bytes32 indexed usernameHash, string username, address indexed donor, address indexed creator, string donorName, string message, uint256 amount, uint256 fee, uint256 timestamp)',
);

export const ZERO_HASH: Hex = `0x${'0'.repeat(64)}`;

export interface DonationMirrorRow {
  chain_id: number;
  tx_hash: Hex;
  log_index: number;
  block_number: number;
  block_timestamp: number;
  creator_wallet: string;
  creator_username: string;
  donor_address: string;
  donor_name: string;
  message: string;
  amount_raw: string;
  fee_raw: string;
}

interface DecodedDonation {
  txHash: Hex;
  logIndex: number;
  blockNumber: number;
  creator: string;
  creatorUsername: string;
  donor: string;
  donorName: string;
  message: string;
  amount: bigint;
  fee: bigint;
  timestamp: number;
}

/** Decode a receipt log into the fields the mirror needs. Returns null for other logs. */
export function donationFromLog(log: Log): DecodedDonation | null {
  try {
    const decoded = decodeEventLog({
      abi: [DONATION_RECEIVED],
      data: log.data,
      topics: log.topics,
    });
    if (decoded.eventName !== 'DonationReceived') return null;
    if (!log.transactionHash) return null;
    const args = decoded.args;
    return {
      txHash: log.transactionHash,
      logIndex: log.logIndex ?? 0,
      blockNumber: Number(log.blockNumber ?? 0n),
      creator: args.creator.toLowerCase(),
      creatorUsername: args.username,
      donor: args.donor.toLowerCase(),
      donorName: args.donorName ?? '',
      message: args.message ?? '',
      amount: args.amount,
      fee: args.fee,
      timestamp: Number(args.timestamp),
    };
  } catch {
    return null;
  }
}

/**
 * Insert a confirmed donation into the mirror. Best-effort: a mirror failure must never
 * turn a successful on-chain donation into an error. Duplicates are ignored by the
 * `(chain_id, tx_hash, log_index)` unique index.
 */
export async function mirrorDonation(donation: DecodedDonation): Promise<boolean> {
  if (!isSupabaseConfigured || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false;

  const row: DonationMirrorRow = {
    chain_id: ARC_CHAIN.id,
    tx_hash: donation.txHash,
    log_index: donation.logIndex,
    block_number: donation.blockNumber,
    block_timestamp: donation.timestamp,
    creator_wallet: donation.creator,
    creator_username: donation.creatorUsername.toLowerCase(),
    donor_address: donation.donor,
    donor_name: donation.donorName,
    message: donation.message,
    amount_raw: donation.amount.toString(),
    fee_raw: donation.fee.toString(),
  };

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/donations`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'content-type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!response.ok) {
      console.warn('[donation] mirror insert failed', response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[donation] mirror insert failed', error);
    return false;
  }
}
