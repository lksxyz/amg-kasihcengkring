/**
 * /:username — Public creator profile page.
 * Shows: profile (from Supabase, keyed by the on-chain registrant wallet) and the donation form.
 * Falls back to chain data for minDonation/maxDonation.
 */
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePublicClient, useReadContract } from 'wagmi';
import { arcChain } from '../config';
import { ExternalLink, UserPlus } from 'lucide-react';
import Layout from '../components/Layout';
import DonationForm from '../components/DonationForm';
import { Skeleton, SkeletonText } from '../components/Skeleton';
import { KASIH_ADDRESS, KASIH_ABI, MIN_DONATION_FLOOR_FALLBACK } from '../contract';
import { fetchProfileByWallet, resolveCreatorWallet, type ProfileRow } from '../lib/profiles';
import { validateUsername } from '../lib/utils';

const ARC_CHAIN_ID = arcChain.id;

export default function CreatorPage() {
  const { username = '' } = useParams<{ username: string }>();
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const supabaseConfigured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
  const [loadingProfile, setLoadingProfile] = useState(supabaseConfigured);

  // Chain: creator info (payout address, min donation, registered).
  // Prefer the non-reverting tryGetCreator; fall back to getCreator for older deployments.
  const {
    data: safeCreator,
    isLoading: isSafeCreatorLoading,
    error: safeCreatorError,
  } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'tryGetCreator',
    args: [username],
    chainId: ARC_CHAIN_ID,
    query: { enabled: username.length >= 3, retry: false },
  });

  const { data: legacyCreator, isLoading: isLegacyCreatorLoading } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'getCreator',
    args: [username],
    chainId: ARC_CHAIN_ID,
    query: { enabled: username.length >= 3 && !!safeCreatorError, retry: false },
  });

  // Chain: global max donation
  const { data: maxDonation, isLoading: isMaxLoading } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'maxDonation',
    chainId: ARC_CHAIN_ID,
  });

  const isRegistered = safeCreator ? safeCreator[3] : legacyCreator?.[2] === true;
  const minDonation: bigint =
    (safeCreator ? safeCreator[2] : legacyCreator?.[1]) ?? MIN_DONATION_FLOOR_FALLBACK;
  const payoutAddress: string = (safeCreator ? safeCreator[1] : legacyCreator?.[0]) ?? '';
  const maxDon: bigint = maxDonation ?? 1_000_000_000n;

  const isCreatorLoading =
    isSafeCreatorLoading || (!!safeCreatorError && isLegacyCreatorLoading);
  const isLoading = isCreatorLoading || isMaxLoading || loadingProfile;
  // Client-side mirror of the contract rules, plus the contract's own verdict when available.
  const invalidUsername =
    validateUsername(username) !== null ||
    (!isSafeCreatorLoading && !!safeCreator && !safeCreator[0]);
  const notFound = !isLoading && !isRegistered && !invalidUsername;

  // Supabase mirror, joined by wallet rather than username: the row is only trusted when the
  // `CreatorRegistered` log says this wallet owns the username, so an anon-written row cannot
  // decorate someone else's page. A missing row just means no bio/avatar.
  useEffect(() => {
    if (!supabaseConfigured) return;
    if (isCreatorLoading) return; // keep the skeleton until the chain verdict on registration
    if (username.length < 3 || !isRegistered || !publicClient) {
      setProfile(null);
      setLoadingProfile(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const wallet = await resolveCreatorWallet(publicClient, username);
        const row = wallet ? await fetchProfileByWallet(wallet) : null;
        if (!cancelled) setProfile(row);
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [username, isRegistered, isCreatorLoading, publicClient, supabaseConfigured]);

  if (invalidUsername) {
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
                  That username isn&apos;t valid. Use 3–20 characters: a–z, 0–9, and _.
                </p>
              </div>
              <Link to="/app" className="btn btn-primary">
                <UserPlus className="size-4" aria-hidden="true" />
                Choose a username
              </Link>
            </div>
          </div>
        </div>
      </Layout>
    );
  }
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
