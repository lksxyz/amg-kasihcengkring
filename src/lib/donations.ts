/**
 * Donation history straight from chain logs.
 *
 * Supabase is only a mirror; when it is missing or not populated (local dev,
 * bare deployment) the UI still has to show donations. The contract indexes
 * both usernameHash and creator, so logs can be filtered by either.
 */
import { parseAbiItem, type Address, type Hex, type PublicClient } from 'viem';
import { KASIH_ADDRESS } from '../contract';

export const DONATION_RECEIVED = parseAbiItem(
  'event DonationReceived(bytes32 indexed usernameHash, string username, address indexed donor, address indexed creator, string donorName, string message, uint256 amount, uint256 timestamp)',
);

export const ZERO_HASH: Hex = `0x${'0'.repeat(64)}`;

export interface DonationRow {
  id: string;
  donor_address: string;
  donor_name: string;
  message: string;
  amount_raw: string;
  tx_hash: Hex;
  block_timestamp: number;
  hidden: boolean;
}

interface DonationLog {
  transactionHash: Hex;
  logIndex: number;
  args: {
    donor?: Address;
    donorName?: string;
    message?: string;
    amount?: bigint;
    timestamp?: bigint;
  };
}

export async function getChainDonations(
  client: PublicClient,
  filter: { usernameHash?: Hex; creator?: Address },
): Promise<DonationRow[]> {
  const args = filter.usernameHash
    ? { usernameHash: filter.usernameHash }
    : filter.creator
      ? { creator: filter.creator }
      : null;
  if (!args) return [];

  const logs = await client.getLogs({
    address: KASIH_ADDRESS,
    event: DONATION_RECEIVED,
    args,
    fromBlock: 0n,
  });

  return (logs as DonationLog[])
    .map((log) => ({
      id: `${log.transactionHash}-${log.logIndex}`,
      donor_address: log.args.donor ?? '',
      donor_name: log.args.donorName ?? '',
      message: log.args.message ?? '',
      amount_raw: (log.args.amount ?? 0n).toString(),
      tx_hash: log.transactionHash,
      block_timestamp: Number(log.args.timestamp ?? 0n),
      hidden: false,
    }))
    .sort((a, b) => b.block_timestamp - a.block_timestamp);
}
