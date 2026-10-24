/**
 * Adds/switches the wallet to the network this build is configured against.
 *
 * The RPC comes from VITE_ARC_RPC_URL (local node, Arc Testnet, mainnet — whatever
 * the deployment points at). The chain ID is read from that RPC instead of being
 * hardcoded, so the button always adds the network the app actually talks to.
 *
 * MetaMask identifies chains by ID, so an existing entry for the same ID with a
 * different RPC cannot be overridden by addEthereumChain. The genesis-hash check
 * detects that and tells the user which entry to remove instead of failing silently.
 */
import { useState } from 'react';
import { arcChain } from '../config';
import { Check, Loader2, PlugZap } from 'lucide-react';
import { toast } from 'sonner';

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

function getProvider(): Eip1193Provider | null {
  const ethereum = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return ethereum ?? null;
}

function errorCode(error: unknown): number | undefined {
  const candidate = error as { code?: number | string } | null;
  if (!candidate?.code) return undefined;
  return typeof candidate.code === 'string' ? Number(candidate.code) : candidate.code;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function rpcRequest<T>(rpcUrl: string, method: string, params: unknown[] = []): Promise<T | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const body = (await res.json()) as { result?: T };
    return body.result ?? null;
  } catch {
    return null;
  }
}

export default function NetworkButton() {
  const configuredRpc = (import.meta.env.VITE_ARC_RPC_URL || import.meta.env.VITE_LOCAL_RPC_URL) as
    | string
    | undefined;
  const rpcUrl = configuredRpc ?? arcChain.rpcUrls.default.http[0];
  const chainName = (import.meta.env.VITE_ARC_CHAIN_NAME as string | undefined) ?? 'Arc';
  const explorerUrl = import.meta.env.VITE_ARC_EXPLORER_URL as string | undefined;
  const [status, setStatus] = useState<'idle' | 'working' | 'done'>('idle');

  const handleClick = async () => {
    const provider = getProvider();
    if (!provider) {
      toast.error('No injected wallet found', { description: 'Install MetaMask or another injected wallet.' });
      return;
    }

    setStatus('working');
    try {
      const chainId = await rpcRequest<string>(rpcUrl, 'eth_chainId');
      if (!chainId) {
        toast.error(`Cannot reach RPC ${rpcUrl}`, {
          description: 'Start the node (bun run dev:local) or fix VITE_ARC_RPC_URL.',
        });
        setStatus('idle');
        return;
      }

      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId,
              chainName,
              rpcUrls: [rpcUrl],
              nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
              ...(explorerUrl ? { blockExplorerUrls: [explorerUrl] } : {}),
            },
          ],
        });
      } catch (error) {
        if (errorCode(error) === 4001) {
          toast.info('Network request rejected');
          setStatus('idle');
          return;
        }
        // Already added, or duplicate chain ID: switch instead.
      }

      try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
      } catch (error) {
        if (errorCode(error) === 4001) {
          toast.info('Network switch rejected');
        } else {
          toast.error(`Could not switch to ${chainName}`, {
            description: `Add it manually: RPC ${rpcUrl}, chain ID ${Number(BigInt(chainId))}, symbol USDC.`,
          });
        }
        setStatus('idle');
        return;
      }

      const [targetGenesis, walletGenesis] = await Promise.all([
        rpcRequest<{ hash?: string }>(rpcUrl, 'eth_getBlockByNumber', ['0x0', false]).then(
          (block) => block?.hash ?? null,
        ),
        withTimeout(
          provider
            .request({ method: 'eth_getBlockByNumber', params: ['0x0', false] })
            .then((block) => (block as { hash?: string } | null)?.hash ?? null),
          10_000,
        ).catch(() => null),
      ]);

      if (!targetGenesis || !walletGenesis) {
        toast.success(`Wallet switched to ${chainName}`);
      } else if (targetGenesis === walletGenesis) {
        toast.success(`Wallet is on ${chainName}`);
        setStatus('done');
        setTimeout(() => setStatus('idle'), 2_000);
        return;
      } else {
        toast.error(`MetaMask is using a different RPC for chain ${Number(BigInt(chainId))}`, {
          description:
            'MetaMask cannot hold two networks with the same chain ID. Settings → Networks → delete the existing Arc entry, then click this button again.',
          duration: 12_000,
        });
      }
      setStatus('idle');
    } finally {
      setStatus((current) => (current === 'working' ? 'idle' : current));
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={status === 'working'}
      title={`Add or switch the wallet to ${chainName} (${rpcUrl})`}
      aria-label={`Add or switch the wallet to ${chainName}`}
      className="btn btn-secondary btn-sm min-h-10 px-2.5"
    >
      {status === 'working' ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : status === 'done' ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <PlugZap className="size-3.5" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{chainName}</span>
    </button>
  );
}
