/**
 * DonationForm — the core donate UX.
 * Two-step: approve USDC exact amount, then call donate().
 * Shows: amount input, supporter name, message, approve CTA, donate CTA.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useAccount, usePublicClient, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { erc20Abi } from 'viem';
import { arcChain } from '../config';
import { ConnectKitButton } from 'connectkit';
import { Loader2, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { KASIH_ADDRESS, KASIH_ABI } from '../contract';
import { buildTxExplorerUrl } from '../onchain-facts';
import { ARC_RPC_URL, USDC_ADDRESS_CONTRACT } from '../network';
import { formatUsdc, parseUsdcInput, decodeRevert } from '../lib/utils';

const ARC_CHAIN_ID = arcChain.id;
// USDC on the selected network; local Arc nodes use the same predeploy, and forks that
// ship a different token can override it with VITE_<NETWORK>_USDC_ADDRESS.
const USDC_ADDRESS = USDC_ADDRESS_CONTRACT;

interface DonationFormProps {
  username: string;
  minDonation: bigint;
  maxDonation: bigint;
  payoutAddress: string;
  onSuccess?: () => void;
}

type Step = 'idle' | 'approving' | 'approve-pending' | 'approved' | 'donating' | 'donate-pending' | 'done' | 'error';

const FLOW_TOAST_ID = 'donation-flow';

export default function DonationForm({ username, minDonation, maxDonation, onSuccess }: DonationFormProps) {
  const { address, isConnected, chainId, connector } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID });

  const [amountInput, setAmountInput] = useState('');
  const [donorName, setDonorName] = useState('');
  const [message, setMessage] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>();
  const [donateTxHash, setDonateTxHash] = useState<`0x${string}` | undefined>();
  const [errorMsg, setErrorMsg] = useState('');
  const autoDonateRef = useRef(false);

  const isWrongChain = isConnected && chainId !== ARC_CHAIN_ID;
  const parsedAmount = parseUsdcInput(amountInput);
  const amountTooLow = parsedAmount !== null && parsedAmount < minDonation;
  const amountTooHigh = parsedAmount !== null && parsedAmount > maxDonation;
  const amountValid = parsedAmount !== null && !amountTooLow && !amountTooHigh;

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
  const fee =
    parsedAmount !== null && feeBps !== undefined && flatFee !== undefined
      ? flatFee + (parsedAmount * BigInt(feeBps)) / 10_000n
      : null;
  const netAmount = parsedAmount !== null && fee !== null ? parsedAmount - fee : null;

  // Approve write
  const { writeContract: writeApprove, isPending: isApproveWalletPending } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash });

  // Donate write
  const { writeContract: writeDonate, isPending: isDonateWalletPending } = useWriteContract();
  const { isLoading: isDonateConfirming, isSuccess: isDonateSuccess } = useWaitForTransactionReceipt({ hash: donateTxHash });

  // Donor balance, so an empty wallet fails before opening the wallet UI.
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address },
  });

  // Check current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, KASIH_ADDRESS] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address },
  });

  const needsApproval = parsedAmount !== null && (allowance === undefined || allowance < parsedAmount);
  const insufficientBalance = parsedAmount !== null && usdcBalance !== undefined && usdcBalance < parsedAmount;

  // A wallet network entry can share chain ID 5042002 with Arc Testnet while
  // pointing at a different RPC. Compare genesis blocks before asking it to sign:
  // otherwise the tx is broadcast somewhere this app never sees.
  const walletRpcMatchesApp = useCallback(async (): Promise<boolean> => {
    const provider = (window as unknown as {
      ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
    }).ethereum;
    if (!provider || !publicClient) return true;
    try {
      const [appGenesis, walletGenesis] = await Promise.all([
        publicClient.getBlock({ blockNumber: 0n }),
        provider
          .request({ method: 'eth_getBlockByNumber', params: ['0x0', false] })
          .then((block) => (block as { hash?: string } | null)?.hash ?? null),
      ]);
      return !walletGenesis || walletGenesis === appGenesis.hash;
    } catch {
      return true;
    }
  }, [publicClient]);

  const handleApprove = useCallback(async () => {
    if (!parsedAmount || !address) return;
    setStep('approving');
    setErrorMsg('');
    autoDonateRef.current = true;
    console.info('[donation] approve requested via', connector?.name ?? 'injected');
    toast.loading(`Approve USDC in ${connector?.name ?? 'your wallet'}…`, { id: FLOW_TOAST_ID });

    if (!(await walletRpcMatchesApp())) {
      autoDonateRef.current = false;
      setStep('error');
      const message = `Wallet RPC is not ${ARC_RPC_URL}. Point the Arc network in ${connector?.name ?? 'your wallet'} at that RPC and retry.`;
      setErrorMsg(message);
      toast.error(message, { id: FLOW_TOAST_ID });
      return;
    }

    try {
      writeApprove(
        {
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [KASIH_ADDRESS, parsedAmount],
          account: address,
          chainId: ARC_CHAIN_ID,
        },
        {
          onSuccess: (hash) => {
            setApproveTxHash(hash);
            setStep('approve-pending');
          },
          onError: (err) => {
            autoDonateRef.current = false;
            const decoded = decodeRevert(err);
            setStep('error');
            setErrorMsg(decoded);
            toast.error(`Approval failed: ${decoded}`, { id: FLOW_TOAST_ID });
          },
        }
      );
    } catch (err) {
      autoDonateRef.current = false;
      const decoded = decodeRevert(err);
      setStep('error');
      setErrorMsg(decoded);
      toast.error(`Approval failed: ${decoded}`, { id: FLOW_TOAST_ID });
    }
  }, [parsedAmount, address, writeApprove, connector?.name, walletRpcMatchesApp]);

  const handleDonate = useCallback(async () => {
    if (!parsedAmount || !address) return;
    setStep('donating');
    setErrorMsg('');
    toast.loading('Confirm the donation in your wallet…', { id: FLOW_TOAST_ID });

    if (!(await walletRpcMatchesApp())) {
      setStep('error');
      const message = `Wallet RPC is not ${ARC_RPC_URL}. Point the Arc network in ${connector?.name ?? 'your wallet'} at that RPC and retry.`;
      setErrorMsg(message);
      toast.error(message, { id: FLOW_TOAST_ID });
      return;
    }

    try {
      if (publicClient) {
        try {
          const liveAllowance = await publicClient.readContract({
            address: USDC_ADDRESS,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [address, KASIH_ADDRESS],
          });
          if (liveAllowance < parsedAmount) {
            void refetchAllowance();
            await handleApprove();
            return;
          }
        } catch {
        }
      }

      writeDonate(
        {
          address: KASIH_ADDRESS,
          abi: KASIH_ABI,
          functionName: 'donate',
          args: [username, donorName.trim(), message.trim(), parsedAmount],
          account: address ?? undefined,
          chainId: ARC_CHAIN_ID,
        },
        {
          onSuccess: (hash) => {
            setDonateTxHash(hash);
            setStep('donate-pending');
            toast.loading('Donation submitted. Waiting for confirmation…', { id: FLOW_TOAST_ID });
          },
          onError: (err) => {
            const decoded = decodeRevert(err);
            setStep('error');
            setErrorMsg(decoded);
            toast.error(`Donation failed: ${decoded}`, { id: FLOW_TOAST_ID });
            void refetchAllowance();
          },
        }
      );
    } catch (err) {
      const decoded = decodeRevert(err);
      setStep('error');
      setErrorMsg(decoded);
      toast.error(`Donation failed: ${decoded}`, { id: FLOW_TOAST_ID });
    }
  }, [parsedAmount, username, donorName, message, writeDonate, refetchAllowance, address, walletRpcMatchesApp, connector?.name, publicClient, handleApprove]);

  // MetaMask sometimes queues a request without opening its popup. Do not leave
  // the button spinning forever: surface an actionable error after a timeout.
  useEffect(() => {
    if (step !== 'approving' && step !== 'donating') return;
    const timer = setTimeout(() => {
      setStep('error');
      const wallet = connector?.name ?? 'your wallet';
      setErrorMsg(`Wallet did not respond. Open ${wallet} and check pending signature requests.`);
      toast.error(`Wallet did not respond — open ${wallet} and check pending requests.`, { id: FLOW_TOAST_ID });
    }, 20_000);
    return () => clearTimeout(timer);
  }, [step, connector?.name]);

  // Approval confirmed: continue into the donation automatically so the user
  // clicks the CTA once (the wallet still asks for two confirmations).
  useEffect(() => {
    if (!isApproveSuccess || step !== 'approve-pending') return;
    void refetchAllowance();
    if (!autoDonateRef.current) {
      setStep('approved');
      return;
    }
    autoDonateRef.current = false;
    toast.loading('Approval confirmed. Confirm the donation in your wallet…', { id: FLOW_TOAST_ID });
    // Deliberately not cleared on re-render: the step guard above prevents
    // scheduling twice, and a cleanup would cancel the donation.
    setTimeout(() => void handleDonate(), 800);
  }, [isApproveSuccess, step, refetchAllowance, handleDonate]);

  // Donation confirmed.
  useEffect(() => {
    if (!isDonateSuccess || step !== 'donate-pending') return;
    setStep('done');
    void refetchAllowance();
    toast.success('Donation sent.', { id: FLOW_TOAST_ID });
    onSuccess?.();
  }, [isDonateSuccess, step, refetchAllowance, onSuccess]);

  const isLoading =
    isApproveWalletPending || isApproveConfirming || isDonateWalletPending || isDonateConfirming ||
    step === 'approving' || step === 'approve-pending' || step === 'donating' || step === 'donate-pending';

  if (step === 'done') {
    return (
      <div className="card space-y-3 p-6 text-center">
        <CheckCircle2 className="mx-auto size-10" style={{ color: 'var(--success)' }} aria-hidden="true" />
        <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>
          Donation sent
        </h2>
        <p className="mx-auto max-w-xs text-sm" style={{ color: 'var(--muted)' }}>
          Your USDC went straight to @{username}. Thank you.
        </p>
        {donateTxHash && (
          <a
            href={buildTxExplorerUrl(ARC_CHAIN_ID, donateTxHash)}
            target="_blank"
            rel="noreferrer"
            className="link inline-flex items-center gap-1.5 text-sm"
          >
            View on ArcScan
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              setStep('idle');
              setAmountInput('');
              setDonorName('');
              setMessage('');
              setApproveTxHash(undefined);
              setDonateTxHash(undefined);
            }}
            className="btn btn-secondary btn-sm"
          >
            Send another donation
          </button>
        </div>
      </div>
    );
  }

  const submit = () => {
    if (!amountValid) return;
    if (needsApproval) void handleApprove();
    else void handleDonate();
  };

  return (
    <form
      className="card space-y-4 p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      aria-labelledby="donate-heading"
    >
      <div>
        <h2 id="donate-heading" className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
          Send USDC
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Goes straight to @{username}'s wallet. No account needed.
        </p>
      </div>

      {/* Amount */}
      <div className="field">
        <label className="label" htmlFor="donation-amount">
          Amount (USDC)
        </label>
        <div
          className="flex items-baseline gap-2 rounded-xl border px-4 py-3"
          style={{ borderColor: 'var(--field-border)', background: 'var(--surface-muted)' }}
        >
          <input
            id="donation-amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amountInput}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '');
              if (v === '' || /^\d*\.?\d*$/.test(v)) setAmountInput(v);
            }}
            placeholder="0.00"
            className="display min-w-0 flex-1 bg-transparent text-4xl font-bold tabular-nums outline-none"
            style={{ color: 'var(--ink)' }}
            aria-describedby="amount-range"
            aria-invalid={amountTooLow || amountTooHigh}
          />
          <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>
            USDC
          </span>
        </div>
        <p id="amount-range" className="hint">
          Between {formatUsdc(minDonation)} and {formatUsdc(maxDonation)} USDC.
        </p>
        {amountTooLow && (
          <p className="text-xs" style={{ color: 'var(--danger)' }} role="alert">
            Minimum is {formatUsdc(minDonation)} USDC.
          </p>
        )}
        {amountTooHigh && (
          <p className="text-xs" style={{ color: 'var(--danger)' }} role="alert">
            Maximum is {formatUsdc(maxDonation)} USDC.
          </p>
        )}
        {/* Quick chips */}
        <div className="flex flex-wrap gap-2 pt-1">
          {[1, 5, 10, 25].map((v) => {
            const chips = BigInt(v) * 1_000_000n;
            const disabled = chips < minDonation || chips > maxDonation;
            return (
              <button
                key={v}
                type="button"
                disabled={disabled}
                onClick={() => setAmountInput(String(v))}
                className="chip"
                aria-label={`Set amount to ${v} USDC`}
              >
                {v} USDC
              </button>
            );
          })}
        </div>
      </div>

      {/* Supporter name */}
      <div className="field">
        <label className="label" htmlFor="donor-name">
          Your name <span className="font-normal" style={{ color: 'var(--subtle)' }}>(optional)</span>
        </label>
        <input
          id="donor-name"
          type="text"
          value={donorName}
          maxLength={40}
          onChange={(e) => setDonorName(e.target.value)}
          placeholder="Anonymous"
          className="input"
          autoComplete="name"
          aria-describedby="donor-name-hint"
        />
        <p id="donor-name-hint" className="hint">
          Shown publicly with your donation. Leave empty to appear as Anonymous. Max 40 characters.
        </p>
      </div>

      {/* Message */}
      <div className="field">
        <label className="label" htmlFor="donation-message">
          Message <span className="font-normal" style={{ color: 'var(--subtle)' }}>(optional)</span>
        </label>
        <textarea
          id="donation-message"
          value={message}
          maxLength={200}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Keep up the great work!"
          rows={3}
          className="textarea"
          aria-describedby="message-count"
        />
        <p id="message-count" className="text-right text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
          {message.length}/200
        </p>
      </div>

      {/* Preview */}
      {amountValid && netAmount !== null && fee !== null && (
        <div className="card-muted space-y-1.5 p-4 text-sm" aria-live="polite">
          <div className="flex justify-between gap-3">
            <span style={{ color: 'var(--muted)' }}>You send</span>
            <span className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
              {formatUsdc(parsedAmount)} USDC
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span style={{ color: 'var(--muted)' }}>Platform fee</span>
            <span className="font-bold tabular-nums" style={{ color: 'var(--muted)' }}>
              −{formatUsdc(fee)} USDC
            </span>
          </div>
          <div className="flex justify-between gap-3 border-t pt-1.5" style={{ borderColor: 'var(--field-border)' }}>
            <span style={{ color: 'var(--muted)' }}>@{username} receives</span>
            <span className="font-bold tabular-nums" style={{ color: 'var(--success)' }}>
              {formatUsdc(netAmount)} USDC
            </span>
          </div>
          <p className="pt-1 text-xs" style={{ color: 'var(--subtle)' }}>
            The fee is deducted from your donation, not added on top. You pay exactly what you enter.
          </p>
        </div>
      )}

      {/* Error */}
      {step === 'error' && errorMsg && (
        <div className="alert alert-danger" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{errorMsg}</p>
        </div>
      )}

      {/* CTA */}
      {!isConnected ? (
        <div className="space-y-2 text-center">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Connect a wallet to send USDC.
          </p>
          <ConnectKitButton label="Connect wallet" />
        </div>
      ) : isWrongChain ? (
        <button
          type="button"
          onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
          disabled={isSwitching}
          className="btn btn-primary w-full"
          aria-live="polite"
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
      ) : (
        <button
          type="submit"
          disabled={!amountValid || insufficientBalance || isLoading}
          className="btn btn-primary w-full"
          aria-live="polite"
          aria-busy={isLoading}
        >
          {isApproveWalletPending || isDonateWalletPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Confirm in wallet…
            </>
          ) : isApproveConfirming || step === 'approve-pending' ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Approving USDC…
            </>
          ) : isDonateConfirming || step === 'donate-pending' || step === 'donating' ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Sending donation…
            </>
          ) : insufficientBalance ? (
            'Insufficient USDC balance'
          ) : amountValid ? (
            needsApproval ? `Approve and send ${formatUsdc(parsedAmount)} USDC` : `Send ${formatUsdc(parsedAmount)} USDC`
          ) : (
            'Enter an amount'
          )}
        </button>
      )}

      {needsApproval && amountValid && (
        <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>
          You approve the exact amount first. The donation sends automatically after that — two
          wallet confirmations in total.
        </p>
      )}
    </form>
  );
}
