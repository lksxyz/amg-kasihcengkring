#!/usr/bin/env bun
/**
 * dev:local — one command for a full local Arc loop.
 *
 *   bun run dev:local
 *
 * Starts an Arc anvil node (foundry-arc), deploys KasihCengkring against the
 * predeployed USDC, funds a wallet with native gas + ERC-20 USDC, writes a
 * local-only Vite env file, and serves the frontend.
 *
 * Overridable through the environment:
 *   ARC_ANVIL        path to the Arc anvil binary (default: arc-anvil on PATH,
 *                    then ~/.local/bin/arc-anvil, then anvil)
 *   ARC_PORT         RPC port (default 8545)
 *   DEV_PORT         Vite port (default 5173)
 *   ARC_STATE        set to "off" to keep chain state in memory (default: persist
 *                    to .dev-local/state.json so wallet nonces survive restarts)
 *   FUND_ADDRESSES   comma-separated wallets to fund
 *                    (default 0xEf98...E86B,0x7792...7649; FUND_ADDRESS also accepted)
 *   FUND_NATIVE      native gas to send per wallet, in whole USDC (default 25)
 *   FUND_USDC        ERC-20 USDC to send per wallet, in whole USDC (default 2500)
 */
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RPC_PORT = Number(process.env.ARC_PORT ?? 8545);
const DEV_PORT = Number(process.env.DEV_PORT ?? 5173);
const RPC_URL = `http://127.0.0.1:${RPC_PORT}`;
const CHAIN_ID = 5042002;
const USDC = '0x3600000000000000000000000000000000000000';
const DEV_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const DEV_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const FUND_ADDRESSES = (process.env.FUND_ADDRESSES ?? process.env.FUND_ADDRESS ?? [
  '0xEf98df2e76dDA409fdF1F03889d150AAd387E86B',
  '0x779277363677D5EbB43C3c6DF05f37aC6f667649',
].join(','))
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value.length > 0);
const FUND_NATIVE = process.env.FUND_NATIVE ?? '25';
const FUND_USDC = process.env.FUND_USDC ?? '2500';
const MAX_DONATION = 500_000_000n;
const FEE_BPS = 100n; // 1% proportional platform fee
const FLAT_FEE = 10_000n; // 0.01 USDC flat platform fee
const LOG_DIR = path.join(ROOT, '.dev-local');
const STATE_PATH = path.join(LOG_DIR, 'state.json');
const PERSIST_STATE = process.env.ARC_STATE !== 'off';
const ENV_PATH = path.join(ROOT, '.env.localdev');

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function which(bin: string): string | undefined {
  const probe = spawnSync('sh', ['-c', `command -v ${JSON.stringify(bin)}`], { encoding: 'utf8' });
  const found = probe.stdout?.trim();
  return found && found.length > 0 ? found : undefined;
}

function resolveAnvil(): string {
  // Stock anvil has no Arc system contracts, so it is not a fallback: the Arc
  // fork is required for the USDC predeploy and USDC-denominated gas.
  const candidates = [
    process.env.ARC_ANVIL,
    which('arc-anvil'),
    path.join(os.homedir(), '.local/bin/arc-anvil'),
  ].filter((p): p is string => !!p);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return fail(
    'No arc-anvil found.\n' +
      'This app needs the foundry-arc fork (Arc USDC predeploy at 0x3600…0000).\n' +
      'Install foundry-arc, put arc-anvil on PATH, or set ARC_ANVIL=/path/to/arc-anvil.',
  );
}

function requireBinary(name: string): string {
  const fallback = path.join(os.homedir(), '.foundry/bin', name);
  const found = which(name) ?? (fs.existsSync(fallback) ? fallback : undefined);
  if (!found) fail(`Missing \`${name}\`. Install Foundry (foundry-arc) and retry.`);
  return found;
}

function resolveVite(): string {
  const bin = path.join(ROOT, 'node_modules', '.bin', 'vite');
  if (!fs.existsSync(bin)) fail('Dependencies missing. Run `bun install` first.');
  return bin;
}

async function rpc<T>(method: string, params: unknown[] = []): Promise<T | null> {
  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: T };
    return json.result ?? null;
  } catch {
    return null;
  }
}

async function waitForRpc(timeoutMs = 20_000): Promise<number | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const chainId = await rpc<string>('eth_chainId');
    if (chainId) return Number(BigInt(chainId));
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

function cast(args: string[]): string {
  return execFileSync(requireBinary('cast'), args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function formatUnits(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function writeLocalEnv(contractAddress: string): void {
  const header = '# Generated by `bun run dev:local` — local Arc only. Safe to delete.';
  const keys: Record<string, string> = {
    VITE_ARC_RPC_URL: RPC_URL,
    VITE_ARC_CHAIN_NAME: 'Arc Local',
    VITE_KASIH_ADDRESS: contractAddress,
  };

  const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8').split('\n') : [];
  const lines = existing.filter((line) => line.trim().length > 0 && !line.startsWith('#'));
  const kept: string[] = [];
  for (const line of lines) {
    const key = line.split('=')[0];
    if (!(key in keys)) kept.push(line);
  }
  for (const [key, value] of Object.entries(keys)) kept.push(`${key}=${value}`);
  fs.writeFileSync(ENV_PATH, `${header}\n${kept.join('\n')}\n`);
}

async function main(): Promise<void> {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const anvilBin = resolveAnvil();
  const viteBin = resolveVite();

  console.log(bold('\nKasihCengkring local dev\n'));
  console.log(dim(`  anvil: ${anvilBin}`));
  console.log(dim(`  state: ${PERSIST_STATE ? `${STATE_PATH} (persisted)` : 'in-memory'}`));
  console.log(dim(`  rpc:   ${RPC_URL} (chain ${CHAIN_ID})`));
  for (const wallet of FUND_ADDRESSES) console.log(dim(`  fund:  ${wallet}`));
  console.log('');

  let anvil: ChildProcess | undefined;
  let drain: number | null = null;
  let ownsAnvil = false;

  const existingChain = await waitForRpc(1_200);
  if (existingChain !== null) {
    if (existingChain !== CHAIN_ID) {
      fail(`Port ${RPC_PORT} already serves chain ${existingChain}, expected ${CHAIN_ID}. Stop it or set ARC_PORT.`);
    }
    console.log(dim('Reusing the node already listening on this port.\n'));
  } else {
    const logFile = path.join(LOG_DIR, 'anvil.log');
    drain = fs.openSync(logFile, 'w');
    const stateArgs = PERSIST_STATE
      ? ['--dump-state', STATE_PATH, ...(fs.existsSync(STATE_PATH) ? ['--load-state', STATE_PATH] : [])]
      : [];
    anvil = spawn(
      anvilBin,
      ['--host', '127.0.0.1', '--port', String(RPC_PORT), '--chain-id', String(CHAIN_ID), ...stateArgs],
      { cwd: ROOT, stdio: ['ignore', drain, drain] },
    );
    ownsAnvil = true;
    anvil.on('exit', (code) => {
      if (code !== null && code !== 0) console.error(`anvil exited with ${code}. See ${logFile}`);
    });

    const started = await waitForRpc();
    if (started === null) {
      fail(`Arc anvil did not become ready on ${RPC_URL}. See ${logFile}`);
    }
    if (started !== CHAIN_ID) fail(`Unexpected chain id ${started}.`);
  }

  const usdcCode = await rpc<string>('eth_getCode', [USDC, 'latest']);
  if (!usdcCode || usdcCode === '0x') {
    fail(
      `No USDC contract at ${USDC} on this node.\n` +
        'Use the foundry-arc anvil build (arc-anvil), not stock anvil.',
    );
  }

  // MetaMask polls eth_gasPrice constantly; prove the exact method works before
  // blaming the app when its network entry points somewhere else.
  const gasPrice = await rpc<string>('eth_gasPrice');
  if (!gasPrice) fail(`${RPC_URL} did not answer eth_gasPrice.`);
  console.log(dim(`  eth_gasPrice OK (${gasPrice})\n`));

  const devBalance = BigInt((await rpc<string>('eth_getBalance', [DEV_ADDRESS, 'latest'])) ?? '0x0');
  if (devBalance < 1_000n * 10n ** 18n) {
    const refill = 100_000n * 10n ** 18n;
    await rpc('anvil_setBalance', [DEV_ADDRESS, `0x${refill.toString(16)}`]);
    console.log(dim(`  dev account refilled to ${formatUnits(refill, 18)} USDC\n`));
  }

  console.log('Deploying KasihCengkring…');
  const forgeOut = execFileSync(
    requireBinary('forge'),
    [
      'create',
      'contracts/KasihCengkring.sol:KasihCengkring',
      '--rpc-url',
      RPC_URL,
      '--private-key',
      DEV_PRIVATE_KEY,
      '--broadcast',
      '--constructor-args',
      USDC,
      MAX_DONATION.toString(),
      DEV_ADDRESS, // treasury
      FEE_BPS.toString(),
      FLAT_FEE.toString(),
      DEV_ADDRESS, // owner
    ],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const match = forgeOut.match(/Deployed to:\s*(0x[0-9a-fA-F]{40})/);
  if (!match) fail(`Could not parse forge create output:\n${forgeOut}`);
  const contract = match[1];
  console.log(green(`  contract ${contract}`));

  const nativeWei = BigInt(FUND_NATIVE) * 10n ** 18n;
  const usdcAmount = BigInt(FUND_USDC) * 1_000_000n;

  console.log('\nFunding wallets…');
  for (const wallet of FUND_ADDRESSES) {
    cast(['send', wallet, '--value', `${nativeWei}`, '--private-key', DEV_PRIVATE_KEY, '--rpc-url', RPC_URL]);

    const devUsdc = BigInt(
      cast(['call', USDC, 'balanceOf(address)(uint256)', DEV_ADDRESS, '--rpc-url', RPC_URL]).split(' ')[0],
    );
    const usdcToSend = usdcAmount < devUsdc ? usdcAmount : devUsdc;
    if (usdcToSend > 0n) {
      cast([
        'send',
        USDC,
        'transfer(address,uint256)',
        wallet,
        usdcToSend.toString(),
        '--private-key',
        DEV_PRIVATE_KEY,
        '--rpc-url',
        RPC_URL,
      ]);
    }

    const nativeBalance = BigInt(cast(['balance', wallet, '--rpc-url', RPC_URL]));
    const usdcBalance = BigInt(
      cast(['call', USDC, 'balanceOf(address)(uint256)', wallet, '--rpc-url', RPC_URL]).split(' ')[0],
    );
    console.log(green(`  ${wallet}`));
    console.log(dim(`    native ${formatUnits(nativeBalance, 18)} USDC (gas view)`));
    console.log(dim(`    ERC-20 ${formatUnits(usdcBalance, 6)} USDC (ERC-20 view)`));
  }
  console.log(dim('  Arc uses one USDC balance for gas and ERC-20: both views track the same funds.'));

  writeLocalEnv(contract);

  const owner = cast(['call', contract, 'owner()(address)', '--rpc-url', RPC_URL]);
  const maxDonation = cast(['call', contract, 'maxDonation()(uint256)', '--rpc-url', RPC_URL]).split(' ')[0];
  const feeBps = cast(['call', contract, 'feeBps()(uint16)', '--rpc-url', RPC_URL]).split(' ')[0];
  const flatFee = cast(['call', contract, 'flatFee()(uint256)', '--rpc-url', RPC_URL]).split(' ')[0];
  const treasury = cast(['call', contract, 'treasury()(address)', '--rpc-url', RPC_URL]);

  console.log(`
${bold('Wallet setup (browser)')}
  Network : Arc Local
  RPC URL : ${RPC_URL}
  Chain ID: ${CHAIN_ID}
  Symbol  : USDC
  Explorer: (leave empty)
  ${dim('Use 127.0.0.1, not localhost: localhost resolves to ::1 here and anvil listens on IPv4 only.')}

${bold('Accounts')}
  Funded EOAs    : ${FUND_ADDRESSES.join(', ')}
  Owner / deployer: ${DEV_ADDRESS}
  Deployer key   : ${DEV_PRIVATE_KEY}
  ${dim('Import the owner key to register a creator or call pause/setMaxDonation.')}

${bold('Contract')}
  KasihCengkring : ${contract}
  USDC (predeploy): ${USDC}
  owner          : ${owner}
  maxDonation    : ${formatUnits(BigInt(maxDonation), 6)} USDC
  platform fee   : ${formatUnits(BigInt(flatFee), 6)} USDC + ${Number(feeBps) / 100}%
  treasury       : ${treasury}

${bold('Env')}
  ${path.relative(ROOT, ENV_PATH)} written (local RPC + contract address).

${bold('Frontend')}  http://localhost:${DEV_PORT}
${dim('Ctrl-C stops Vite and the anvil node started by this script.')}
${dim('Restarting leaves your wallet nonce ahead of the chain if txs were pending.')}
${dim('Wallet stuck on a skipped nonce? Run ARC_STATE=off bun run dev:local, then clear pending txs in the wallet.')}
`);

  // `bun run` auto-loads .env into process.env, and Vite gives process.env
  // priority over .env.localdev. Without this override the app would keep the
  // testnet contract address from .env while talking to the local RPC.
  const vite = spawn(viteBin, ['--mode', 'localdev', '--port', String(DEV_PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_KASIH_ADDRESS: contract,
      VITE_ARC_RPC_URL: RPC_URL,
      VITE_ARC_CHAIN_NAME: 'Arc Local',
    },
  });

  const shutdown = () => {
    if (vite.exitCode === null) vite.kill('SIGTERM');
    if (ownsAnvil && anvil) anvil.kill('SIGTERM');
    if (drain !== null) fs.closeSync(drain);
  };
  process.on('SIGINT', () => {
    shutdown();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    shutdown();
    process.exit(0);
  });

  await new Promise<void>((resolve) => {
    vite.on('exit', (code) => {
      if (ownsAnvil && anvil) anvil.kill('SIGTERM');
      if (drain !== null) fs.closeSync(drain);
      resolve();
      if (code !== 0 && code !== null) process.exitCode = code;
    });
  });
}

await main();
