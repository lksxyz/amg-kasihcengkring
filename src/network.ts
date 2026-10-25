/**
 * Build-time network selection.
 *
 * One switch decides everything:
 *
 *   VITE_ARC_NETWORK=testnet   → Arc Testnet (chain 5042002)   [default]
 *   VITE_ARC_NETWORK=mainnet   → Arc Mainnet (chain 5042)
 *
 * Every value that differs per network lives in its own group here, so switching a
 * deployment is a single variable — you never have to hunt down the RPC, the contract
 * address, the deploy block, and the explorer separately.
 *
 *   VITE_TESTNET_RPC_URL            VITE_MAINNET_RPC_URL
 *   VITE_TESTNET_WSS_URL            VITE_MAINNET_WSS_URL
 *   VITE_TESTNET_KASIH_ADDRESS      VITE_MAINNET_KASIH_ADDRESS
 *   VITE_TESTNET_KASIH_DEPLOY_BLOCK VITE_MAINNET_KASIH_DEPLOY_BLOCK
 *   VITE_TESTNET_USDC_ADDRESS       VITE_MAINNET_USDC_ADDRESS
 *   VITE_TESTNET_EXPLORER_URL       VITE_MAINNET_EXPLORER_URL
 *   VITE_TESTNET_CHAIN_NAME         VITE_MAINNET_CHAIN_NAME
 *
 * Resolution order for each value: the selected network's variable, then the legacy
 * single-network override (VITE_ARC_RPC_URL, VITE_KASIH_ADDRESS, …) that
 * `bun run dev:local` still uses, then the built-in default below.
 */
import { arc, arcTestnet, type Chain } from 'viem/chains';
import { getChain, getUsdc } from './onchain-facts';

export type ArcNetwork = 'testnet' | 'mainnet';

const env = import.meta.env;
const rawNetwork = (env.VITE_ARC_NETWORK as string | undefined)?.trim().toLowerCase();

/** Which network this build targets. Anything other than `mainnet` means testnet. */
export const ARC_NETWORK: ArcNetwork = rawNetwork === 'mainnet' ? 'mainnet' : 'testnet';

/** True when the UI must label itself as testnet and show the faucet link. */
export const IS_TESTNET = ARC_NETWORK === 'testnet';

/** Circle's testnet faucet — Arc Testnet USDC is claimed here. */
export const ARC_FAUCET_URL = 'https://faucet.circle.com/';

interface NetworkEnv {
  kasihAddress?: string;
  kasihDeployBlock?: string;
  rpcUrl?: string;
  wssUrl?: string;
  usdcAddress?: string;
  explorerUrl?: string;
  chainName?: string;
}

/** Variables that are read per network, so both groups can coexist in one .env. */
const NETWORK_ENV: Record<ArcNetwork, NetworkEnv> = {
  testnet: {
    kasihAddress: env.VITE_TESTNET_KASIH_ADDRESS as string | undefined,
    kasihDeployBlock: env.VITE_TESTNET_KASIH_DEPLOY_BLOCK as string | undefined,
    rpcUrl: env.VITE_TESTNET_RPC_URL as string | undefined,
    wssUrl: env.VITE_TESTNET_WSS_URL as string | undefined,
    usdcAddress: env.VITE_TESTNET_USDC_ADDRESS as string | undefined,
    explorerUrl: env.VITE_TESTNET_EXPLORER_URL as string | undefined,
    chainName: env.VITE_TESTNET_CHAIN_NAME as string | undefined,
  },
  mainnet: {
    kasihAddress: env.VITE_MAINNET_KASIH_ADDRESS as string | undefined,
    kasihDeployBlock: env.VITE_MAINNET_KASIH_DEPLOY_BLOCK as string | undefined,
    rpcUrl: env.VITE_MAINNET_RPC_URL as string | undefined,
    wssUrl: env.VITE_MAINNET_WSS_URL as string | undefined,
    usdcAddress: env.VITE_MAINNET_USDC_ADDRESS as string | undefined,
    explorerUrl: env.VITE_MAINNET_EXPLORER_URL as string | undefined,
    chainName: env.VITE_MAINNET_CHAIN_NAME as string | undefined,
  },
};

/**
 * Legacy single-value overrides. Kept so `bun run dev:local` can point one build at a
 * throwaway local chain without knowing which network group is selected.
 */
const LEGACY_ENV: NetworkEnv = {
  kasihAddress: env.VITE_KASIH_ADDRESS as string | undefined,
  kasihDeployBlock: env.VITE_KASIH_DEPLOY_BLOCK as string | undefined,
  rpcUrl: (env.VITE_ARC_RPC_URL || env.VITE_LOCAL_RPC_URL) as string | undefined,
  wssUrl: env.VITE_ARC_WSS_URL as string | undefined,
  usdcAddress: env.VITE_USDC_ADDRESS as string | undefined,
  explorerUrl: env.VITE_ARC_EXPLORER_URL as string | undefined,
  chainName: env.VITE_ARC_CHAIN_NAME as string | undefined,
};

interface NetworkDefaults {
  chain: Chain;
  kasihAddress: `0x${string}`;
  kasihDeployBlock: bigint;
  wssUrl: string;
}

const DEFAULTS: Record<ArcNetwork, NetworkDefaults> = {
  testnet: {
    chain: arcTestnet,
    kasihAddress: '0xbff209b432510373cc5c87d11d1889c42886cbf1',
    kasihDeployBlock: 68_883_124n,
    wssUrl: 'wss://rpc.testnet.arc.io',
  },
  mainnet: {
    chain: arc,
    kasihAddress: '0x4030419B833B8265D8298360B507B2E2B5A0817A',
    kasihDeployBlock: 27_650_479n,
    wssUrl: 'wss://rpc.mainnet.arc.io',
  },
};

const selected = NETWORK_ENV[ARC_NETWORK];
const defaults = DEFAULTS[ARC_NETWORK];

/** Selected network's value, else the legacy override, else the built-in default. */
function resolve(specific: string | undefined, legacy: string | undefined, fallback: string): string {
  const value = specific || legacy || fallback;
  return value.trim();
}

function parseBlock(value: string): bigint {
  try {
    const block = BigInt(value);
    return block > 0n ? block : 0n;
  } catch {
    return 0n;
  }
}

/** Order used for RPC calls, wallet prompts, the overlay, and explorer links. */
export const ARC_CHAIN: Chain = defaults.chain;

const customRpc = selected.rpcUrl || LEGACY_ENV.rpcUrl;

/** HTTP(S) RPC this build talks to. */
export const ARC_RPC_URL = customRpc
  ? customRpc.trim()
  : resolve(undefined, undefined, defaults.chain.rpcUrls.default.http[0]);

/**
 * WebSocket RPC. An explicitly configured WSS wins; otherwise derive one from a custom
 * HTTP RPC (local nodes), and only then fall back to the network's public WSS.
 */
export const ARC_WSS_URL = selected.wssUrl || LEGACY_ENV.wssUrl
  ? resolve(selected.wssUrl, LEGACY_ENV.wssUrl, defaults.wssUrl)
  : customRpc
    ? customRpc.trim().replace(/^http/, 'ws')
    : defaults.wssUrl;

/** Human name used when asking the wallet to add the network. */
export const ARC_NETWORK_LABEL = resolve(
  selected.chainName,
  LEGACY_ENV.chainName,
  defaults.chain.name,
);

/** Explorer base for the selected network (no trailing slash). */
export const ARC_EXPLORER_URL = resolve(
  selected.explorerUrl,
  LEGACY_ENV.explorerUrl,
  getChain(defaults.chain.id)?.explorerBase ?? '',
);

/** KasihCengkring contract on the selected network. */
export const KASIH_ADDRESS_CONTRACT = resolve(
  selected.kasihAddress,
  LEGACY_ENV.kasihAddress,
  defaults.kasihAddress,
) as `0x${string}`;

/**
 * First block that contains the contract. `0` means "unknown" — log scans then fall
 * back to a rolling window.
 */
export const KASIH_DEPLOY_BLOCK_CONTRACT = parseBlock(
  resolve(
    selected.kasihDeployBlock,
    LEGACY_ENV.kasihDeployBlock,
    defaults.kasihDeployBlock.toString(),
  ),
);

/** USDC on the selected network (the Arc predeploy by default). */
export const USDC_ADDRESS_CONTRACT = resolve(
  selected.usdcAddress,
  LEGACY_ENV.usdcAddress,
  getUsdc(defaults.chain.id)?.address ?? '0x3600000000000000000000000000000000000000',
) as `0x${string}`;
