/**
 * /:username — Public creator profile page.
 * Shows: profile (from Supabase) and the donation form.
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

const ARC_CHAIN_ID = arcTestnet.id;

interface Profile {
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  twitter_url: string | null;
  website_url: string | null;
}

export default function CreatorPage() {
  const { username = '' } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const supabaseConfigured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
  const [loadingProfile, setLoadingProfile] = useState(supabaseConfigured);

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
    void fetch(`${supabaseUrl}/rest/v1/profiles?username=eq.${encodeURIComponent(username.toLowerCase())}&select=*`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`profiles ${r.status}`);
        return r.json() as Promise<Profile[]>;
      })
      .then((rows) => setProfile(rows[0] ?? null))
      .catch(() => setProfile(null))
      .finally(() => setLoadingProfile(false));
  }, [username]);

  const isRegistered = creatorData?.[2] === true;
  const minDonation: bigint = creatorData?.[1] ?? 100_000n;
  const payoutAddress: string = creatorData?.[0] ?? '';
  const maxDon: bigint = maxDonation ?? 1_000_000_000n;

  const isLoading = isCreatorLoading || isMaxLoading || loadingProfile;
  const notFound = !isLoading && !isCreatorLoading && !isRegistered;
  const displayName = profile?.display_name ?? username;

  if (notFound) {
    return (
      <Layout minimal>
        <div className="shell page">
          <div className="mx-auto max-w-xl">
            <div className="card flex flex-col items-start gap-4 p-6 sm:p-8">
              <div>
                <h1 className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>
                  @{username}
                </h1>
                <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                  No creator has claimed this username yet. It is still available.
                </p>
              </div>
              <Link to="/app" className="btn btn-primary">
                <UserPlus className="size-4" aria-hidden="true" />
                Claim @{username}
              </Link>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout minimal>
      <div className="shell page">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Profile */}
          <div>
            {isLoading ? (
              <div className="card space-y-4 p-6" aria-busy="true">
                <p className="sr-only" role="status">
                  Loading creator profile…
                </p>
                <div className="flex items-center gap-4">
                  <Skeleton className="size-16 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <SkeletonText lines={2} />
              </div>
            ) : (
              <div className="card p-6">
                <div className="flex items-start gap-4">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={`Avatar of ${displayName}`}
                      className="size-16 rounded-full border object-cover"
                      style={{ borderColor: 'var(--border)' }}
                    />
                  ) : (
                    <div
                      className="flex size-16 shrink-0 select-none items-center justify-center rounded-full text-xl font-bold"
                      style={{ background: 'var(--ink)', color: 'var(--accent)' }}
                      aria-hidden="true"
                    >
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h1
                      className="display truncate text-2xl font-bold"
                      style={{ color: 'var(--ink)' }}
                    >
                      {displayName}
                    </h1>
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>
                      @{username}
                    </p>
                    {profile?.bio && (
                      <p className="mt-3 text-sm text-pretty" style={{ color: 'var(--ink-2)' }}>
                        {profile.bio}
                      </p>
                    )}
                    {(profile?.twitter_url || profile?.website_url) && (
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                        {profile?.twitter_url && (
                          <a
                            href={profile.twitter_url}
                            target="_blank"
                            rel="noreferrer"
                            className="link inline-flex items-center gap-1 text-sm"
                          >
                            Twitter
                            <ExternalLink className="size-3" aria-hidden="true" />
                          </a>
                        )}
                        {profile?.website_url && (
                          <a
                            href={profile.website_url}
                            target="_blank"
                            rel="noreferrer"
                            className="link inline-flex items-center gap-1 text-sm"
                          >
                            Website
                            <ExternalLink className="size-3" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Donation form — the primary action */}
          {!isLoading && isRegistered && (
            <DonationForm
              username={username}
              minDonation={minDonation}
              maxDonation={maxDon}
              payoutAddress={payoutAddress}
            />
          )}
        </div>
      </div>
    </Layout>
  );
}
