/**
 * Shared utility helpers — no business logic, no onchain calls.
 */

/** Shorten a hex address for display: 0x1234...abcd */
export function formatAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** Format a raw USDC bigint (6 decimals) as "$1,234.56" */
export function formatUsdc(raw: bigint | undefined, opts?: { decimals?: number }): string {
  if (raw === undefined) return '—';
  const decimals = opts?.decimals ?? 2;
  const val = Number(raw) / 1_000_000;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val);
}

/** Parse a decimal string to USDC bigint (6 decimals). Returns null if invalid. */
export function parseUsdcInput(s: string): bigint | null {
  if (!s || s.trim() === '') return null;
  const cleaned = s.trim().replace(/,/g, '');
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '.') return null;
  const [intPart = '0', fracPart = ''] = cleaned.split('.');
  const padded = fracPart.slice(0, 6).padEnd(6, '0');
  try {
    return BigInt(intPart) * 1_000_000n + BigInt(padded);
  } catch {
    return null;
  }
}

/** Format seconds since epoch as a readable date */
export function formatDate(ts: number | bigint): string {
  const ms = typeof ts === 'bigint' ? Number(ts) * 1000 : ts * 1000;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(ms));
}

/** Validate a username client-side (mirrors contract _validateUsername) */
export function validateUsername(s: string): string | null {
  if (s.length < 3) return 'At least 3 characters';
  if (s.length > 20) return 'At most 20 characters';
  if (!/^[a-z0-9_]+$/.test(s)) return 'Only lowercase letters, digits, and underscores';
  return null;
}

/** Decode a contract revert or wallet error into a human-readable message */
export function decodeRevert(err: unknown): string {
  // Collect every string representation we can find — viem/wagmi nest the
  // real reason in .shortMessage, .details, .cause, or .cause.message.
  const e = err as Record<string, unknown> | null | undefined;
  const parts: string[] = [
    err instanceof Error ? err.message : typeof err === 'string' ? err : '',
    (e?.message as string) ?? '',
    (e?.shortMessage as string) ?? '',
    (e?.details as string) ?? '',
    ((e?.cause as Record<string, unknown>)?.message as string) ?? '',
    ((e?.cause as Record<string, unknown>)?.shortMessage as string) ?? '',
    ((e?.cause as Record<string, unknown>)?.details as string) ?? '',
  ];
  // Safe JSON stringify — skip on circular structures
  try { parts.push(JSON.stringify(err)); } catch { /* circular */ }
  const msg = parts.join(' ');

  if (msg.includes('user rejected') || msg.includes('User rejected') || msg.includes('4001')) return 'Transaction cancelled.';
  if (msg.includes('AmountAboveMax')) return 'Amount is above the current donation limit.';
  if (msg.includes('AmountBelowMin')) return "Amount is below this creator's minimum.";
  if (msg.includes('UsernameInvalid')) return 'Username is invalid.';
  if (msg.includes('UsernameTaken')) return 'Username is already taken.';
  if (msg.includes('UsernameReserved')) return 'That username is reserved.';
  if (msg.includes('AlreadyRegistered')) return 'This wallet already has a username.';
  if (msg.includes('NotRegistered')) return 'Creator not found.';
  if (msg.includes('ZeroAddress')) return 'Invalid address.';
  if (msg.includes('InvalidPayoutAddress')) return 'That payout address cannot be used.';
  if (msg.includes('InvalidToken')) return 'The USDC token is misconfigured for this deployment.';
  if (msg.includes('RenounceDisabled')) return 'Ownership cannot be renounced for this contract.';
  if (msg.includes('Pausable: paused') || msg.includes('EnforcedPause')) return 'The platform is paused right now. Try again later.';
  if (
    msg.includes('insufficient funds') ||
    msg.includes('exceeds balance') ||
    msg.includes('gas required exceeds') ||
    msg.includes('-32000') ||
    msg.includes('INSUFFICIENT_FUNDS') ||
    msg.includes('intrinsic gas') ||
    // MetaMask RPC error with no specific text — the wallet rejected silently
    // because the account balance is 0. This is the last-resort gas check.
    msg === 'Error: [object Object]' || msg.includes('[object Object]')
  ) return 'Not enough USDC to pay for gas. Add USDC to your wallet, then try again.';
  if (msg.includes('allowance')) return 'Approval is too low. Approve the exact amount, then retry.';
  if (msg.includes('network') || msg.includes('timeout')) return 'Could not reach the network. Check your connection and try again.';
  return 'Transaction failed. Please try again.';
}
