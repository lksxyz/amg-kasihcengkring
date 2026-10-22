/**
 * / — Landing page.
 * Hero, "See an example", how it works, why USDC on Arc, FAQ, stats, footer.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useReadContract } from 'wagmi';
import { arcTestnet } from 'viem/chains';
import { Heart, Zap, Shield, DollarSign, ChevronDown } from 'lucide-react';
import Layout from '../components/Layout';
import { Skeleton } from '../components/Skeleton';
import { KASIH_ADDRESS, KASIH_ABI } from '../contract';
import { formatUsdc } from '../lib/utils';

const ARC_CHAIN_ID = arcTestnet.id;

const EXAMPLE_USERNAME = (import.meta.env.VITE_EXAMPLE_CREATOR as string | undefined) ?? '';

export default function LandingPage() {
  const { data: maxDonation, isLoading: isMaxLoading } = useReadContract({
    address: KASIH_ADDRESS,
    abi: KASIH_ABI,
    functionName: 'maxDonation',
    chainId: ARC_CHAIN_ID,
  });

  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  const isDeployed =
    KASIH_ADDRESS !== '0x0000000000000000000000000000000000000000' &&
    KASIH_ADDRESS.length === 42;

  const faqs = [
    {
      q: 'How does a donation work?',
      a: 'You approve USDC for the exact amount, then donate. The USDC moves in one atomic transfer directly from your wallet to the creator — the contract never holds your funds.',
    },
    {
      q: 'What is the maximum I can donate?',
      a: isMaxLoading
        ? 'Loading from the contract…'
        : maxDonation !== undefined
        ? `The current global limit is ${formatUsdc(maxDonation)} USDC. This is read live from the contract.`
        : 'Connect to Arc to read the live limit.',
    },
    {
      q: 'Is there a platform fee?',
      a: 'No. 100% of every donation goes directly to the creator. The contract has no fee logic.',
    },
    {
      q: 'Do I need to sign up?',
      a: 'Donors need no account — just a wallet and USDC on Arc. Creators register a username once on-chain.',
    },
    {
      q: 'Are messages stored on-chain?',
      a: 'Yes. Donor names, messages, and amounts are in the DonationReceived event on Arc. Creators can hide messages from their public page, but they remain on-chain permanently.',
    },
    {
      q: 'What if I lose access to my payout address?',
      a: 'You can update your payout address any time from the Settings page. The change requires an on-chain transaction from your registered wallet.',
    },
    {
      q: 'Has the contract been audited?',
      a: 'Not by a professional firm. KasihCengkring has had an automated security review, 90 passing Foundry tests, Slither analysis, and a fuzz invariant suite. An independent audit is strongly recommended before using it with large amounts.',
    },
  ];

  return (
    <Layout>
      {/* Hero */}
      <section className="mx-auto max-w-2xl px-4 py-20 text-center space-y-6">
        <div
          className="mx-auto flex size-16 items-center justify-center rounded-2xl"
          style={{ background: 'var(--accent)' }}
          aria-hidden="true"
        >
          <Heart className="size-8 text-white" />
        </div>

        <h1 className="display text-4xl font-700 leading-tight tracking-tight" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
          Support creators<br />with USDC on Arc
        </h1>
        <p className="text-lg text-pretty max-w-md mx-auto" style={{ color: 'var(--muted)' }}>
          No platform fees. No signups for donors. No payout waits. Funds go straight from supporter to creator.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            to="/app"
            className="rounded-2xl px-6 py-3 text-sm font-600 text-white w-full sm:w-auto text-center"
            style={{ background: 'var(--accent)' }}
          >
            Claim your username
          </Link>
          {EXAMPLE_USERNAME && (
            <Link
              to={`/${EXAMPLE_USERNAME}`}
              className="rounded-2xl border px-6 py-3 text-sm font-600 w-full sm:w-auto text-center"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: 'var(--surface)' }}
            >
              See an example
            </Link>
          )}
        </div>

        {!isDeployed && (
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>Contract not yet deployed. Deploy to Arc mainnet to go live.</p>
        )}
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-3xl px-4 py-12">
        <h2 className="display text-2xl font-700 text-center mb-8" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>How it works</h2>
        <div className="grid sm:grid-cols-3 gap-5">
          {[
            { icon: <Shield className="size-6 text-white" />, title: 'Creators register', body: 'Claim a username and payout address once on Arc. No identity verification required.' },
            { icon: <DollarSign className="size-6 text-white" />, title: 'Supporters send USDC', body: 'Approve the exact amount. The contract sends USDC straight from your wallet to the creator.' },
            { icon: <Zap className="size-6 text-white" />, title: 'Instant, zero-fee', body: 'No intermediary, no escrow, no wait. USDC on Arc settles in under a second with stable fees.' },
          ].map((step, i) => (
            <div
              key={i}
              className="rounded-2xl border p-5 space-y-3"
              style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
            >
              <div className="flex size-10 items-center justify-center rounded-xl" style={{ background: 'var(--accent)' }} aria-hidden="true">
                {step.icon}
              </div>
              <h3 className="display text-base font-600" style={{ color: 'var(--ink)' }}>{step.title}</h3>
              <p className="text-sm text-pretty" style={{ color: 'var(--muted)' }}>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why USDC on Arc */}
      <section className="mx-auto max-w-3xl px-4 py-12">
        <h2 className="display text-2xl font-700 text-center mb-8" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Why USDC on Arc?</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { label: 'Gas paid in USDC', body: "No ETH needed. Gas fees are predictable and denominated in the same asset you're sending." },
            { label: 'Sub-second finality', body: 'Donations confirm almost instantly — no waiting for 12-second slots.' },
            { label: 'Stable fees', body: "Arc fees don't spike during market volatility, so small donations stay economical." },
            { label: 'Non-custodial', body: 'The contract never holds funds. Your USDC goes directly to the creator in the same transaction.' },
          ].map((item, i) => (
            <div key={i} className="rounded-2xl border p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="font-600 text-sm mb-1" style={{ color: 'var(--ink)' }}>{item.label}</p>
              <p className="text-sm text-pretty" style={{ color: 'var(--muted)' }}>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-2xl px-4 py-12">
        <h2 className="display text-2xl font-700 text-center mb-8" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>FAQ</h2>
        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="rounded-2xl border overflow-hidden"
              style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
            >
              <button
                onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
                aria-expanded={faqOpen === i}
                aria-controls={`faq-${i}`}
              >
                <span className="font-500 text-sm" style={{ color: 'var(--ink)' }}>{faq.q}</span>
                <ChevronDown
                  className="size-4 shrink-0 transition-transform"
                  style={{ color: 'var(--subtle)', transform: faqOpen === i ? 'rotate(180deg)' : 'none' }}
                  aria-hidden="true"
                />
              </button>
              {faqOpen === i && (
                <div id={`faq-${i}`} className="px-5 pb-4">
                  <p className="text-sm text-pretty" style={{ color: 'var(--muted)' }}>{faq.a}</p>
                  {isMaxLoading && i === 1 && <Skeleton className="mt-2 h-4 w-48" />}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Footer notice */}
      <section className="mx-auto max-w-2xl px-4 pb-12 text-center">
        <p className="text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
          KasihCengkring is unaudited open-source software. Use small amounts. Built on Arc mainnet — real USDC is at risk.
          {isDeployed && (
            <>
              {' '}Contract:{' '}
              <a
                href={`https://explorer.testnet.arc.io/address/${KASIH_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
                className="mono underline underline-offset-2"
                style={{ color: 'var(--accent-hover)' }}
              >
                {KASIH_ADDRESS.slice(0, 10)}…
              </a>
            </>
          )}
        </p>
      </section>
    </Layout>
  );
}
