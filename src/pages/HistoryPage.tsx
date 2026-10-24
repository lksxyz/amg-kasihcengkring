/**
 * /app/history — Full donation history with search, date filter, CSV export.
 */
import { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContract, usePublicClient, useSwitchChain } from 'wagmi';
import { arcChain } from '../config';
import { ConnectKitButton } from 'connectkit';
import { ExternalLink, Download, ChevronLeft, ChevronRight, Loader2, Search, Wallet, FilterX } from 'lucide-react';
import Layout from '../components/Layout';
import { Skeleton } from '../components/Skeleton';
import { PageHeader } from '../components/PageHeader';
import { StatePanel, EmptyState } from '../components/States';
import { buildTxExplorerUrl } from '../onchain-facts';
import { KASIH_ADDRESS, KASIH_ABI } from '../contract';
import { formatUsdc, formatAddress, formatDate } from '../lib/utils';
import { getChainDonations, ZERO_HASH } from '../lib/donations';

const ARC_CHAIN_ID = arcChain.id;
const PAGE_SIZE = 20;

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
  hidden: boolean;
}

function grossOf(d: Donation): bigint {
  return BigInt(d.amount_raw);
}

function feeOf(d: Donation): bigint {
  return d.fee_raw ? BigInt(d.fee_raw) : 0n;
}

function netOf(d: Donation): bigint {
  return d.net_raw ? BigInt(d.net_raw) : grossOf(d) - feeOf(d);
}

export default function HistoryPage() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const isWrongChain = isConnected && chainId !== ARC_CHAIN_ID;

  const { data: creatorHash } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'walletToUsernameHash',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address },
  });

  const [donations, setDonations] = useState<Donation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  const fetchDonations = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setLoadError(false);

    // Prefer the Supabase mirror, but fall back to chain logs when it is absent,
    // unreachable, or empty (no indexer running).
    if (supabaseUrl && supabaseAnonKey) {
      try {
        const params = new URLSearchParams();
        params.set('creator_wallet', `eq.${address.toLowerCase()}`);
        params.set('order', 'block_timestamp.desc');
        params.set('limit', String(PAGE_SIZE));
        params.set('offset', String(page * PAGE_SIZE));
        params.set('select', '*');
        if (search.trim()) params.set('or', `(donor_name.ilike.*${search}*,message.ilike.*${search}*,donor_address.ilike.*${search}*)`);
        if (dateFrom) params.set('block_timestamp', `gte.${Math.floor(new Date(dateFrom).getTime() / 1000)}`);
        if (dateTo) params.set('block_timestamp', `lte.${Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)}`);

        const r = await fetch(`${supabaseUrl}/rest/v1/donations?${params}`, {
          headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}`, Prefer: 'count=exact' },
        });
        if (!r.ok) throw new Error(`donations ${r.status}`);
        const countHeader = r.headers.get('content-range');
        const count = countHeader ? parseInt(countHeader.split('/')[1] ?? '0') : 0;
        const rows = (await r.json()) as Donation[];
        // The table exists but no indexer has populated it: use chain logs.
        if (rows.length > 0) {
          setTotal(count);
          setDonations(rows);
          setLoading(false);
          return;
        }
      } catch {
        // Fall through to chain.
      }
    }

    try {
      if (!publicClient || !creatorHash || creatorHash === ZERO_HASH) {
        setDonations([]);
        setTotal(0);
        return;
      }
      let rows = await getChainDonations(publicClient, { usernameHash: creatorHash });
      const q = search.trim().toLowerCase();
      if (q) {
        rows = rows.filter(
          (d) =>
            d.donor_name.toLowerCase().includes(q) ||
            d.message.toLowerCase().includes(q) ||
            d.donor_address.toLowerCase().includes(q),
        );
      }
      if (dateFrom) {
        const from = Math.floor(new Date(dateFrom).getTime() / 1000);
        rows = rows.filter((d) => d.block_timestamp >= from);
      }
      if (dateTo) {
        const to = Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000);
        rows = rows.filter((d) => d.block_timestamp <= to);
      }
      setTotal(rows.length);
      setDonations(rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE));
    } catch {
      setLoadError(true);
      setDonations([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [address, page, search, dateFrom, dateTo, supabaseUrl, supabaseAnonKey, publicClient, creatorHash]);

  useEffect(() => { void fetchDonations(); }, [fetchDonations]);

  const exportCsv = () => {
    const header = 'Date,Supporter,Address,Gross USDC,Fee USDC,Net USDC,Message,TX Hash';
    const rows = donations.map((d) =>
      [
        formatDate(d.block_timestamp),
        `"${d.donor_name || 'Anonymous'}"`,
        d.donor_address,
        (Number(grossOf(d)) / 1_000_000).toFixed(6),
        (Number(feeOf(d)) / 1_000_000).toFixed(6),
        (Number(netOf(d)) / 1_000_000).toFixed(6),
        `"${(d.message ?? '').replace(/"/g, '""')}"`,
        d.tx_hash,
      ].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `donations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalNet = donations.reduce((sum, d) => sum + netOf(d), 0n);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = search.trim() !== '' || dateFrom !== '' || dateTo !== '';

  const clearFilters = () => {
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setPage(0);
  };

  if (!isConnected) {
    return (
      <Layout>
        <div className="shell page">
          <div className="mx-auto max-w-lg">
            <StatePanel
              icon={Wallet}
              title="Connect to view history"
              description="Your donation history is tied to the wallet that registered your page."
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
              description="Donation history is read from Arc. Switch networks to continue."
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

  return (
    <Layout>
      <div className="shell page">
        <div className="section-stack">
          <PageHeader
            title="Donation history"
            description="Every donation to your page. Search, filter by date, or export the result as CSV."
          >
            <button
              type="button"
              onClick={exportCsv}
              disabled={donations.length === 0}
              className="btn btn-secondary btn-sm"
            >
              <Download className="size-4" aria-hidden="true" />
              Export CSV
            </button>
          </PageHeader>

          {/* Filters */}
          <div className="card p-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end">
              <div className="field">
                <label className="label" htmlFor="history-search">
                  Search
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
                    style={{ color: 'var(--subtle)' }}
                    aria-hidden="true"
                  />
                  <input
                    id="history-search"
                    type="search"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                    placeholder="Name, message, or address"
                    className="input pl-9"
                  />
                </div>
              </div>
              <div className="field">
                <label className="label" htmlFor="history-from">
                  From
                </label>
                <input
                  id="history-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                  className="input"
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="history-to">
                  To
                </label>
                <input
                  id="history-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                  className="input"
                />
              </div>
              <button
                type="button"
                onClick={clearFilters}
                disabled={!hasFilters}
                className="btn btn-ghost btn-sm sm:mb-0.5"
              >
                <FilterX className="size-4" aria-hidden="true" />
                Clear
              </button>
            </div>
          </div>

          {/* Summary */}
          {!loading && donations.length > 0 && (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Showing {donations.length} of {total} donations · Page {page + 1} of {totalPages || 1} ·
              Total received on this page: <strong style={{ color: 'var(--ink)' }}>{formatUsdc(totalNet)} USDC</strong>
            </p>
          )}

          {/* Table */}
          {loading ? (
            <div className="space-y-2" aria-busy="true">
              <p className="sr-only" role="status">
                Loading your donation history…
              </p>
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
            </div>
          ) : loadError ? (
            <EmptyState
              title="Could not load donation history"
              description="Arc did not respond. Check your connection and try again."
            >
              <button type="button" onClick={() => void fetchDonations()} className="btn btn-secondary btn-sm">
                Try again
              </button>
            </EmptyState>
          ) : donations.length === 0 ? (
            hasFilters ? (
              <EmptyState
                title="No donations match these filters"
                description="Try a different search term or widen the date range."
              >
                <button type="button" onClick={clearFilters} className="btn btn-secondary btn-sm">
                  Clear filters
                </button>
              </EmptyState>
            ) : (
              <EmptyState
                title="No donations yet"
                description="When someone sends USDC to your page, it shows up here within seconds."
              />
            )
          ) : (
            <div className="space-y-2">
              <div
                className="overflow-x-auto rounded-2xl border"
                style={{ borderColor: 'var(--border)' }}
                tabIndex={0}
                role="region"
                aria-label="Donation history table, scroll horizontally to see all columns"
              >
                <table className="w-full min-w-[46rem] border-collapse text-sm">
                  <caption className="sr-only">
                    Donations received, newest first. Page {page + 1} of {totalPages || 1}.
                  </caption>
                  <thead>
                    <tr
                      style={{
                        background: 'var(--surface-muted)',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      {['Date', 'Supporter', 'Address', 'Amount', 'Message', 'Transaction'].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-bold"
                          style={{ color: 'var(--muted)' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {donations.map((d, i) => (
                      <tr
                        key={d.id}
                        style={{
                          background: i % 2 === 0 ? 'var(--surface-strong)' : 'transparent',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <td className="whitespace-nowrap px-4 py-3" style={{ color: 'var(--muted)' }}>
                          {formatDate(d.block_timestamp)}
                        </td>
                        <td className="max-w-xs truncate px-4 py-3 font-bold" style={{ color: 'var(--ink)' }}>
                          {d.donor_name || 'Anonymous'}
                        </td>
                        <td className="mono whitespace-nowrap px-4 py-3 text-xs" style={{ color: 'var(--subtle)' }}>
                          {formatAddress(d.donor_address)}
                        </td>
                        <td
                          className="whitespace-nowrap px-4 py-3 font-bold tabular-nums"
                          style={{ color: 'var(--success)' }}
                        >
                          +{formatUsdc(netOf(d))} USDC
                          {feeOf(d) > 0n && (
                            <span
                              className="block text-xs font-normal tabular-nums"
                              style={{ color: 'var(--subtle)' }}
                            >
                              {formatUsdc(grossOf(d))} − fee {formatUsdc(feeOf(d))}
                            </span>
                          )}
                        </td>
                        <td className="max-w-xs truncate px-4 py-3" style={{ color: 'var(--ink-2)' }}>
                          {d.message || '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <a
                            href={buildTxExplorerUrl(ARC_CHAIN_ID, d.tx_hash as `0x${string}`)}
                            target="_blank"
                            rel="noreferrer"
                            className="link inline-flex items-center gap-1 text-xs"
                          >
                            View
                            <ExternalLink className="size-3.5" aria-hidden="true" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs sm:hidden" style={{ color: 'var(--subtle)' }}>
                Scroll the table sideways to see every column.
              </p>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="flex items-center justify-center gap-3" aria-label="History pagination">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn btn-secondary btn-sm size-10 p-0"
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <span className="text-sm" style={{ color: 'var(--muted)' }}>
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn btn-secondary btn-sm size-10 p-0"
                aria-label="Next page"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </nav>
          )}
        </div>
      </div>
    </Layout>
  );
}
