/**
 * /:username — Public creator profile page.
 * Shows: profile (from Supabase), donation form, recent supporters.
 * Falls back to chain data for minDonation/maxDonation.
 */
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useReadContract } from 'wagmi';
import { arcTestnet } from 'viem/chains';
import { ExternalLink, UserPlus } from 'lucide-react';
import Layout from '../components/Layout';
import DonationForm from '../components/DonationForm';
import { Skeleton, SkeletonText } from '../components/Skeleton';
import { KASIH_ADDRESS, KASIH_ABI } from '../contract';
import { buildTxExplorerUrl } from '../onchain-facts';
import { formatUsdc, formatAddress, formatDate } from '../lib/utils';

const ARC_CHAIN_ID = arcTestnet.id;

// Fake Supabase types (replace with actual Supabase client when wired)
interface Profile {
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  twitter_url: string | null;
  website_url: string | null;
}

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

export default function CreatorPage() {
  const { username = '' } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);
  const supabaseConfigured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
  const [loadingProfile, setLoadingProfile] = useState(supabaseConfigured);
  const [loadingDonations, setLoadingDonations] = useState(supabaseConfigured);
  const [refreshDonationsTrigger, setRefreshDonationsTrigger] = useState(0);

  // Chain: creator info (payout address, min donation, registered)
  const { data: creatorData, isLoading: isCreatorLoading } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'getCreator',
    args: [username],
    chainId: ARC_CHAIN_ID,
    query: { enabled: username.length >= 3 },
  });

  // Chain: global max donation
  const { data: maxDonation, isLoading: isMaxLoading } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'maxDonation',
    chainId: ARC_CHAIN_ID,
  });

  // Supabase: load profile
  useEffect(() => {
    if (!username) return;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!supabaseUrl || !supabaseAnonKey) {
      return;
    }
    void fetch(`${supabaseUrl}/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=*`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    })
      .then((r) => r.json() as Promise<Profile[]>)
      .then((rows) => setProfile(rows[0] ?? null))
      .catch(() => setProfile(null))
      .finally(() => setLoadingProfile(false));
  }, [username]);

  // Supabase: load recent donations (non-hidden)
  useEffect(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!supabaseUrl || !supabaseAnonKey || !username) {
      return;
    }
    void fetch(
      `${supabaseUrl}/rest/v1/donations?creator_username=eq.${encodeURIComponent(username)}&hidden=eq.false&order=block_timestamp.desc&limit=10&select=*`,
      { headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` } }
    )
      .then((r) => r.json() as Promise<Donation[]>)
      .then((rows) => setDonations(rows ?? []))
      .catch(() => setDonations([]))
      .finally(() => setLoadingDonations(false));
  }, [username, refreshDonationsTrigger]);

  const isRegistered = creatorData?.[2] === true;
  const minDonation: bigint = creatorData?.[1] ?? 100_000n;
  const payoutAddress: string = creatorData?.[0] ?? '';
  const maxDon: bigint = (maxDonation) ?? 1_000_000_000n;

  const isLoading = isCreatorLoading || isMaxLoading || loadingProfile;

  // Not registered and not loading
  const notFound = !isLoading && !isCreatorLoading && !isRegistered;

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">

        {/* Profile card */}
        {isLoading ? (
          <div className="rounded-2xl border p-6 space-y-3" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-4">
              <Skeleton className="size-16 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <SkeletonText lines={2} />
          </div>
        ) : notFound ? (
          <div className="rounded-2xl border p-10 text-center space-y-4" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            <p className="display text-2xl font-700" style={{ color: 'var(--ink)' }}>@{username}</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>This username hasn't been claimed yet.</p>
            <Link
              to="/app"
              className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-600 text-white"
              style={{ background: 'var(--accent)' }}
            >
              <UserPlus className="size-4" aria-hidden="true" />
              Claim @{username}
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border p-6" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            <div className="flex items-start gap-4">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={`${username} avatar`}
                  className="size-16 rounded-full object-cover border"
                  style={{ borderColor: 'var(--border)' }}
                />
              ) : (
                <div
                  className="size-16 rounded-full flex items-center justify-center display text-xl font-700 text-white select-none"
                  style={{ background: 'var(--accent)' }}
                  aria-hidden="true"
                >
                  {(profile?.display_name ?? username).charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="display text-xl font-700" style={{ color: 'var(--ink)' }}>
                  {profile?.display_name ?? `@${username}`}
                </h1>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>@{username}</p>
                {profile?.bio && (
                  <p className="mt-2 text-sm" style={{ color: 'var(--ink-2)' }}>{profile.bio}</p>
                )}
                <div className="mt-2 flex gap-3">
                  {profile?.twitter_url && (
                    <a href={profile.twitter_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--accent-hover)' }}>
                      Twitter <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  )}
                  {profile?.website_url && (
                    <a href={profile.website_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--accent-hover)' }}>
                      Website <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Donation form */}
        {!isLoading && isRegistered && (
          <DonationForm
            username={username}
            minDonation={minDonation}
            maxDonation={maxDon}
            payoutAddress={payoutAddress}
            onSuccess={() => setRefreshDonationsTrigger((n) => n + 1)}
          />
        )}

        {/* Recent supporters */}
        {!isLoading && isRegistered && (
          <section>
            <h2 className="display text-base font-600 mb-3" style={{ color: 'var(--ink)' }}>Recent supporters</h2>
            {loadingDonations ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-2xl border p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                      <Skeleton className="h-6 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : donations.length === 0 ? (
              <div className="rounded-2xl border p-8 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>No supporters yet — be the first!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {donations.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-2xl border p-4"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-600" style={{ color: 'var(--ink)' }}>
                          {d.donor_name || 'Anonymous'}
                          <span className="ml-2 mono text-xs font-400" style={{ color: 'var(--subtle)' }}>
                            {formatAddress(d.donor_address)}
                          </span>
                        </p>
                        {d.message && (
                          <p className="mt-1 text-sm" style={{ color: 'var(--ink-2)' }}>{d.message}</p>
                        )}
                        <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>{formatDate(d.block_timestamp)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular-nums font-600 text-sm" style={{ color: 'var(--success)' }}>
                          +{formatUsdc(BigInt(d.amount_raw))}
                        </p>
                        <a
                          href={buildTxExplorerUrl(ARC_CHAIN_ID, d.tx_hash as `0x${string}`)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-xs mt-0.5"
                          style={{ color: 'var(--subtle)' }}
                          aria-label="View transaction on explorer"
                        >
                          Tx <ExternalLink className="size-2.5" aria-hidden="true" />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </Layout>
  );
}
