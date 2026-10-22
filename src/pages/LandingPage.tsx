/**
 * / — Landing page.
 * Hero, how it works, why Arc, FAQ, live contract note.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useReadContract } from 'wagmi';
import { arcTestnet } from 'viem/chains';
import { ArrowRight, ChevronDown } from 'lucide-react';
import Layout from '../components/Layout';
import { Skeleton } from '../components/Skeleton';
import { KASIH_ADDRESS, KASIH_ABI } from '../contract';
import { buildAddressExplorerUrl } from '../onchain-facts';
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
      a: 'You approve USDC for the exact amount, then send it. One atomic transfer moves the USDC from your wallet to the creator — the contract never holds your funds.',
    },
    {
      q: 'What is the maximum I can donate?',
      a: isMaxLoading
        ? 'Reading the live limit from the contract…'
        : maxDonation !== undefined
          ? `The contract currently caps a single donation at ${formatUsdc(maxDonation)} USDC. This is read live from Arc.`
          : 'Connect to Arc to read the live limit.',
    },
    {
      q: 'Does KasihCengkring take a fee?',
      a: 'No. The contract has no fee logic. 100% of every donation goes to the creator.',
    },
    {
      q: 'Do supporters need an account?',
      a: 'No. Supporters only need a wallet with USDC on Arc. Creators claim a username once, on-chain.',
    },
    {
      q: 'Are names and messages public?',
      a: 'Yes. Supporter names, messages, and amounts are recorded in the DonationReceived event on Arc, so anyone can read them from the chain. Creators see the full history in their dashboard; the on-chain record cannot be deleted.',
    },
    {
      q: 'What if I lose access to my payout wallet?',
      a: 'Update your payout address in Settings at any time. The change is an on-chain transaction from your registered wallet, and it stays available even while donations are paused.',
    },
    {
      q: 'Has the contract been audited?',
      a: 'Not by an independent firm. It has automated security review, a Foundry test suite, Slither analysis, and fuzz invariants. We recommend a professional audit before using it with large amounts.',
    },
  ];

  return (
    <Layout>
      {/* Hero */}
      <section className="shell pb-16 pt-16 sm:pb-20 sm:pt-24">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <h1
            className="display text-[2.5rem] font-bold leading-[0.98] sm:text-6xl lg:text-[4.25rem]"
            style={{ color: 'var(--ink)' }}
          >
            Support creators,
            <br />
            <span className="hero-mark">directly.</span>
          </h1>

          <p
            className="mt-6 max-w-xl text-pretty text-base sm:text-lg"
            style={{ color: 'var(--muted)' }}
          >
            Send USDC on Arc straight to the people you back. No platform fee, no supporter
            account, no payout wait.
          </p>

          <div className="mt-8 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Link to="/app" className="btn btn-primary btn-lg">
              Claim your username
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            {EXAMPLE_USERNAME && (
              <Link to={`/${EXAMPLE_USERNAME}`} className="btn btn-secondary btn-lg">
                See a live page
              </Link>
            )}
          </div>

          <p className="mt-6 text-xs" style={{ color: 'var(--subtle)' }}>
            Non-custodial · 0% platform fee · Settles in under a second
          </p>

          {!isDeployed && (
            <p className="alert alert-danger mt-6 max-w-md text-left" role="status">
              The contract is not deployed in this build. Set a contract address before going live.
            </p>
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="shell pb-20" aria-labelledby="how-it-works">
        <div className="grid gap-10 border-t pt-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-16">
          <h2
            id="how-it-works"
            className="display text-2xl font-bold sm:text-3xl"
            style={{ color: 'var(--ink)' }}
          >
            How it works
          </h2>

          <ol className="grid gap-8 sm:grid-cols-3 sm:gap-6">
            {[
              {
                title: 'Claim your page',
                body: 'Register a username, a payout address, and your minimum donation. One on-chain transaction, no identity check.',
              },
              {
                title: 'Share your link',
                body: 'Supporters open your page, choose an amount, and approve the exact USDC amount.',
              },
              {
                title: 'Get paid instantly',
                body: 'USDC lands in your payout wallet in the same transaction. No escrow, no withdrawal step.',
              },
            ].map((step, i) => (
              <li key={step.title} className="border-t-2 pt-5" style={{ borderColor: 'var(--ink)' }}>
                <span className="mono text-xs font-medium" style={{ color: 'var(--accent-deep)' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-2 text-base font-bold" style={{ color: 'var(--ink)' }}>
                  {step.title}
                </h3>
                <p className="mt-1.5 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Why Arc */}
      <section className="shell pb-20" aria-labelledby="why-arc">
        <div className="grid gap-10 border-t pt-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-16">
          <div className="space-y-3">
            <h2
              id="why-arc"
              className="display text-2xl font-bold sm:text-3xl"
              style={{ color: 'var(--ink)' }}
            >
              Why USDC on Arc
            </h2>
            <p className="max-w-sm text-sm text-pretty" style={{ color: 'var(--muted)' }}>
              Stable fees make small, frequent support practical — the way it should be.
            </p>
          </div>

          <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {[
              {
                label: 'Gas paid in USDC',
                body: 'No ETH top-ups. Fees are predictable and denominated in the same asset you send.',
              },
              {
                label: 'Sub-second finality',
                body: 'Donations confirm almost instantly, so the receipt is already there when the supporter returns.',
              },
              {
                label: 'Stable fees',
                body: 'Arc fees do not spike with market volatility, so a 1 USDC donation still makes sense.',
              },
              {
                label: 'Non-custodial by design',
                body: 'The contract never holds funds. Your USDC goes directly to the creator in the same transaction.',
              },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                  {item.label}
                </dt>
                <dd className="mt-1 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
                  {item.body}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* FAQ */}
      <section className="shell pb-20" aria-labelledby="faq">
        <div className="grid gap-10 border-t pt-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-16">
          <div>
            <h2
              id="faq"
              className="display text-2xl font-bold sm:text-3xl"
              style={{ color: 'var(--ink)' }}
            >
              Questions, answered
            </h2>
            <p className="mt-3 max-w-sm text-sm text-pretty" style={{ color: 'var(--muted)' }}>
              Everything about fees, custody, and what happens on-chain.
            </p>
          </div>

          <div className="border-t lg:border-t-0" style={{ borderColor: 'var(--border)' }}>
            {faqs.map((faq, i) => {
              const open = faqOpen === i;
              return (
                <div key={faq.q} className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <h3>
                    <button
                      type="button"
                      onClick={() => setFaqOpen(open ? null : i)}
                      className="flex w-full items-center justify-between gap-4 py-5 text-left"
                      aria-expanded={open}
                      aria-controls={`faq-panel-${i}`}
                      id={`faq-trigger-${i}`}
                    >
                      <span className="text-sm font-bold sm:text-[0.9375rem]" style={{ color: 'var(--ink)' }}>
                        {faq.q}
                      </span>
                      <ChevronDown
                        className="size-4 shrink-0 transition-transform duration-200"
                        style={{
                          color: 'var(--subtle)',
                          transform: open ? 'rotate(180deg)' : 'none',
                        }}
                        aria-hidden="true"
                      />
                    </button>
                  </h3>
                  <div
                    id={`faq-panel-${i}`}
                    role="region"
                    aria-labelledby={`faq-trigger-${i}`}
                    hidden={!open}
                    className="pb-5 pr-8"
                  >
                    <p className="text-sm text-pretty" style={{ color: 'var(--muted)' }}>
                      {faq.a}
                    </p>
                    {isMaxLoading && i === 1 && <Skeleton className="mt-2 h-4 w-48" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contract note */}
      <section className="shell pb-16">
        <div className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
            KasihCengkring is unaudited open-source software running on Arc Testnet. Use test
            funds only while it is under review.
            {isDeployed && (
              <>
                {' '}
                The contract is{' '}
                <a
                  href={buildAddressExplorerUrl(ARC_CHAIN_ID, KASIH_ADDRESS)}
                  target="_blank"
                  rel="noreferrer"
                  className="mono link"
                >
                  {KASIH_ADDRESS.slice(0, 10)}…{KASIH_ADDRESS.slice(-4)}
                </a>
                .
              </>
            )}
          </p>
        </div>
      </section>
    </Layout>
  );
}
