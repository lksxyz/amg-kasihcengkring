/**
 * Recovers a wallet's username from chain state.
 *
 * New deployments expose `getUsernameByHash` — one cheap eth_call.
 * Older deployments only emit it in the CreatorRegistered event, so we fall
 * back to a chunked getLogs scan when the view returns nothing (avoids the
 * -32012 "requested range too large" error from public Arc RPC).
 */
import { useEffect, useState } from 'react';
import { usePublicClient, useReadContract } from 'wagmi';
import { parseAbiItem } from 'viem';
import { arcChain } from '../config';
import { KASIH_ADDRESS, KASIH_ABI, KASIH_DEPLOY_BLOCK, LOG_CHUNK } from '../contract';

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;
const CHUNK = LOG_CHUNK;

const CREATOR_REGISTERED = parseAbiItem(
  'event CreatorRegistered(bytes32 indexed usernameHash, string username, address indexed wallet, address payoutAddress)',
);

export function useOnchainUsername(address: `0x${string}` | undefined): string {
  const publicClient = usePublicClient({ chainId: arcChain.id });
  const [username, setUsername] = useState('');

  const { data: usernameHash } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'walletToUsernameHash',
    args: address ? [address] : undefined,
    chainId: arcChain.id,
    query: { enabled: !!address },
  });

  const hasHash = !!usernameHash && usernameHash !== ZERO_HASH;

  // Available on new deployments only; `retry: false` keeps old deployments quiet.
  const { data: onchainName } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'getUsernameByHash',
    args: hasHash && usernameHash ? [usernameHash] : undefined,
    chainId: arcChain.id,
    query: { enabled: hasHash, retry: false },
  });

  useEffect(() => {
    if (onchainName) setUsername(onchainName);
  }, [onchainName]);

  // Fallback for deployments that predate `getUsernameByHash` — chunked scan.
  useEffect(() => {
    if (!address || !publicClient || onchainName) return;
    let cancelled = false;

    const scan = async () => {
      const head = await publicClient.getBlockNumber();
      // Registration cannot predate deployment — start there when it is known.
      const from =
        KASIH_DEPLOY_BLOCK > 0n
          ? KASIH_DEPLOY_BLOCK
          : head > 50_000n
            ? head - 50_000n
            : 0n;
      let start = from;
      while (start <= head && !cancelled) {
        const end = start + CHUNK - 1n < head ? start + CHUNK - 1n : head;
        const logs = await publicClient.getLogs({
          address: KASIH_ADDRESS,
          event: CREATOR_REGISTERED,
          args: { wallet: address },
          fromBlock: start,
          toBlock: end,
        });
        if (logs.length > 0) {
          const latest = logs[logs.length - 1];
          if (!cancelled && latest?.args.username) {
            setUsername(latest.args.username);
            return;
          }
        }
        start = end + 1n;
      }
    };

    void scan().catch(() => {});
    return () => { cancelled = true; };
  }, [address, publicClient, onchainName]);

  return username;
}
