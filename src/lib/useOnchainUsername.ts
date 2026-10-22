/**
 * Recovers a wallet's username from chain state.
 *
 * Newer deployments expose `getUsernameByHash`, so the name can be read directly
 * from `walletToUsernameHash`. Older deployments only emit it in the
 * CreatorRegistered event, so we fall back to logs when the view is unavailable
 * (or returns nothing).
 *
 * The Supabase profile mirror normally fills the gap, but without it (local dev,
 * bare deployment) the dashboard would show an empty username even though
 * registration succeeded on-chain.
 */
import { useEffect, useState } from 'react';
import { usePublicClient, useReadContract } from 'wagmi';
import { parseAbiItem } from 'viem';
import { arcTestnet } from 'viem/chains';
import { KASIH_ADDRESS, KASIH_ABI } from '../contract';

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

const CREATOR_REGISTERED = parseAbiItem(
  'event CreatorRegistered(bytes32 indexed usernameHash, string username, address indexed wallet, address payoutAddress)',
);

export function useOnchainUsername(address: `0x${string}` | undefined): string {
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const [username, setUsername] = useState('');

  const { data: usernameHash } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'walletToUsernameHash',
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address },
  });

  const hasHash = !!usernameHash && usernameHash !== ZERO_HASH;

  // Available on new deployments only; `retry: false` keeps old deployments quiet.
  const { data: onchainName } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'getUsernameByHash',
    args: hasHash && usernameHash ? [usernameHash] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: hasHash, retry: false },
  });

  useEffect(() => {
    if (onchainName) setUsername(onchainName);
  }, [onchainName]);

  // Fallback for deployments that predate `getUsernameByHash`.
  useEffect(() => {
    if (!address || !publicClient || onchainName) return;
    let cancelled = false;

    void publicClient
      .getLogs({
        address: KASIH_ADDRESS,
        event: CREATOR_REGISTERED,
        args: { wallet: address },
        fromBlock: 0n,
      })
      .then((logs) => {
        const latest = logs[logs.length - 1];
        if (!cancelled && latest?.args.username) setUsername(latest.args.username);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [address, publicClient, onchainName]);

  return username;
}
