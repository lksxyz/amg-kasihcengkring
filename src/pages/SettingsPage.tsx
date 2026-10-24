/**
 * /app/setting — Profile, avatar, social links, payout address, minimum donation.
 * Read-only: maxDonation (from chain), username (immutable).
 */
import { useState, useEffect, useId } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { arcTestnet } from 'viem/chains';
import { isAddress } from 'viem';
import { ConnectKitButton } from 'connectkit';
import { Loader2, Save, AlertCircle, CheckCircle2, LogOut, Upload, Wallet, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { StatePanel } from '../components/States';
import { KASIH_ADDRESS, KASIH_ABI, MIN_DONATION_FLOOR_FALLBACK } from '../contract';
import { formatUsdc, parseUsdcInput, decodeRevert } from '../lib/utils';
import { useOnchainUsername } from '../lib/useOnchainUsername';

const ARC_CHAIN_ID = arcTestnet.id;

interface ProfilePayload {
  display_name: string | null;
  bio: string | null;
  twitter_url: string | null;
  website_url: string | null;
  avatar_url: string | null;
}

export default function SettingsPage() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const isWrongChain = isConnected && chainId !== ARC_CHAIN_ID;

  // Chain reads
  const { data: maxDonation } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'maxDonation',
    chainId: ARC_CHAIN_ID,
  });
  const { data: feeBps } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'feeBps',
    chainId: ARC_CHAIN_ID,
  });
  const { data: flatFee } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'flatFee',
    chainId: ARC_CHAIN_ID,
  });
  const { data: minFloor } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'MIN_DONATION_FLOOR',
    chainId: ARC_CHAIN_ID,
  });
  const floor = minFloor ?? MIN_DONATION_FLOOR_FALLBACK;
  const feeLabel =
    feeBps !== undefined && flatFee !== undefined
      ? `${formatUsdc(flatFee)} USDC + ${(Number(feeBps) / 100).toFixed(2)}%`
      : null;

  const [username, setUsername] = useState('');
  const onchainUsername = useOnchainUsername(address);
  const effectiveUsername = username || onchainUsername;
  const [payoutInput, setPayoutInput] = useState('');
  const [minInput, setMinInput] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [twitterUrl, setTwitterUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [payoutTxHash, setPayoutTxHash] = useState<`0x${string}` | undefined>();
  const [minTxHash, setMinTxHash] = useState<`0x${string}` | undefined>();
  const [payoutError, setPayoutError] = useState('');
  const [minError, setMinError] = useState('');
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [payoutConfirmText, setPayoutConfirmText] = useState('');
  const [payoutStep, setPayoutStep] = useState<'confirm' | 'address'>('confirm');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  const { writeContract: writeUpdatePayout, isPending: isPayoutPending } = useWriteContract();
  const { isLoading: isPayoutConfirming, isSuccess: isPayoutSuccess } = useWaitForTransactionReceipt({ hash: payoutTxHash });

  const { writeContract: writeUpdateMin, isPending: isMinPending } = useWriteContract();
  const { isLoading: isMinConfirming, isSuccess: isMinSuccess } = useWaitForTransactionReceipt({ hash: minTxHash });

  // Load profile from the Supabase mirror. Chain reads remain the source of truth.
  useEffect(() => {
    if (!address) return;
    setPayoutInput(address);
    if (!supabaseUrl || !supabaseAnonKey) return;

    interface ProfileRow extends ProfilePayload {
      username?: string;
      payout_address?: string;
    }
    const walletKey = address.toLowerCase();
    void fetch(`${supabaseUrl}/rest/v1/profiles?wallet_address=eq.${walletKey}&select=*`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`profiles ${r.status}`);
        return r.json() as Promise<ProfileRow[]>;
      })
      .then((rows) => {
        const p = rows[0];
        if (!p) return;
        setUsername(p.username ?? '');
        setDisplayName(p.display_name ?? '');
        setBio(p.bio ?? '');
        setTwitterUrl(p.twitter_url ?? '');
        setWebsiteUrl(p.website_url ?? '');
        setAvatarPreview(p.avatar_url ?? null);
        setPayoutInput(p.payout_address ?? address);
      })
      .catch(() => {
        // Missing table / RLS / offline: keep chain-derived values, no local cache.
      });
  }, [address, supabaseUrl, supabaseAnonKey]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Choose a PNG, JPG, or WebP image.');
      return;
    }
    if (file.size > 1_048_576) {
      toast.error('The image must be smaller than 1 MB.');
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSaveProfile = async () => {
    if (!address) {
      toast.error('Connect a wallet first.');
      return;
    }

    // Validate social URLs before touching any storage.
    const urlPattern = /^https?:\/\/.+/;
    if (twitterUrl && !urlPattern.test(twitterUrl)) { toast.error('The Twitter URL must start with https://'); return; }
    if (websiteUrl && !urlPattern.test(websiteUrl)) { toast.error('The website URL must start with https://'); return; }

    if (!supabaseUrl || !supabaseAnonKey) {
      toast.error('Profile storage is not configured', {
        description: 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then create the profiles table.',
      });
      return;
    }

    const profilePayload: ProfilePayload = {
      display_name: displayName.slice(0, 60) || null,
      bio: bio.slice(0, 300) || null,
      twitter_url: twitterUrl || null,
      website_url: websiteUrl || null,
      avatar_url: avatarPreview || null,
    };

    setSavingProfile(true);
    const sessionToken = sessionStorage.getItem('kc_session_token');
    let avatarUrl = avatarPreview;

    // Upload avatar if changed
    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop();
      const path = `${address.toLowerCase()}/avatar.${ext}`;
      const up = await fetch(`${supabaseUrl}/storage/v1/object/avatars/${path}`, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${sessionToken ?? supabaseAnonKey}`,
          'Content-Type': avatarFile.type,
          'x-upsert': 'true',
        },
        body: avatarFile,
      });
      if (up.ok) {
        avatarUrl = `${supabaseUrl}/storage/v1/object/public/avatars/${path}`;
      } else {
        toast.error('The photo upload failed. Try a smaller image.');
        setSavingProfile(false);
        return;
      }
    }

    const remotePayload: ProfilePayload = { ...profilePayload, avatar_url: avatarUrl || null };

    try {
      const resp = await fetch(`${supabaseUrl}/rest/v1/profiles?on_conflict=wallet_address`, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${sessionToken ?? supabaseAnonKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          wallet_address: address.toLowerCase(),
          username: effectiveUsername || null,
          payout_address: payoutInput ? payoutInput.toLowerCase() : null,
          ...remotePayload,
        }),
      });
      if (resp.ok) {
        setAvatarPreview(remotePayload.avatar_url ?? null);
        toast.success('Profile saved.');
      } else {
        toast.error(`Could not save the profile (HTTP ${resp.status})`, {
          description:
            resp.status === 404
              ? 'The Supabase profiles table does not exist. Run the migrations in supabase/migrations.'
              : 'Check the Supabase profiles table and its row-level security policies.',
        });
      }
    } catch {
      toast.error('Could not reach Supabase. Try again when it is online.');
    } finally {
      setSavingProfile(false);
    }
  };

  const parsedMin = parseUsdcInput(minInput);
  const minValid = parsedMin !== null && parsedMin >= floor;

  const payoutConfirmed = effectiveUsername.length > 0 && payoutConfirmText.trim() === effectiveUsername;
  const payoutAddressValid = isAddress(payoutInput);

  const openPayoutDialog = () => {
    setPayoutConfirmText('');
    setPayoutInput('');
    setPayoutError('');
    setPayoutStep('confirm');
    setPayoutDialogOpen(true);
  };

  const handleUpdatePayout = () => {
    if (!payoutInput || !payoutConfirmed || !payoutAddressValid) return;
    setPayoutError('');
    writeUpdatePayout(
      { address: KASIH_ADDRESS, abi: KASIH_ABI, functionName: 'updatePayoutAddress', args: [payoutInput], chainId: ARC_CHAIN_ID },
      { onSuccess: (h) => { setPayoutTxHash(h); setPayoutDialogOpen(false); setPayoutConfirmText(''); }, onError: (e) => setPayoutError(decodeRevert(e)) }
    );
  };

  useEffect(() => {
    if (!payoutDialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPayoutDialogOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [payoutDialogOpen]);

  const handleUpdateMin = () => {
    if (!parsedMin) return;
    setMinError('');
    writeUpdateMin(
      { address: KASIH_ADDRESS, abi: KASIH_ABI, functionName: 'updateMinDonation', args: [parsedMin], chainId: ARC_CHAIN_ID },
      { onSuccess: (h) => setMinTxHash(h), onError: (e) => setMinError(decodeRevert(e)) }
    );
  };

  const handleSignOut = () => {
    sessionStorage.removeItem('kc_session_token');
    toast.success('Signed out of profile editing.');
  };

  if (!isConnected) {
    return (
      <Layout>
        <div className="shell page">
          <div className="mx-auto max-w-lg">
            <StatePanel
              icon={Wallet}
              title="Connect to manage settings"
              description="Settings are tied to the wallet that registered your page."
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
              description="Payout and minimum changes are on-chain transactions on Arc."
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
            title="Settings"
            description="Manage how your public page looks and where donations go."
          >
            <button type="button" onClick={handleSignOut} className="btn btn-ghost btn-sm">
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </PageHeader>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start">
            {/* Profile */}
            <section className="card space-y-5 p-5 sm:p-6" aria-labelledby="profile-heading">
              <div>
                <h2 id="profile-heading" className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
                  Public profile
                </h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                  Shown on your donation page. Everything here is optional except the username.
                </p>
              </div>

              {/* Avatar */}
              <div className="flex items-center gap-4">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Current profile photo"
                    className="size-16 rounded-full border object-cover"
                    style={{ borderColor: 'var(--border)' }}
                  />
                ) : (
                  <div
                    className="flex size-16 items-center justify-center rounded-full text-xl font-bold"
                    style={{ background: 'var(--ink)', color: 'var(--accent)' }}
                    aria-hidden="true"
                  >
                    {(displayName || effectiveUsername || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <label
                    htmlFor="avatar-upload"
                    className="btn btn-secondary btn-sm cursor-pointer"
                  >
                    <Upload className="size-4" aria-hidden="true" />
                    Change photo
                  </label>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={handleAvatarChange}
                  />
                  <p className="mt-1 hint">PNG, JPG, or WebP · up to 1 MB</p>
                </div>
              </div>

              {/* Read-only username */}
              <div className="field">
                <label className="label" htmlFor="settings-username">
                  Username
                </label>
                <input
                  id="settings-username"
                  type="text"
                  value={effectiveUsername}
                  readOnly
                  className="input cursor-default"
                  style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
                  aria-describedby="settings-username-hint"
                />
                <p id="settings-username-hint" className="hint">
                  Usernames are permanent and cannot be changed.
                </p>
              </div>

              <Field label="Display name" value={displayName} onChange={setDisplayName} maxLength={60} placeholder="Your name" />
              <div className="field">
                <label className="label" htmlFor="bio">
                  Bio
                </label>
                <textarea
                  id="bio"
                  value={bio}
                  maxLength={300}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  className="textarea"
                  placeholder="What do you make?"
                  aria-describedby="bio-count"
                />
                <p id="bio-count" className="text-right text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
                  {bio.length}/300
                </p>
              </div>
              <Field label="Twitter / X" value={twitterUrl} onChange={setTwitterUrl} placeholder="https://twitter.com/yourhandle" />
              <Field label="Website" value={websiteUrl} onChange={setWebsiteUrl} placeholder="https://yoursite.com" />

              <button
                type="button"
                onClick={() => { void handleSaveProfile(); }}
                disabled={savingProfile}
                className="btn btn-primary"
                aria-live="polite"
              >
                {savingProfile ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="size-4" aria-hidden="true" />
                    Save profile
                  </>
                )}
              </button>
            </section>

            <div className="space-y-6">
              {/* Minimum donation */}
              <section className="card space-y-4 p-5 sm:p-6" aria-labelledby="minimum-heading">
                <div>
                  <h2 id="minimum-heading" className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
                    Minimum donation
                  </h2>
                  <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                    The smallest amount a supporter can send to your page. The contract floor is
                    {formatUsdc(floor)} USDC.
                  </p>
                </div>

                <div className="field">
                  <label className="label" htmlFor="minimum-amount">
                    Minimum amount (USDC)
                  </label>
                  <input
                    id="minimum-amount"
                    type="text"
                    inputMode="decimal"
                    value={minInput}
                    onChange={(e) => setMinInput(e.target.value)}
                    placeholder="1.00"
                    className="input"
                    aria-describedby="minimum-hint"
                    aria-invalid={!minValid && minInput !== ''}
                  />
                  <p id="minimum-hint" className="hint">
                    Applies to new donations. Existing donations are unchanged.
                  </p>
                  {!minValid && minInput && (
                    <p className="text-xs" style={{ color: 'var(--danger)' }} role="alert">
                      Enter an amount of at least {formatUsdc(floor)} USDC.
                    </p>
                  )}
                </div>

                {minError && (
                  <div className="alert alert-danger" role="alert">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <p>{minError}</p>
                  </div>
                )}
                {isMinSuccess && (
                  <div className="alert alert-success" role="status">
                    <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
                    <p className="font-bold">Minimum updated.</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleUpdateMin}
                  disabled={!minValid || isMinPending || isMinConfirming}
                  className="btn btn-secondary"
                  aria-live="polite"
                >
                  {isMinPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      Confirm in wallet…
                    </>
                  ) : isMinConfirming ? (
                    'Updating…'
                  ) : (
                    'Update minimum'
                  )}
                </button>
              </section>

              {/* Read-only: max donation */}
              <section className="card-muted space-y-1 p-5" aria-labelledby="limit-heading">
                <h2 id="limit-heading" className="display text-base font-bold" style={{ color: 'var(--ink)' }}>
                  Global donation limit
                </h2>
                <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {maxDonation !== undefined ? `${formatUsdc(maxDonation)} USDC` : '—'}
                </p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Set by the contract owner. Read-only.
                </p>
              </section>

              {/* Read-only: platform fee */}
              <section className="card-muted space-y-1 p-5" aria-labelledby="fee-heading">
                <h2 id="fee-heading" className="display text-base font-bold" style={{ color: 'var(--ink)' }}>
                  Platform fee
                </h2>
                <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {feeLabel ?? '—'}
                </p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Deducted from each donation before it reaches your payout address, capped at 5% +
                  0.05 USDC. Read-only.
                </p>
              </section>
            </div>

            <section
              className="card space-y-4 p-5 sm:p-6"
              style={{ borderColor: 'var(--danger)' }}
              aria-labelledby="payout-heading"
            >
              <div className="flex items-start gap-3">
                <TriangleAlert
                  className="mt-0.5 size-5 shrink-0"
                  style={{ color: 'var(--danger)' }}
                  aria-hidden="true"
                />
                <div>
                  <h2
                    id="payout-heading"
                    className="display text-lg font-bold"
                    style={{ color: 'var(--danger)' }}
                  >
                    Danger zone · payout address
                  </h2>
                  <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                    Every future donation is sent to your payout address in the same transaction. If
                    you point it somewhere you do not control, those funds are gone. Only your
                    registered wallet can change it back.
                  </p>
                </div>
              </div>

              {payoutError && !payoutDialogOpen && (
                <div className="alert alert-danger" role="alert">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <p>{payoutError}</p>
                </div>
              )}

              {isPayoutSuccess && (
                <div className="alert alert-success" role="status">
                  <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
                  <p className="font-bold">Payout address updated.</p>
                </div>
              )}

              <button
                type="button"
                onClick={openPayoutDialog}
                disabled={!effectiveUsername || isPayoutPending || isPayoutConfirming}
                className="btn btn-danger"
              >
                Change payout address
              </button>
            </section>

            {payoutDialogOpen && (
              <div
                className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
                onClick={() => setPayoutDialogOpen(false)}
                role="presentation"
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="payout-dialog-title"
                  aria-describedby="payout-dialog-desc"
                  className="card w-full max-w-md space-y-4 p-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-start gap-3">
                    <TriangleAlert
                      className="mt-0.5 size-5 shrink-0"
                      style={{ color: 'var(--danger)' }}
                      aria-hidden="true"
                    />
                    <h2
                      id="payout-dialog-title"
                      className="display text-lg font-bold"
                      style={{ color: 'var(--danger)' }}
                    >
                      Change payout address?
                    </h2>
                  </div>

                  {payoutStep === 'confirm' ? (
                    <>
                      <p id="payout-dialog-desc" className="text-sm" style={{ color: 'var(--muted)' }}>
                        Changing where donations land cannot be undone from this screen. To
                        continue, type your creator username exactly as it appears on your page.
                      </p>

                      <div className="field">
                        <label className="label" htmlFor="payout-confirm">
                          Type{' '}
                          <span className="mono font-bold" style={{ color: 'var(--danger)' }}>
                            {effectiveUsername}
                          </span>{' '}
                          to confirm
                        </label>
                        <input
                          id="payout-confirm"
                          type="text"
                          value={payoutConfirmText}
                          onChange={(e) => setPayoutConfirmText(e.target.value)}
                          className="input"
                          placeholder={effectiveUsername}
                          autoComplete="off"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          autoFocus
                          aria-invalid={payoutConfirmText.length > 0 && !payoutConfirmed}
                        />
                      </div>

                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setPayoutDialogOpen(false)}
                          className="btn btn-secondary"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => setPayoutStep('address')}
                          disabled={!payoutConfirmed}
                          className="btn btn-danger"
                        >
                          Continue
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p id="payout-dialog-desc" className="text-sm" style={{ color: 'var(--muted)' }}>
                        Enter the new payout address. Every future donation is sent there in the
                        same transaction; only your registered wallet can change it again.
                      </p>

                      <div className="field">
                        <label className="label" htmlFor="payout-address">
                          New payout address
                        </label>
                        <input
                          id="payout-address"
                          type="text"
                          value={payoutInput}
                          onChange={(e) => setPayoutInput(e.target.value)}
                          placeholder="0x…"
                          className="input mono text-xs"
                          style={{ borderColor: 'var(--danger)' }}
                          autoComplete="off"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          autoFocus
                          aria-invalid={payoutInput.length > 0 && !payoutAddressValid}
                        />
                        <p className="hint">
                          {payoutInput.length > 0 && !payoutAddressValid
                            ? 'That is not a valid 0x address.'
                            : 'Paste a full 0x address. Double-check it before confirming.'}
                        </p>
                      </div>

                      {payoutError && (
                        <div className="alert alert-danger" role="alert">
                          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                          <p>{payoutError}</p>
                        </div>
                      )}

                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setPayoutStep('confirm')}
                          className="btn btn-secondary"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={handleUpdatePayout}
                          disabled={!payoutAddressValid || isPayoutPending || isPayoutConfirming}
                          className="btn btn-danger"
                          aria-live="polite"
                        >
                          {isPayoutPending ? (
                            <>
                              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                              Confirm in wallet…
                            </>
                          ) : isPayoutConfirming ? (
                            'Updating…'
                          ) : (
                            'Change payout address'
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function Field({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input"
      />
    </div>
  );
}
