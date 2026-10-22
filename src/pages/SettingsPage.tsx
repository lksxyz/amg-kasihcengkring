/**
 * /app/setting — Profile, avatar, social links, payout address, min donation.
 * Read-only: maxDonation (from chain), username (immutable).
 */
import { useState, useEffect, useRef } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { arcTestnet } from 'viem/chains';
import { ConnectKitButton } from 'connectkit';
import { Loader2, Save, AlertCircle, CheckCircle2, LogOut, Upload } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '../components/Layout';
import { KASIH_ADDRESS, KASIH_ABI } from '../contract';
import { formatUsdc, parseUsdcInput, decodeRevert } from '../lib/utils';

const ARC_CHAIN_ID = arcTestnet.id;

export default function SettingsPage() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const isWrongChain = isConnected && chainId !== ARC_CHAIN_ID;

  // Chain reads
  const { data: creatorHash } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'walletToUsernameHash',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address },
  });
  const isRegistered = !!creatorHash && creatorHash !== '0x0000000000000000000000000000000000000000000000000000000000000000';

  const { data: maxDonation } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'maxDonation',
    chainId: ARC_CHAIN_ID,
  });

  const [username, setUsername] = useState('');
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
  const [confirmingPayout, setConfirmingPayout] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  const { writeContract: writeUpdatePayout, isPending: isPayoutPending } = useWriteContract();
  const { isLoading: isPayoutConfirming, isSuccess: isPayoutSuccess } = useWaitForTransactionReceipt({ hash: payoutTxHash });

  const { writeContract: writeUpdateMin, isPending: isMinPending } = useWriteContract();
  const { isLoading: isMinConfirming, isSuccess: isMinSuccess } = useWaitForTransactionReceipt({ hash: minTxHash });

  const prevPayoutSuccess = useRef(false);
  const prevMinSuccess = useRef(false);
  useEffect(() => {
    if (isPayoutSuccess && !prevPayoutSuccess.current) {
      prevPayoutSuccess.current = true;
      toast.success('Payout address updated!');
    } else if (!isPayoutSuccess) {
      prevPayoutSuccess.current = false;
    }
  });
  useEffect(() => {
    if (isMinSuccess && !prevMinSuccess.current) {
      prevMinSuccess.current = true;
      toast.success('Minimum donation updated!');
    } else if (!isMinSuccess) {
      prevMinSuccess.current = false;
    }
  });

  // Load profile from Supabase
  useEffect(() => {
    if (!address || !supabaseUrl || !supabaseAnonKey) return;
    interface ProfileRow {
      username?: string;
      display_name?: string;
      bio?: string;
      twitter_url?: string;
      website_url?: string;
      avatar_url?: string;
      payout_address?: string;
    }
    void fetch(`${supabaseUrl}/rest/v1/profiles?wallet_address=eq.${address}&select=*`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    })
      .then((r) => r.json() as Promise<ProfileRow[]>)
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
      .catch(() => {});
  }, [address, supabaseUrl, supabaseAnonKey]);

  // Load current min from chain
  useEffect(() => {
    if (!address || !isRegistered || !username) return;
    // getCreator returns (payoutAddress, minDonation, registered)
  }, [address, isRegistered, username]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Only PNG, JPG, or WebP images allowed.');
      return;
    }
    if (file.size > 1_048_576) {
      toast.error('Image must be under 1 MB.');
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSaveProfile = async () => {
    if (!address || !supabaseUrl || !supabaseAnonKey) return;
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
        toast.error('Avatar upload failed.');
        setSavingProfile(false);
        return;
      }
    }

    // Validate social URLs
    const urlPattern = /^https?:\/\/.+/;
    if (twitterUrl && !urlPattern.test(twitterUrl)) { toast.error('Twitter URL must start with https://'); setSavingProfile(false); return; }
    if (websiteUrl && !urlPattern.test(websiteUrl)) { toast.error('Website URL must start with https://'); setSavingProfile(false); return; }

    const resp = await fetch(`${supabaseUrl}/rest/v1/profiles?wallet_address=eq.${address}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${sessionToken ?? supabaseAnonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        display_name: displayName.slice(0, 60) || null,
        bio: bio.slice(0, 300) || null,
        twitter_url: twitterUrl || null,
        website_url: websiteUrl || null,
        avatar_url: avatarUrl || null,
      }),
    });

    setSavingProfile(false);
    if (resp.ok) { toast.success('Profile saved!'); }
    else { toast.error('Failed to save profile.'); }
  };

  const parsedMin = parseUsdcInput(minInput);
  const minValid = parsedMin !== null && parsedMin >= 100_000n;

  const handleUpdatePayout = () => {
    if (!payoutInput) return;
    setPayoutError('');
    writeUpdatePayout(
      { address: KASIH_ADDRESS, abi: KASIH_ABI, functionName: 'updatePayoutAddress', args: [payoutInput as `0x${string}`], chainId: ARC_CHAIN_ID },
      { onSuccess: (h) => { setPayoutTxHash(h); setConfirmingPayout(false); }, onError: (e) => setPayoutError(decodeRevert(e)) }
    );
  };

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
    toast.success('Signed out.');
  };

  const glass = {
    card: { background: 'var(--surface-strong)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--border)' } as React.CSSProperties,
  };

  if (!isConnected) {
    return (
      <Layout>
        <div className="mx-auto max-w-md px-4 py-20 text-center space-y-4">
          <p className="display text-xl font-700" style={{ color: 'var(--ink)' }}>Connect to manage settings</p>
          <div className="flex justify-center"><ConnectKitButton /></div>
        </div>
      </Layout>
    );
  }

  if (isWrongChain) {
    return (
      <Layout>
        <div className="mx-auto max-w-md px-4 py-20 text-center space-y-4">
          <button onClick={() => switchChain({ chainId: ARC_CHAIN_ID })} disabled={isSwitching} className="rounded-2xl px-6 py-3 text-sm font-600 text-white" style={{ background: 'var(--accent)' }}>
            {isSwitching ? <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Switching…</span> : 'Switch to Arc'}
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="display text-2xl font-700" style={{ color: 'var(--ink)' }}>Settings</h1>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-500"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--surface-muted)' }}
            aria-label="Sign out"
          >
            <LogOut className="size-4" aria-hidden="true" /> Sign out
          </button>
        </div>

        {/* Profile */}
        <div className="rounded-2xl p-5 space-y-4" style={glass.card}>
          <h2 className="display text-base font-600" style={{ color: 'var(--ink)' }}>Profile</h2>

          {/* Avatar */}
          <div className="flex items-center gap-4">
            {avatarPreview ? (
              <img src={avatarPreview} alt="Avatar preview" className="size-16 rounded-full object-cover border" style={{ borderColor: 'var(--border)' }} />
            ) : (
              <div className="size-16 rounded-full flex items-center justify-center display text-xl font-700 text-white" style={{ background: 'var(--accent)' }} aria-hidden="true">
                {(displayName || username || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-500"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: 'var(--surface-muted)' }}
                aria-label="Change avatar"
              >
                <Upload className="size-4" aria-hidden="true" /> Change photo
              </button>
              <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>PNG, JPG, WebP · max 1 MB</p>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={handleAvatarChange} aria-label="Upload avatar" />
            </div>
          </div>

          {/* Read-only username */}
          <div className="space-y-1">
            <label className="text-xs font-500" style={{ color: 'var(--muted)' }}>Username (cannot be changed)</label>
            <input
              type="text"
              value={username}
              readOnly
              className="w-full rounded-xl border px-3 py-2 text-sm cursor-default"
              style={{ borderColor: 'var(--border)', background: 'rgba(0,0,0,0.03)', color: 'var(--subtle)' }}
              aria-label="Username (read-only)"
            />
          </div>

          <Field label="Display name" value={displayName} onChange={setDisplayName} maxLength={60} />
          <div className="space-y-1">
            <label className="text-xs font-500" htmlFor="bio" style={{ color: 'var(--muted)' }}>Bio</label>
            <textarea
              id="bio"
              value={bio}
              maxLength={300}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full rounded-xl border px-3 py-2 text-sm resize-none outline-none"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)', color: 'var(--ink)' }}
              aria-label="Bio"
            />
            <p className="text-right text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>{bio.length}/300</p>
          </div>
          <Field label="Twitter / X URL" value={twitterUrl} onChange={setTwitterUrl} placeholder="https://twitter.com/yourhandle" />
          <Field label="Website URL" value={websiteUrl} onChange={setWebsiteUrl} placeholder="https://yoursite.com" />

          <button
            onClick={() => { void handleSaveProfile(); }}
            disabled={savingProfile}
            className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-600 text-white disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
            aria-live="polite"
          >
            {savingProfile ? <><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Saving…</> : <><Save className="size-4" aria-hidden="true" /> Save profile</>}
          </button>
        </div>

        {/* Payout address */}
        <div className="rounded-2xl p-5 space-y-4" style={glass.card}>
          <div>
            <h2 className="display text-base font-600" style={{ color: 'var(--ink)' }}>Payout address</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>USDC from donations goes directly here. Requires on-chain transaction.</p>
          </div>
          <input
            type="text"
            value={payoutInput}
            onChange={(e) => { setPayoutInput(e.target.value); setConfirmingPayout(false); }}
            placeholder="0x..."
            className="w-full rounded-xl border px-3 py-2 mono text-xs outline-none"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)', color: 'var(--ink)' }}
            aria-label="New payout address"
          />
          {payoutError && (
            <div className="flex items-start gap-2 rounded-xl p-3" style={{ background: 'rgba(186,43,76,0.08)', border: '1px solid rgba(186,43,76,0.2)' }} role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--danger)' }} />
              <p className="text-sm" style={{ color: 'var(--danger)' }}>{payoutError}</p>
            </div>
          )}
          {isPayoutSuccess && (
            <div className="flex items-center gap-2 rounded-xl p-3" style={{ background: 'rgba(26,128,71,0.1)', border: '1px solid rgba(26,128,71,0.2)' }}>
              <CheckCircle2 className="size-5" style={{ color: 'var(--success)' }} aria-hidden="true" />
              <p className="text-sm font-600" style={{ color: 'var(--success)' }}>Payout address updated!</p>
            </div>
          )}
          {!confirmingPayout ? (
            <button
              onClick={() => setConfirmingPayout(true)}
              disabled={!payoutInput || isPayoutPending || isPayoutConfirming}
              className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-600 border disabled:opacity-40"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)', background: 'transparent' }}
            >
              Update payout address
            </button>
          ) : (
            <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--danger)', background: 'rgba(186,43,76,0.04)' }}>
              <p className="text-sm font-500" style={{ color: 'var(--danger)' }}>Confirm: change payout to {payoutInput.slice(0, 10)}…?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleUpdatePayout}
                  disabled={isPayoutPending || isPayoutConfirming}
                  className="rounded-xl px-4 py-2 text-sm font-600 text-white disabled:opacity-40"
                  style={{ background: 'var(--danger)' }}
                  aria-live="polite"
                >
                  {isPayoutPending ? <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Confirm…</span> : isPayoutConfirming ? 'Updating…' : 'Confirm change'}
                </button>
                <button onClick={() => setConfirmingPayout(false)} className="rounded-xl px-4 py-2 text-sm font-500 border" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* Minimum donation */}
        <div className="rounded-2xl p-5 space-y-4" style={glass.card}>
          <div>
            <h2 className="display text-base font-600" style={{ color: 'var(--ink)' }}>Minimum donation</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Per-creator minimum. Floor is 0.10 USDC.</p>
          </div>
          <input
            type="text"
            inputMode="decimal"
            value={minInput}
            onChange={(e) => setMinInput(e.target.value)}
            placeholder="1.00"
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ borderColor: !minValid && minInput ? 'var(--danger)' : 'var(--border)', background: 'var(--surface-muted)', color: 'var(--ink)' }}
            aria-label="Minimum donation amount"
          />
          {minError && <p className="text-xs" style={{ color: 'var(--danger)' }} role="alert">{minError}</p>}
          {isMinSuccess && <p className="text-xs" style={{ color: 'var(--success)' }}>Updated!</p>}
          <button
            onClick={handleUpdateMin}
            disabled={!minValid || isMinPending || isMinConfirming}
            className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-600 border disabled:opacity-40"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)', background: 'transparent' }}
            aria-live="polite"
          >
            {isMinPending ? <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Confirm…</span> : isMinConfirming ? 'Updating…' : 'Update minimum'}
          </button>
        </div>

        {/* Read-only: max donation */}
        <div className="rounded-2xl p-5 space-y-2" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <h2 className="display text-base font-600" style={{ color: 'var(--ink)' }}>Global donation limit</h2>
          <p className="tabular-nums text-xl font-700" style={{ color: 'var(--ink)' }}>
            {maxDonation !== undefined ? `${formatUsdc(maxDonation)} USDC` : '—'}
          </p>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>Set by the contract owner. Read-only.</p>
        </div>
      </div>
    </Layout>
  );
}

function Field({ label, value, onChange, maxLength, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-500" style={{ color: 'var(--muted)' }}>{label}</label>
      <input
        type="text"
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)', color: 'var(--ink)' }}
        aria-label={label}
      />
    </div>
  );
}
