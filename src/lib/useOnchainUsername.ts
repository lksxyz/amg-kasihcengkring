/**
 * Recovers a wallet's username from the CreatorRegistered event.
 *
 * The contract stores the username string under a hash and only exposes
 * walletToUsernameHash, so the raw name is not readable via a view call. The
 * Supabase profile mirror normally fills the gap, but without it (local dev,
 * bare deployment) the dashboard would show an empty username even though
 * registration succeeded on-chain.
 */
import { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { parseAbiItem } from 'viem';
import { arcTestnet } from 'viem/chains';
import { KASIH_ADDRESS } from '../contract';

const CREATOR_REGISTERED = parseAbiItem(
  'event CreatorRegistered(bytes32 indexed usernameHash, string username, address indexed wallet, address payoutAddress)',
);

export function useOnchainUsername(address: `0x${string}` | undefined): string {
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const [username, setUsername] = useState('');

  useEffect(() => {
    if (!address || !publicClient) return;
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
  }, [address, publicClient]);

  return username;
}
