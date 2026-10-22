/**
 * /app — SIWE sign-in, onboarding, and dashboard.
 * Shows: connect wallet, register username, dashboard cards, latest donations.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { arcTestnet } from 'viem/chains';
import { ConnectKitButton } from 'connectkit';
import { Loader2, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '../components/Layout';
import { Skeleton, SkeletonCard } from '../components/Skeleton';
import { KASIH_ADDRESS, KASIH_ABI } from '../contract';
import { buildTxExplorerUrl } from '../onchain-facts';
import { formatUsdc, formatAddress, formatDate, validateUsername, parseUsdcInput, decodeRevert } from '../lib/utils';

const ARC_CHAIN_ID = arcTestnet.id;

interface Donation {
  id: string;
  donor_address: string;
  donor_name: string;
  message: string;
  amount_raw: string;
  tx_hash: string;
  block_timestamp: number;
}

interface Stats {
  total: string;
  last7: string;
  last30: string;
  count: number;
}

export default function AppDashboard() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const isWrongChain = isConnected && chainId !== ARC_CHAIN_ID;

  // On-chain: does this wallet already have a username?
  const { data: existingHash, isLoading: isHashLoading } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'walletToUsernameHash',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address },
  });

  const isRegistered = !!existingHash && existingHash !== '0x0000000000000000000000000000000000000000000000000000000000000000';

  // On-chain: global max donation (for display in dashboard)
  const { data: maxDonation } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'maxDonation',
    chainId: ARC_CHAIN_ID,
  });

  // Off-chain: stats from Supabase
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentDonations, setRecentDonations] = useState<Donation[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [username, setUsername] = useState('');

  useEffect(() => {
    if (!address || !isRegistered) return;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!supabaseUrl || !supabaseAnonKey) return;
    // Load profile to get username
    void fetch(`${supabaseUrl}/rest/v1/profiles?wallet_address=eq.${address}&select=username`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    })
      .then((r) => r.json() as Promise<{ username: string }[]>)
      .then((rows) => {
        if (rows[0]) setUsername(rows[0].username);
      })
      .catch(() => {});

    // Load stats via edge function
    setLoadingStats(true);
    void fetch(`${supabaseUrl}/functions/v1/creator-stats?wallet=${address}`, {
      headers: { Authorization: `Bearer ${supabaseAnonKey}` },
    })
      .then((r) => r.json() as Promise<Stats>)
      .then((data) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setLoadingStats(false));

    // Load recent donations
    void fetch(`${supabaseUrl}/rest/v1/donations?creator_wallet=eq.${address}&order=block_timestamp.desc&limit=5&select=*`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    })
      .then((r) => r.json() as Promise<Donation[]>)
      .then((rows) => setRecentDonations(rows ?? []))
      .catch(() => setRecentDonations([]));
  }, [address, isRegistered]);

  if (!isConnected) {
    return (
      <Layout>
        <div className="mx-auto max-w-md px-4 py-20 text-center space-y-4">
          <p className="display text-2xl font-700" style={{ color: 'var(--ink)' }}>Connect to get started</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to claim a username and receive donations.</p>
          <div className="flex justify-center pt-2">
            <ConnectKitButton label="Connect Wallet" />
          </div>
        </div>
      </Layout>
    );
  }

  if (isWrongChain) {
    return (
      <Layout>
        <div className="mx-auto max-w-md px-4 py-20 text-center space-y-4">
          <p className="display text-xl font-700" style={{ color: 'var(--ink)' }}>Switch to Arc</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>KasihCengkring runs on Arc (USDC as gas).</p>
          <button
            onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
            disabled={isSwitching}
            className="rounded-2xl px-6 py-3 text-sm font-600 text-white"
            style={{ background: 'var(--accent)' }}
          >
            {isSwitching ? <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Switching…</span> : 'Switch to Arc'}
          </button>
        </div>
      </Layout>
    );
  }

  if (isHashLoading) {
    return (
      <Layout>
        <div className="mx-auto max-w-3xl px-4 py-10 space-y-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </Layout>
    );
  }

  if (!isRegistered) {
    return (
      <Layout>
        <div className="mx-auto max-w-md px-4 py-10">
          <RegisterForm onRegistered={() => window.location.reload()} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-4 py-10 space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="display text-2xl font-700" style={{ color: 'var(--ink)' }}>Dashboard</h1>
            {username && (
              <Link to={`/${username}`} className="inline-flex items-center gap-1 text-sm mt-0.5" style={{ color: 'var(--accent-hover)' }}>
                /{ username} <ExternalLink className="size-3" />
              </Link>
            )}
          </div>
          <span className="mono text-xs rounded-lg border px-2 py-1" style={{ color: 'var(--subtle)', borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
            {formatAddress(address ?? '')}
          </span>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {loadingStats ? (
            [0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <StatCard label="Total received" value={stats ? `$${stats.total}` : '—'} />
              <StatCard label="Last 7 days" value={stats ? `$${stats.last7}` : '—'} />
              <StatCard label="Last 30 days" value={stats ? `$${stats.last30}` : '—'} />
              <StatCard label="Supporters" value={stats ? String(stats.count) : '—'} />
            </>
          )}
        </div>

        {/* Max donation (from chain) */}
        <div className="rounded-2xl border p-4 flex items-center justify-between" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div>
            <p className="text-xs font-500" style={{ color: 'var(--muted)' }}>Global donation limit</p>
            <p className="tabular-nums font-600 text-sm mt-0.5" style={{ color: 'var(--ink)' }}>
              {maxDonation !== undefined ? `${formatUsdc(maxDonation)} USDC` : <Skeleton className="h-5 w-20 inline-block" />}
            </p>
          </div>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>Set by contract owner</p>
        </div>

        {/* Recent donations */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="display text-base font-600" style={{ color: 'var(--ink)' }}>Recent donations</h2>
            <Link to="/app/history" className="text-sm font-500" style={{ color: 'var(--accent-hover)' }}>View all</Link>
          </div>
          {recentDonations.length === 0 ? (
            <div className="rounded-2xl border p-8 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                {username ? <>Share <strong>/{username}</strong> to start receiving donations.</> : 'No donations yet.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentDonations.map((d) => (
                <DonationRow key={d.id} d={d} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
    >
      <p className="text-xs font-500 truncate" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="display text-xl font-700 tabular-nums mt-1" style={{ color: 'var(--ink)' }}>{value}</p>
    </div>
  );
}

function DonationRow({ d }: { d: Donation }) {
  return (
    <div className="rounded-2xl border p-4 flex items-start justify-between gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="min-w-0">
        <p className="text-sm font-600" style={{ color: 'var(--ink)' }}>
          {d.donor_name || 'Anonymous'}
          <span className="ml-2 mono text-xs font-400" style={{ color: 'var(--subtle)' }}>{formatAddress(d.donor_address)}</span>
        </p>
        {d.message && <p className="mt-1 text-sm" style={{ color: 'var(--ink-2)' }}>{d.message}</p>}
        <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>{formatDate(d.block_timestamp)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="tabular-nums font-600 text-sm" style={{ color: 'var(--success)' }}>+{formatUsdc(BigInt(d.amount_raw))}</p>
        <a
          href={buildTxExplorerUrl(ARC_CHAIN_ID, d.tx_hash)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-xs mt-0.5"
          style={{ color: 'var(--subtle)' }}
          aria-label="View transaction"
        >
          Tx <ExternalLink className="size-2.5" />
        </a>
      </div>
    </div>
  );
}

// ─── Register form ────────────────────────────────────────────────────────────

function RegisterForm({ onRegistered }: { onRegistered: () => void }) {
  const { address } = useAccount();
  const [usernameInput, setUsernameInput] = useState('');
  const [payoutInput, setPayoutInput] = useState(address ?? '');
  const [minInput, setMinInput] = useState('1');
  const [availability, setAvailability] = useState<'unknown' | 'available' | 'taken' | 'invalid' | 'checking'>('unknown');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Live availability check from contract
  const { refetch: checkAvailability } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'isUsernameAvailable',
    args: [usernameInput],
    chainId: ARC_CHAIN_ID,
    query: { enabled: false },
  });

  useEffect(() => {
    if (isSuccess) {
      toast.success('Username registered!');
      onRegistered();
    }
  }, [isSuccess, onRegistered]);

  // Check availability on blur
  const handleBlur = useCallback(async () => {
    const err = validateUsername(usernameInput);
    if (usernameInput.length < 3) { setAvailability('unknown'); return; }
    if (err) { setAvailability('invalid'); return; }
    setAvailability('checking');
    const result = await checkAvailability();
    setAvailability(result.data ? 'available' : 'taken');
  }, [usernameInput, checkAvailability]);

  const parsedMin = parseUsdcInput(minInput);
  const minValid = parsedMin !== null && parsedMin >= 100_000n;

  const handleRegister = () => {
    if (!parsedMin || !payoutInput || isSubmitting) return;
    setErrorMsg('');
    setIsSubmitting(true);
    writeContract(
      {
        address: KASIH_ADDRESS,
        abi: KASIH_ABI,
        functionName: 'register',
        args: [usernameInput, payoutInput as `0x${string}`, parsedMin],
        chainId: ARC_CHAIN_ID,
        // Explicit gas avoids eth_estimateGas which fails when the RPC is slow
        gas: 200_000n,
      },
      {
        onSuccess: (hash) => { setTxHash(hash); },
        onError: (err) => { setIsSubmitting(false); setErrorMsg(decodeRevert(err)); },
      }
    );
  };

  const glass = {
    card: { background: 'var(--surface-strong)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)', border: '1px solid var(--border)' } as React.CSSProperties,
    inner: { background: 'var(--surface-muted)', border: '1px solid var(--border)' } as React.CSSProperties,
  };

  return (
    <div className="rounded-2xl p-6 space-y-5" style={glass.card}>
      <div>
        <h1 className="display text-xl font-700" style={{ color: 'var(--ink)' }}>Claim your username</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Register once. Supporters can send USDC to your page instantly.
        </p>
      </div>

      {/* Username */}
      <div className="space-y-1">
        <label className="text-xs font-500" htmlFor="username-input" style={{ color: 'var(--muted)' }}>Username (a-z 0-9 _, 3–20 chars)</label>
        <div className="relative">
          <input
            id="username-input"
            type="text"
            value={usernameInput}
            maxLength={20}
            onChange={(e) => {
              setUsernameInput(e.target.value.toLowerCase());
              setAvailability('unknown');
            }}
            onBlur={() => { void handleBlur(); }}
            placeholder="yourname"
            className="w-full rounded-xl border px-3 py-2 pr-9 text-sm outline-none"
            style={{
              borderColor: availability === 'available' ? 'var(--success)' : availability === 'taken' || availability === 'invalid' ? 'var(--danger)' : 'var(--border)',
              background: 'var(--surface-muted)',
              color: 'var(--ink)',
            }}
            aria-label="Username"
            aria-describedby="username-status"
          />
          {availability === 'checking' && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin pointer-events-none" style={{ color: 'var(--subtle)' }} aria-hidden="true" />
          )}
        </div>
        <p id="username-status" className="text-xs" style={{ color: availability === 'available' ? 'var(--success)' : availability === 'taken' || availability === 'invalid' ? 'var(--danger)' : 'var(--subtle)' }}>
          {availability === 'checking' && 'Checking…'}
          {availability === 'available' && 'Available!'}
          {availability === 'taken' && 'Username taken or reserved.'}
          {availability === 'invalid' && validateUsername(usernameInput)}
        </p>
      </div>

      {/* Payout address */}
      <div className="space-y-1">
        <label className="text-xs font-500" htmlFor="payout-input" style={{ color: 'var(--muted)' }}>Payout address (where USDC goes)</label>
        <input
          id="payout-input"
          type="text"
          value={payoutInput}
          onChange={(e) => setPayoutInput(e.target.value)}
          placeholder="0x..."
          className="w-full rounded-xl border px-3 py-2 mono text-xs outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)', color: 'var(--ink)' }}
          aria-label="Payout wallet address"
        />
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>USDC goes directly here. You can change it later.</p>
      </div>

      {/* Minimum donation */}
      <div className="space-y-1">
        <label className="text-xs font-500" htmlFor="min-input" style={{ color: 'var(--muted)' }}>Minimum donation (USDC, min 0.10)</label>
        <input
          id="min-input"
          type="text"
          inputMode="decimal"
          value={minInput}
          onChange={(e) => setMinInput(e.target.value)}
          placeholder="1.00"
          className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
          style={{ borderColor: !minValid && minInput ? 'var(--danger)' : 'var(--border)', background: 'var(--surface-muted)', color: 'var(--ink)' }}
          aria-label="Minimum donation amount"
        />
        {!minValid && minInput && <p className="text-xs" style={{ color: 'var(--danger)' }}>Minimum is 0.10 USDC</p>}
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-xl p-3" style={{ background: 'rgba(186,43,76,0.08)', border: '1px solid rgba(186,43,76,0.2)' }} role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--danger)' }} />
          <div>
            <p className="text-sm" style={{ color: 'var(--danger)' }}>{errorMsg}</p>
            {errorMsg.includes('Get test USDC') && (
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                On Arc, gas fees are paid in USDC — your wallet needs a small balance to send any transaction.
              </p>
            )}
          </div>
        </div>
      )}

      {isSuccess ? (
        <div className="flex items-center gap-2 rounded-xl p-3" style={{ background: 'rgba(26,128,71,0.1)', border: '1px solid rgba(26,128,71,0.2)' }}>
          <CheckCircle2 className="size-5" style={{ color: 'var(--success)' }} />
          <p className="text-sm font-600" style={{ color: 'var(--success)' }}>Registered! Refreshing…</p>
        </div>
      ) : (
        <button
          onClick={handleRegister}
          disabled={availability !== 'available' || !minValid || !payoutInput || isSubmitting || isConfirming}
          className="w-full rounded-2xl py-3.5 text-sm font-600 text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
          aria-live="polite"
        >
          {isSubmitting && !isConfirming
            ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Confirm in wallet…</span>
            : isConfirming
              ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Registering…</span>
              : 'Claim username'}
        </button>
      )}
    </div>
  );
}
