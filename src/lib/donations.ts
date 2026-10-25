/**
 * Donation history straight from chain logs.
 *
 * Supabase is only a mirror; when it is missing or not populated (local dev,
 * bare deployment) the UI still has to show donations. The contract indexes
 * both usernameHash and creator, so logs can be filtered by either.
 *
 * getLogs is chunked because public Arc RPC rejects ranges > ~2 000 blocks
 * with error -32012 "requested range too large".
 */
import { parseAbiItem, type Address, type Hex, type PublicClient } from 'viem';
import { KASIH_ADDRESS, KASIH_DEPLOY_BLOCK, LOG_CHUNK } from '../contract';

export const DONATION_RECEIVED = parseAbiItem(
  'event DonationReceived(bytes32 indexed usernameHash, string username, address indexed donor, address indexed creator, string donorName, string message, uint256 amount, uint256 fee, uint256 timestamp)',
);

export const ZERO_HASH: Hex = `0x${'0'.repeat(64)}`;

export interface DonationRow {
  id: string;
  donor_address: string;
  donor_name: string;
  message: string;
  amount_raw: string;
  fee_raw: string;
  net_raw: string;
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
    fee?: bigint;
    timestamp?: bigint;
  };
}

/** Maximum block range per getLogs call — Arc mainnet rejects 10 000 and above. */
const CHUNK = LOG_CHUNK;

/**
 * Fetch all logs for the given filter, chunking across block ranges so
 * no single call exceeds the RPC's range limit.
 */
async function getLogsChunked(
  client: PublicClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter: Record<string, any>,
  from: bigint,
  to: bigint,
): Promise<Awaited<ReturnType<PublicClient['getLogs']>>> {
  const results: Awaited<ReturnType<PublicClient['getLogs']>> = [];
  let start = from;
  while (start <= to) {
    const end = start + CHUNK - 1n < to ? start + CHUNK - 1n : to;
    // oxlint-disable-next-line typescript/no-unsafe-argument
    const chunk = await client.getLogs({ ...filter, fromBlock: start, toBlock: end });
    results.push(...chunk);
    start = end + 1n;
  }
  return results;
}

export async function getChainDonations(
  client: PublicClient,
  filter: { usernameHash?: Hex; creator?: Address },
  deployBlock?: bigint,
): Promise<DonationRow[]> {
  const args = filter.usernameHash
    ? { usernameHash: filter.usernameHash }
    : filter.creator
      ? { creator: filter.creator }
      : null;
  if (!args) return [];

  const head = await client.getBlockNumber();
  // Prefer the deployment block: the contract cannot have logs before it, so scanning
  // older blocks is pure RPC waste. Fall back to a 50k window when it is unknown.
  const from =
    deployBlock ??
    (KASIH_DEPLOY_BLOCK > 0n
      ? KASIH_DEPLOY_BLOCK
      : head > 50_000n
        ? head - 50_000n
        : 0n);

  const logs = await getLogsChunked(
    client,
    {
      address: KASIH_ADDRESS,
      event: DONATION_RECEIVED,
      args,
    },
    from,
    head,
  );

  return (logs as DonationLog[])
    .map((log) => {
      const gross = log.args.amount ?? 0n;
      const fee = log.args.fee ?? 0n;
      return {
        id: `${log.transactionHash}-${log.logIndex}`,
        donor_address: log.args.donor ?? '',
        donor_name: log.args.donorName ?? '',
        message: log.args.message ?? '',
        amount_raw: gross.toString(),
        fee_raw: fee.toString(),
        net_raw: (gross - fee).toString(),
        tx_hash: log.transactionHash,
        block_timestamp: Number(log.args.timestamp ?? 0n),
        hidden: false,
      };
    })
    .sort((a, b) => b.block_timestamp - a.block_timestamp);
}
