/**
 * /app — sign-in, onboarding, and dashboard.
 * Shows: connect wallet, register username, stats, latest supporters.
 */
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, usePublicClient, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { arcTestnet } from 'viem/chains';
import { ConnectKitButton } from 'connectkit';
import {
  Loader2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Wallet,
  ArrowRight,
  Copy,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '../components/Layout';
import { Skeleton, SkeletonCard } from '../components/Skeleton';
import { PageHeader } from '../components/PageHeader';
import { StatePanel, EmptyState } from '../components/States';
import { KASIH_ADDRESS, KASIH_ABI, MIN_DONATION_FLOOR_FALLBACK } from '../contract';
import { buildTxExplorerUrl } from '../onchain-facts';
import { formatUsdc, formatAddress, formatDate, validateUsername, parseUsdcInput, decodeRevert } from '../lib/utils';
import { useOnchainUsername } from '../lib/useOnchainUsername';
import { getChainDonations, ZERO_HASH, type DonationRow } from '../lib/donations';

const ARC_CHAIN_ID = arcTestnet.id;

interface Donation {
  id: string;
  donor_address: string;
  donor_name: string;
  message: string;
  amount_raw: string;
  fee_raw?: string;
  net_raw?: string;
  tx_hash: string;
  block_timestamp: number;
}

interface Stats {
  total: string;
  last7: string;
  last30: string;
  count: number;
}

function statsFromChain(rows: DonationRow[]): Stats {
  const now = Math.floor(Date.now() / 1000);
  const sum = (list: DonationRow[]) => list.reduce((acc, row) => acc + BigInt(row.net_raw), 0n);
  const format = (value: bigint) => (Number(value) / 1_000_000).toFixed(2);
  return {
    total: format(sum(rows)),
    last7: format(sum(rows.filter((row) => row.block_timestamp >= now - 7 * 86_400))),
    last30: format(sum(rows.filter((row) => row.block_timestamp >= now - 30 * 86_400))),
    count: rows.length,
  };
}

export default function AppDashboard() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID });
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
  const [copied, setCopied] = useState(false);
  const onchainUsername = useOnchainUsername(address);
  const effectiveUsername = username || onchainUsername;

  useEffect(() => {
    if (!address || !isRegistered) return;
    let cancelled = false;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

    // Chain is authoritative; the Supabase mirror may refine it afterwards.
    const loadChain = async () => {
      if (!publicClient || !existingHash || existingHash === ZERO_HASH) return;
      setLoadingStats(true);
      try {
        const rows = await getChainDonations(publicClient, { usernameHash: existingHash });
        if (cancelled) return;
        setRecentDonations(rows.slice(0, 5));
        setStats(statsFromChain(rows));
      } catch {
        if (!cancelled) setStats(null);
      } finally {
        if (!cancelled) setLoadingStats(false);
      }
    };

    void loadChain();

    if (!supabaseUrl || !supabaseAnonKey) return () => { cancelled = true; };

    // Aggregation is served by supabase/functions/creator-stats. Default to it once Supabase is
    // configured; override with VITE_CREATOR_STATS_URL, or set that to an empty value to opt out.
    const creatorStatsUrl =
      (import.meta.env.VITE_CREATOR_STATS_URL as string | undefined) ??
      `${supabaseUrl}/functions/v1/creator-stats`;

    void fetch(`${supabaseUrl}/rest/v1/profiles?wallet_address=eq.${address.toLowerCase()}&select=username`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`profiles ${r.status}`);
        return r.json() as Promise<{ username: string }[]>;
      })
      .then((rows) => {
        if (!cancelled && rows[0]) setUsername(rows[0].username);
      })
      .catch(() => {});

    if (creatorStatsUrl) {
      void fetch(`${creatorStatsUrl}?wallet=${address}`, {
        headers: { Authorization: `Bearer ${supabaseAnonKey}` },
      })
        .then((r) => {
          if (!r.ok) throw new Error(`creator-stats ${r.status}`);
          return r.json() as Promise<Stats>;
        })
        .then((data) => {
          // A missing or not-yet-indexed mirror reports zeros; never let it wipe the
          // chain-computed numbers.
          if (!cancelled && data && data.count > 0) setStats(data);
        })
        .catch(() => {});
    }

    void fetch(`${supabaseUrl}/rest/v1/donations?creator_wallet=eq.${address.toLowerCase()}&order=block_timestamp.desc&limit=5&select=*`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`donations ${r.status}`);
        return r.json() as Promise<Donation[]>;
      })
      .then((rows) => {
        if (!cancelled && rows.length > 0) setRecentDonations(rows);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [address, isRegistered, existingHash, publicClient]);

  const profileUrl =
    effectiveUsername && typeof window !== 'undefined'
      ? `${window.location.origin}/${effectiveUsername}`
      : '';

  const copyProfileUrl = async () => {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      toast.success('Page link copied.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the link. Copy it from the address bar instead.');
    }
  };

  if (!isConnected) {
    return (
      <Layout>
        <div className="shell page">
          <div className="mx-auto max-w-lg">
            <StatePanel
              icon={Wallet}
              title="Connect your wallet"
              description="Claim a username and receive USDC directly to your wallet. No account, no email."
            >
              <ConnectKitButton label="Connect wallet" />
            </StatePanel>
          </div>
        </div>
      </Layout>
    );
  }

  if (isWrongChain) {
    return (
      <Layout>
        <div className="shell page">
          <div className="mx-auto max-w-lg">
            <StatePanel
              icon={Wallet}
              title="Switch to Arc"
              description="KasihCengkring runs on Arc, where gas is paid in USDC instead of ETH."
            >
              <button
                type="button"
                onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
                disabled={isSwitching}
                className="btn btn-primary"
              >
                {isSwitching ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Switching…
                  </>
                ) : (
                  'Switch to Arc'
                )}
              </button>
            </StatePanel>
          </div>
        </div>
      </Layout>
    );
  }

  if (isHashLoading) {
    return (
      <Layout>
        <div className="shell page" aria-busy="true">
          <p className="sr-only" role="status">
            Loading your dashboard…
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </Layout>
    );
  }

  if (!isRegistered) {
    return (
      <Layout>
        <div className="shell page">
          <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
            <div className="space-y-5">
              <div className="space-y-3">
                <h1 className="display text-[2rem] font-bold sm:text-[2.5rem]" style={{ color: 'var(--ink)' }}>
                  Claim your username
                </h1>
                <p className="max-w-md text-pretty text-base" style={{ color: 'var(--muted)' }}>
                  One transaction creates your public page. Supporters send USDC and it lands in
                  your payout wallet immediately.
                </p>
              </div>
              <ul className="space-y-3">
                {[
                  'Your username is permanent. Choose carefully.',
                  'Change your payout address and minimum donation anytime.',
                  'A small platform fee is deducted from each donation. Supporters only pay Arc gas.',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--ink-2)' }}>
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0"
                      style={{ color: 'var(--accent-deep)' }}
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <RegisterForm onRegistered={() => window.location.reload()} />
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="shell page">
        <div className="section-stack">
          <PageHeader
            title="Dashboard"
            description={`Signed in as ${formatAddress(address ?? '')}`}
          >
            {effectiveUsername && (
              <Link to={`/${effectiveUsername}`} className="btn btn-secondary btn-sm">
                View public page
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </Link>
            )}
          </PageHeader>

          {/* Stats */}
          <section aria-label="Donation totals" className="card grid grid-cols-2 overflow-hidden p-0 sm:grid-cols-4">
            {loadingStats ? (
              [0, 1, 2, 3].map((i) => (
                <div key={i} className="p-4 sm:p-5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-2 h-7 w-24" />
                </div>
              ))
            ) : (
              <>
                <StatCell index={0} label="Total received" value={stats?.total ?? '—'} />
                <StatCell index={1} label="Last 7 days" value={stats?.last7 ?? '—'} />
                <StatCell index={2} label="Last 30 days" value={stats?.last30 ?? '—'} />
                <StatCell index={3} label="Supporters" value={stats ? String(stats.count) : '—'} unit="" />
              </>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            {/* Recent donations */}
            <section aria-labelledby="recent-donations">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="recent-donations" className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
                  Recent donations
                </h2>
                <Link to="/app/history" className="link text-sm">
                  View all
                </Link>
              </div>

              {loadingStats ? (
                <div className="card overflow-hidden p-0">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="border-b p-5 last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="mt-2 h-3 w-48" />
                    </div>
                  ))}
                </div>
              ) : recentDonations.length === 0 ? (
                <EmptyState
                  title="No donations yet"
                  description={
                    effectiveUsername
                      ? `Share /${effectiveUsername} to receive your first donation.`
                      : 'Share your page to receive your first donation.'
                  }
                />
              ) : (
                <ul className="card overflow-hidden p-0">
                  {recentDonations.map((d) => (
                    <DonationRow key={d.id} d={d} />
                  ))}
                </ul>
              )}
            </section>

            {/* Account sidebar */}
            <aside className="space-y-4" aria-label="Account">
              <div className="card p-5">
                <h2 className="display text-base font-bold" style={{ color: 'var(--ink)' }}>
                  Share your page
                </h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                  Every donation starts with someone opening your link.
                </p>
                {profileUrl ? (
                  <div className="mt-4 flex items-center gap-2">
                    <code
                      className="mono min-w-0 flex-1 truncate rounded-lg border px-3 py-2 text-xs"
                      style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
                      title={profileUrl}
                    >
                      /{effectiveUsername}
                    </code>
                    <button type="button" onClick={() => void copyProfileUrl()} className="btn btn-secondary btn-sm">
                      {copied ? (
                        <>
                          <Check className="size-3.5" aria-hidden="true" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" aria-hidden="true" />
                          Copy link
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <p className="mt-4 text-xs" style={{ color: 'var(--subtle)' }}>
                    Loading your page address…
                  </p>
                )}
              </div>

              <div className="card-muted p-5">
                <h2 className="display text-base font-bold" style={{ color: 'var(--ink)' }}>
                  Maximum donation
                </h2>
                <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {maxDonation !== undefined ? `${formatUsdc(maxDonation)} USDC` : '—'}
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  Set by the contract owner and applied to every creator.
                </p>
              </div>

              <Link to="/app/setting" className="card flex items-center justify-between gap-3 p-5 transition-colors hover:bg-[var(--accent-soft)]">
                <span>
                  <span className="block text-sm font-bold" style={{ color: 'var(--ink)' }}>
                    Payout and minimum
                  </span>
                  <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                    Manage where USDC goes
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0" style={{ color: 'var(--ink-2)' }} aria-hidden="true" />
              </Link>
            </aside>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function StatCell({
  index,
  label,
  value,
  unit = 'USDC',
}: {
  index: number;
  label: string;
  value: string;
  unit?: string;
}) {
  const borders = [
    index < 2 ? 'border-b sm:border-b-0' : '',
    index % 2 === 1 ? 'border-l' : '',
    index > 0 ? 'sm:border-l' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`p-4 sm:p-5 ${borders}`} style={{ borderColor: 'var(--border)' }}>
      <p className="truncate text-xs font-medium" style={{ color: 'var(--muted)' }}>
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="display text-xl font-bold tabular-nums sm:text-2xl" style={{ color: 'var(--ink)' }}>
          {value}
        </span>
        {unit && (
          <span className="text-xs font-medium" style={{ color: 'var(--subtle)' }}>
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

function DonationRow({ d }: { d: Donation }) {
  const gross = BigInt(d.amount_raw);
  const fee = d.fee_raw ? BigInt(d.fee_raw) : 0n;
  const net = d.net_raw ? BigInt(d.net_raw) : gross - fee;
  return (
    <li className="border-b p-5 last:border-b-0" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
            {d.donor_name || 'Anonymous'}
            <span className="mono ml-2 text-xs font-normal" style={{ color: 'var(--subtle)' }}>
              {formatAddress(d.donor_address)}
            </span>
          </p>
          {d.message && (
            <p className="mt-1 text-sm text-pretty" style={{ color: 'var(--ink-2)' }}>
              {d.message}
            </p>
          )}
          <p className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'var(--subtle)' }}>
            <time dateTime={new Date(d.block_timestamp * 1000).toISOString()}>
              {formatDate(d.block_timestamp)}
            </time>
            <span aria-hidden="true">·</span>
            <a
              href={buildTxExplorerUrl(ARC_CHAIN_ID, d.tx_hash)}
              target="_blank"
              rel="noreferrer"
              className="link inline-flex items-center gap-1"
            >
              View transaction
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </p>
        </div>
        <p
          className="shrink-0 whitespace-nowrap text-right text-sm font-bold tabular-nums"
          style={{ color: 'var(--success)' }}
        >
          +{formatUsdc(net)} USDC
          {fee > 0n && (
            <span className="block text-xs font-normal tabular-nums" style={{ color: 'var(--subtle)' }}>
              fee {formatUsdc(fee)}
            </span>
          )}
        </p>
      </div>
    </li>
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

  const { data: minFloor } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'MIN_DONATION_FLOOR',
    chainId: ARC_CHAIN_ID,
  });
  const floor = minFloor ?? MIN_DONATION_FLOOR_FALLBACK;

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
      toast.success('Username registered.');
      onRegistered();
    }
  }, [isSuccess, onRegistered]);

  // Keep the latest refetch in a ref so the debounce effect does not restart on
  // every render (unstable hook identity made the spinner flicker).
  const checkRef = useRef(checkAvailability);
  useEffect(() => {
    checkRef.current = checkAvailability;
  }, [checkAvailability]);

  // Debounced availability check while typing
  useEffect(() => {
    if (usernameInput.length < 3) {
      setAvailability('unknown');
      return;
    }
    if (validateUsername(usernameInput)) {
      setAvailability('invalid');
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      // Only show the spinner when the RPC call actually starts, so fast typing
      // does not flash "checking" on every keystroke.
      setAvailability('checking');
      void checkRef.current()
        .then((result) => {
          if (cancelled) return;
          // undefined means the read failed (wrong RPC/contract), not "taken".
          if (result.data === undefined) setAvailability('unknown');
          else setAvailability(result.data ? 'available' : 'taken');
        })
        .catch(() => {
          if (!cancelled) setAvailability('unknown');
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [usernameInput]);

  const parsedMin = parseUsdcInput(minInput);
  const minValid = parsedMin !== null && parsedMin >= floor;

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

  const statusColor =
    availability === 'available'
      ? 'var(--success)'
      : availability === 'taken' || availability === 'invalid'
        ? 'var(--danger)'
        : 'var(--subtle)';

  return (
    <div className="card space-y-5 p-5 sm:p-6">
      <div>
        <h2 className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
          Register your page
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          This sends one transaction on Arc.
        </p>
      </div>

      {/* Username */}
      <div className="field">
        <label className="label" htmlFor="username-input">
          Username
        </label>
        <div className="relative">
          <input
            id="username-input"
            type="text"
            value={usernameInput}
            maxLength={20}
            onChange={(e) => setUsernameInput(e.target.value.toLowerCase())}
            placeholder="yourname"
            className="input pr-10"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="username-help username-status"
            aria-invalid={availability === 'taken' || availability === 'invalid'}
          />
          {availability === 'checking' && (
            <Loader2
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin"
              style={{ color: 'var(--subtle)' }}
              aria-hidden="true"
            />
          )}
        </div>
        <p id="username-help" className="hint">
          Your page will be /username. 3–20 characters: a–z, 0–9 and underscore. Permanent once
          registered.
        </p>
        <p id="username-status" className="text-xs" style={{ color: statusColor }} role="status">
          {availability === 'checking' && 'Checking availability…'}
          {availability === 'available' && 'This username is available.'}
          {availability === 'taken' && 'This username is already taken.'}
          {availability === 'invalid' && validateUsername(usernameInput)}
          {availability === 'unknown' &&
            usernameInput.length >= 3 &&
            'Could not check availability. Verify the RPC and contract address, then try again.'}
        </p>
      </div>

      {/* Payout address */}
      <div className="field">
        <label className="label" htmlFor="payout-input">
          Payout address
        </label>
        <input
          id="payout-input"
          type="text"
          value={payoutInput}
          onChange={(e) => setPayoutInput(e.target.value)}
          placeholder="0x…"
          className="input mono text-xs"
          spellCheck={false}
          aria-describedby="payout-help"
        />
        <p id="payout-help" className="hint">
          Donations go straight here. You can change it later in Settings.
        </p>
      </div>

      {/* Minimum donation */}
      <div className="field">
        <label className="label" htmlFor="min-input">
          Minimum donation (USDC)
        </label>
        <input
          id="min-input"
          type="text"
          inputMode="decimal"
          value={minInput}
          onChange={(e) => setMinInput(e.target.value)}
          placeholder="1.00"
          className="input"
          aria-describedby="min-help"
          aria-invalid={!minValid && minInput !== ''}
        />
        <p id="min-help" className="hint">
          The smallest amount a supporter can send. Minimum {formatUsdc(floor)} USDC.
        </p>
        {!minValid && minInput && (
          <p className="text-xs" style={{ color: 'var(--danger)' }} role="alert">
            Enter an amount of at least {formatUsdc(floor)} USDC.
          </p>
        )}
      </div>

      {errorMsg && (
        <div className="alert alert-danger" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p>{errorMsg}</p>
            {errorMsg.includes('Get test USDC') && (
              <p className="mt-1 text-xs">
                On Arc, gas is paid in USDC. Add a small USDC balance to your wallet, then try
                again.
              </p>
            )}
          </div>
        </div>
      )}

      {isSuccess ? (
        <div className="alert alert-success" role="status">
          <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
          <p className="font-bold">Registered. Loading your dashboard…</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleRegister}
          disabled={availability !== 'available' || !minValid || !payoutInput || isSubmitting || isConfirming}
          className="btn btn-primary w-full"
          aria-live="polite"
        >
          {isSubmitting && !isConfirming ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Confirm in wallet…
            </>
          ) : isConfirming ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Registering…
            </>
          ) : (
            'Claim username'
          )}
        </button>
      )}
    </div>
  );
}
