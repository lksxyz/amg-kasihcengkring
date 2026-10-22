/**
 * /app/history — Full donation history with search, date filter, CSV export.
 */
import { useState, useEffect, useCallback } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { arcTestnet } from 'viem/chains';
import { ConnectKitButton } from 'connectkit';
import { ExternalLink, Download, Eye, EyeOff, ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import Layout from '../components/Layout';
import { Skeleton } from '../components/Skeleton';
import { buildTxExplorerUrl } from '../onchain-facts';
import { formatUsdc, formatAddress, formatDate } from '../lib/utils';

const ARC_CHAIN_ID = arcTestnet.id;
const PAGE_SIZE = 20;

interface Donation {
  id: string;
  donor_address: string;
  donor_name: string;
  message: string;
  amount_raw: string;
  tx_hash: string;
  block_timestamp: number;
  hidden: boolean;
}

export default function HistoryPage() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const isWrongChain = isConnected && chainId !== ARC_CHAIN_ID;

  const [donations, setDonations] = useState<Donation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  const fetchDonations = useCallback(() => {
    if (!address || !supabaseUrl || !supabaseAnonKey) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set('creator_wallet', `eq.${address}`);
    params.set('order', 'block_timestamp.desc');
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));
    params.set('select', '*');
    if (search.trim()) params.set('or', `(donor_name.ilike.*${search}*,message.ilike.*${search}*,donor_address.ilike.*${search}*)`);
    if (dateFrom) params.set('block_timestamp', `gte.${Math.floor(new Date(dateFrom).getTime() / 1000)}`);
    if (dateTo) params.set('block_timestamp', `lte.${Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)}`);

    void fetch(`${supabaseUrl}/rest/v1/donations?${params}`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}`, Prefer: 'count=exact' },
    })
      .then((r) => {
        const countHeader = r.headers.get('content-range');
        if (countHeader) setTotal(parseInt(countHeader.split('/')[1] ?? '0'));
        return r.json() as Promise<Donation[]>;
      })
      .then((rows) => setDonations(rows ?? []))
      .catch(() => setDonations([]))
      .finally(() => setLoading(false));
  }, [address, page, search, dateFrom, dateTo, supabaseUrl, supabaseAnonKey]);

  useEffect(() => { fetchDonations(); }, [fetchDonations]);

  const handleToggleHidden = (id: string, currentlyHidden: boolean) => {
    if (!supabaseUrl || !supabaseAnonKey) return;
    setToggling(id);
    const sessionToken = sessionStorage.getItem('kc_session_token');
    void fetch(`${supabaseUrl}/rest/v1/donations?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${sessionToken ?? supabaseAnonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ hidden: !currentlyHidden }),
    }).then(() => {
      setToggling(null);
      fetchDonations();
    }).catch(() => setToggling(null));
  };

  const exportCsv = () => {
    const header = 'Date,Donor,Address,Amount USDC,Message,TX Hash';
    const rows = donations.map((d) =>
      [
        formatDate(d.block_timestamp),
        `"${d.donor_name || 'Anonymous'}"`,
        d.donor_address,
        (Number(d.amount_raw) / 1_000_000).toFixed(6),
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

  const totalAmount = donations.reduce((sum, d) => sum + BigInt(d.amount_raw), 0n);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (!isConnected) {
    return (
      <Layout>
        <div className="mx-auto max-w-md px-4 py-20 text-center space-y-4">
          <p className="display text-xl font-700" style={{ color: 'var(--ink)' }}>Connect to view history</p>
          <div className="flex justify-center"><ConnectKitButton /></div>
        </div>
      </Layout>
    );
  }

  if (isWrongChain) {
    return (
      <Layout>
        <div className="mx-auto max-w-md px-4 py-20 text-center space-y-4">
          <p className="display text-xl font-700" style={{ color: 'var(--ink)' }}>Switch to Arc</p>
          <button onClick={() => switchChain({ chainId: ARC_CHAIN_ID })} disabled={isSwitching} className="rounded-2xl px-6 py-3 text-sm font-600 text-white" style={{ background: 'var(--accent)' }}>
            {isSwitching ? <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Switching…</span> : 'Switch to Arc'}
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-5xl px-4 py-10 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="display text-2xl font-700" style={{ color: 'var(--ink)' }}>Donation History</h1>
          <button
            onClick={exportCsv}
            disabled={donations.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-500 transition-colors disabled:opacity-40"
            style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: 'var(--surface-muted)' }}
            aria-label="Export donations as CSV"
          >
            <Download className="size-4" aria-hidden="true" /> Export CSV
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 pointer-events-none" style={{ color: 'var(--subtle)' }} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search donor, message…"
              className="w-full rounded-xl border pl-9 pr-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)', color: 'var(--ink)' }}
              aria-label="Search donations"
            />
          </div>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            className="rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)', color: 'var(--ink)' }}
            aria-label="Filter from date"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            className="rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)', color: 'var(--ink)' }}
            aria-label="Filter to date"
          />
        </div>

        {/* Summary */}
        {!loading && donations.length > 0 && (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Showing {donations.length} of {total} donations (page {page + 1}/{totalPages || 1}) · Total on page: <strong>{formatUsdc(totalAmount)} USDC</strong>
          </p>
        )}

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {[0,1,2,3,4].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
          </div>
        ) : donations.length === 0 ? (
          <div className="rounded-2xl border p-10 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>No donations found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Donor', 'Address', 'Amount', 'Message', 'TX', 'Hide'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-600" style={{ color: 'var(--muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {donations.map((d, i) => (
                  <tr
                    key={d.id}
                    style={{
                      background: d.hidden ? 'rgba(138,132,156,0.06)' : i % 2 === 0 ? 'var(--surface)' : 'transparent',
                      borderBottom: '1px solid var(--border)',
                      opacity: d.hidden ? 0.6 : 1,
                    }}
                  >
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--muted)' }}>{formatDate(d.block_timestamp)}</td>
                    <td className="px-4 py-3 max-w-xs truncate font-500" style={{ color: 'var(--ink)' }}>{d.donor_name || 'Anonymous'}</td>
                    <td className="px-4 py-3 mono text-xs whitespace-nowrap" style={{ color: 'var(--subtle)' }}>{formatAddress(d.donor_address)}</td>
                    <td className="px-4 py-3 tabular-nums font-600 whitespace-nowrap" style={{ color: 'var(--success)' }}>+{formatUsdc(BigInt(d.amount_raw))}</td>
                    <td className="px-4 py-3 max-w-xs truncate" style={{ color: 'var(--ink-2)' }}>{d.message || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <a
                        href={buildTxExplorerUrl(ARC_CHAIN_ID, d.tx_hash as `0x${string}`)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1"
                        style={{ color: 'var(--accent-hover)' }}
                        aria-label="View transaction on ArcScan"
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleHidden(d.id, d.hidden)}
                        disabled={toggling === d.id}
                        aria-label={d.hidden ? 'Show this donation' : 'Hide this donation'}
                        className="rounded-lg p-1.5 transition-colors hover:bg-black/5 disabled:opacity-40"
                      >
                        {toggling === d.id ? (
                          <Loader2 className="size-4 animate-spin" style={{ color: 'var(--subtle)' }} />
                        ) : d.hidden ? (
                          <EyeOff className="size-4" style={{ color: 'var(--danger)' }} aria-hidden="true" />
                        ) : (
                          <Eye className="size-4" style={{ color: 'var(--subtle)' }} aria-hidden="true" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-xl border p-2 disabled:opacity-40"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" style={{ color: 'var(--ink)' }} aria-hidden="true" />
            </button>
            <span className="text-sm" style={{ color: 'var(--muted)' }}>Page {page + 1} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-xl border p-2 disabled:opacity-40"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" style={{ color: 'var(--ink)' }} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
