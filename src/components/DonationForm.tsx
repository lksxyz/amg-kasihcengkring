/**
 * DonationForm — the core donate UX.
 * Two-step: approve USDC exact amount, then call donate().
 * Shows: amount input, donor name, message, approve CTA, donate CTA.
 */
import { useState, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { erc20Abi } from 'viem';
import { arcTestnet } from 'viem/chains';
import { Loader2, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { KASIH_ADDRESS, KASIH_ABI } from '../contract';
import { getUsdc, buildTxExplorerUrl } from '../onchain-facts';
import { formatUsdc, parseUsdcInput, decodeRevert } from '../lib/utils';

const ARC_CHAIN_ID = arcTestnet.id; // 5042002
const usdcFact = getUsdc(ARC_CHAIN_ID);
const USDC_ADDRESS = usdcFact?.address as `0x${string}`;

interface DonationFormProps {
  username: string;
  minDonation: bigint;
  maxDonation: bigint;
  payoutAddress: string;
  onSuccess?: () => void;
}

type Step = 'idle' | 'approving' | 'approve-pending' | 'approved' | 'donating' | 'donate-pending' | 'done' | 'error';

export default function DonationForm({ username, minDonation, maxDonation, onSuccess }: DonationFormProps) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const [amountInput, setAmountInput] = useState('');
  const [donorName, setDonorName] = useState('');
  const [message, setMessage] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>();
  const [donateTxHash, setDonateTxHash] = useState<`0x${string}` | undefined>();
  const [errorMsg, setErrorMsg] = useState('');

  const isWrongChain = isConnected && chainId !== ARC_CHAIN_ID;
  const parsedAmount = parseUsdcInput(amountInput);
  const amountTooLow = parsedAmount !== null && parsedAmount < minDonation;
  const amountTooHigh = parsedAmount !== null && parsedAmount > maxDonation;
  const amountValid = parsedAmount !== null && !amountTooLow && !amountTooHigh;
  const donorNameTooLong = donorName.length > 40;
  const messageTooLong = message.length > 200;

  // Approve write
  const { writeContract: writeApprove, isPending: isApproveWalletPending } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash });

  // Donate write
  const { writeContract: writeDonate, isPending: isDonateWalletPending } = useWriteContract();
  const { isLoading: isDonateConfirming, isSuccess: isDonateSuccess } = useWaitForTransactionReceipt({ hash: donateTxHash });

  // Check current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, KASIH_ADDRESS] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address },
  });

  const needsApproval = parsedAmount !== null && (allowance === undefined || (allowance) < parsedAmount);

  const handleApprove = useCallback(() => {
    if (!parsedAmount || !address) return;
    setStep('approving');
    setErrorMsg('');
    try {
      writeApprove(
        {
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [KASIH_ADDRESS, parsedAmount],
          chainId: ARC_CHAIN_ID,
        },
        {
          onSuccess: (hash) => {
            setApproveTxHash(hash);
            setStep('approve-pending');
          },
          onError: (err) => {
            setStep('error');
            setErrorMsg(decodeRevert(err));
          },
        }
      );
    } catch (err) {
      setStep('error');
      setErrorMsg(decodeRevert(err));
    }
  }, [parsedAmount, address, writeApprove]);

  const handleDonate = useCallback(() => {
    if (!parsedAmount) return;
    setStep('donating');
    setErrorMsg('');
    try {
      writeDonate(
        {
          address: KASIH_ADDRESS,
          abi: KASIH_ABI,
          functionName: 'donate',
          args: [username, donorName.trim(), message.trim(), parsedAmount],
          chainId: ARC_CHAIN_ID,
        },
        {
          onSuccess: (hash) => {
            setDonateTxHash(hash);
            setStep('donate-pending');
          },
          onError: (err) => {
            setStep('error');
            const decoded = decodeRevert(err);
            setErrorMsg(decoded);
            if (decoded.includes('donation limit')) {
              void refetchAllowance();
            }
          },
        }
      );
    } catch (err) {
      setStep('error');
      setErrorMsg(decodeRevert(err));
    }
  }, [parsedAmount, username, donorName, message, writeDonate, refetchAllowance]);

  // Handle approval confirmed → ready to donate
  if (isApproveSuccess && step === 'approve-pending') {
    setStep('approved');
    void refetchAllowance();
    toast.success('Approval confirmed — ready to donate!');
  }

  // Handle donate confirmed → done
  if (isDonateSuccess && step === 'donate-pending') {
    setStep('done');
    toast.success('Donation sent!');
    onSuccess?.();
  }

  const isLoading =
    isApproveWalletPending || isApproveConfirming || isDonateWalletPending || isDonateConfirming ||
    step === 'approving' || step === 'approve-pending' || step === 'donating' || step === 'donate-pending';

  const glass = {
    card: {
      background: 'var(--surface-strong)',
      backdropFilter: 'blur(30px) saturate(180%)',
      WebkitBackdropFilter: 'blur(30px) saturate(180%)',
      border: '1px solid var(--border)',
    } as React.CSSProperties,
    inner: {
      background: 'var(--surface-muted)',
      border: '1px solid var(--border)',
    } as React.CSSProperties,
  };

  if (step === 'done') {
    return (
      <div className="rounded-2xl p-6 text-center space-y-3" style={glass.card}>
        <CheckCircle2 className="mx-auto size-10" style={{ color: 'var(--success)' }} aria-hidden="true" />
        <p className="display font-600 text-lg" style={{ color: 'var(--ink)' }}>Donation sent!</p>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Your USDC went straight to the creator. Thank you.
        </p>
        {donateTxHash && (
          <a
            href={buildTxExplorerUrl(ARC_CHAIN_ID, donateTxHash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium"
            style={{ color: 'var(--accent-hover)' }}
          >
            View on ArcScan <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
        <button
          onClick={() => { setStep('idle'); setAmountInput(''); setDonorName(''); setMessage(''); setApproveTxHash(undefined); setDonateTxHash(undefined); }}
          className="mt-2 text-sm font-medium underline underline-offset-2"
          style={{ color: 'var(--muted)' }}
        >
          Donate again
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-5 space-y-4" style={glass.card}>
      <h2 className="display text-base font-600" style={{ color: 'var(--ink)' }}>Send a donation</h2>

      {/* Amount */}
      <div className="space-y-1">
        <label className="text-xs font-500" style={{ color: 'var(--muted)' }}>Amount (USDC)</label>
        <div className="rounded-2xl px-4 py-3 flex items-baseline gap-2" style={glass.inner}>
          <input
            type="text"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '');
              if (v === '' || /^\d*\.?\d*$/.test(v)) setAmountInput(v);
            }}
            placeholder="0.00"
            aria-label="Donation amount in USDC"
            className="display flex-1 bg-transparent text-3xl font-700 tabular-nums outline-none placeholder:opacity-25"
            style={{ color: 'var(--ink)' }}
          />
          <span className="text-sm font-500" style={{ color: 'var(--subtle)' }}>USDC</span>
        </div>
        {/* Quick chips */}
        <div className="flex gap-2 flex-wrap pt-1">
          {[1, 5, 10, 25].map((v) => {
            const chips = BigInt(v) * 1_000_000n;
            const disabled = chips < minDonation || chips > maxDonation;
            return (
              <button
                key={v}
                disabled={disabled}
                onClick={() => setAmountInput(String(v))}
                className="rounded-full px-3 py-1 text-xs font-500 border transition-colors disabled:opacity-30"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--surface-muted)' }}
                aria-label={`Set amount to ${v} USDC`}
              >
                ${v}
              </button>
            );
          })}
        </div>
        {amountTooLow && (
          <p className="text-xs" style={{ color: 'var(--danger)' }} role="alert">
            Minimum is {formatUsdc(minDonation)} USDC
          </p>
        )}
        {amountTooHigh && (
          <p className="text-xs" style={{ color: 'var(--danger)' }} role="alert">
            Maximum is {formatUsdc(maxDonation)} USDC
          </p>
        )}
      </div>

      {/* Donor name */}
      <div className="space-y-1">
        <label className="text-xs font-500" htmlFor="donor-name" style={{ color: 'var(--muted)' }}>
          Your name <span style={{ color: 'var(--subtle)' }}>(optional, max 40 chars)</span>
        </label>
        <input
          id="donor-name"
          type="text"
          value={donorName}
          maxLength={40}
          onChange={(e) => setDonorName(e.target.value)}
          placeholder="Anonymous"
          className="w-full rounded-xl border px-3 py-2 text-sm outline-none transition-colors"
          style={{ borderColor: donorNameTooLong ? 'var(--danger)' : 'var(--border)', background: 'var(--surface-muted)', color: 'var(--ink)' }}
          aria-label="Your name (optional)"
          aria-invalid={donorNameTooLong}
        />
        {donorNameTooLong && <p className="text-xs" style={{ color: 'var(--danger)' }} role="alert">Max 40 characters</p>}
      </div>

      {/* Message */}
      <div className="space-y-1">
        <label className="text-xs font-500" htmlFor="message" style={{ color: 'var(--muted)' }}>
          Message <span style={{ color: 'var(--subtle)' }}>(optional, max 200 chars)</span>
        </label>
        <textarea
          id="message"
          value={message}
          maxLength={200}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Keep up the great work!"
          rows={3}
          className="w-full rounded-xl border px-3 py-2 text-sm outline-none resize-none transition-colors"
          style={{ borderColor: messageTooLong ? 'var(--danger)' : 'var(--border)', background: 'var(--surface-muted)', color: 'var(--ink)' }}
          aria-label="Message (optional)"
          aria-invalid={messageTooLong}
        />
        <div className="flex justify-between">
          {messageTooLong && <p className="text-xs" style={{ color: 'var(--danger)' }} role="alert">Max 200 characters</p>}
          <span className="ml-auto text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>{message.length}/200</span>
        </div>
      </div>

      {/* Preview */}
      {amountValid && (
        <div className="rounded-xl p-3 space-y-1 text-xs" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <div className="flex justify-between">
            <span style={{ color: 'var(--muted)' }}>You send</span>
            <span className="tabular-nums font-600" style={{ color: 'var(--ink)' }}>{formatUsdc(parsedAmount)} USDC</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--muted)' }}>Creator receives</span>
            <span className="tabular-nums font-600" style={{ color: 'var(--success)' }}>{formatUsdc(parsedAmount)} USDC</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--muted)' }}>Platform fee</span>
            <span className="font-600" style={{ color: 'var(--success)' }}>None</span>
          </div>
        </div>
      )}

      {/* Error */}
      {step === 'error' && errorMsg && (
        <div className="flex items-start gap-2 rounded-xl p-3" style={{ background: 'rgba(186,43,76,0.08)', border: '1px solid rgba(186,43,76,0.2)' }} role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--danger)' }} aria-hidden="true" />
          <p className="text-sm" style={{ color: 'var(--danger)' }}>{errorMsg}</p>
        </div>
      )}

      {/* CTAs */}
      {!isConnected ? (
        <p className="text-center text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to donate</p>
      ) : isWrongChain ? (
        <button
          onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
          disabled={isSwitching}
          className="w-full rounded-2xl py-3.5 text-sm font-600 text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
          aria-live="polite"
        >
          {isSwitching ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Switching...</span>
          ) : 'Switch to Arc'}
        </button>
      ) : needsApproval ? (
        <button
          onClick={() => { void handleApprove(); }}
          disabled={!amountValid || donorNameTooLong || messageTooLong || isLoading}
          className="w-full rounded-2xl py-3.5 text-sm font-600 text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
          aria-live="polite"
        >
          {(isApproveWalletPending) ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Confirm in wallet…</span>
          ) : (isApproveConfirming || step === 'approve-pending') ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Confirming approval…</span>
          ) : amountValid ? (
            `Allow ${formatUsdc(parsedAmount)} USDC`
          ) : 'Enter amount first'}
        </button>
      ) : (
        <button
          onClick={() => { void handleDonate(); }}
          disabled={!amountValid || donorNameTooLong || messageTooLong || isLoading}
          className="w-full rounded-2xl py-3.5 text-sm font-600 text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
          aria-live="polite"
        >
          {(isDonateWalletPending) ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Confirm in wallet…</span>
          ) : (isDonateConfirming || step === 'donate-pending') ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Confirming…</span>
          ) : amountValid ? (
            `Send ${formatUsdc(parsedAmount)} USDC`
          ) : 'Enter amount first'}
        </button>
      )}

      {needsApproval && amountValid && (
        <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>
          Step 1 of 2: approve exact amount, then send.
        </p>
      )}
    </div>
  );
}
