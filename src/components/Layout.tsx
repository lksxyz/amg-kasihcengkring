import { Link, useLocation } from 'react-router-dom';
import { ConnectKitButton } from 'connectkit';
import { Heart } from 'lucide-react';
import { arcChain } from '../config';
import { KASIH_ADDRESS } from '../contract';
import { buildAddressExplorerUrl } from '../onchain-facts';
import { IS_TESTNET } from '../network';
import TestnetBanner from './TestnetBanner';

interface LayoutProps {
  children: React.ReactNode;
  /** Hides the page navigation (public creator profiles). */
  minimal?: boolean;
}

export default function Layout({ children, minimal = false }: LayoutProps) {
  const location = useLocation();
  const isApp = location.pathname.startsWith('/app');
  const isDeployed = KASIH_ADDRESS !== '0x0000000000000000000000000000000000000000';

  return (
    <div className="flex min-h-dvh flex-col">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <TestnetBanner />

      <header
        className="sticky top-0 z-40 border-b"
        style={{
          background: 'rgba(249, 251, 244, 0.88)',
          backdropFilter: 'blur(16px) saturate(160%)',
          WebkitBackdropFilter: 'blur(16px) saturate(160%)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="shell grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 py-3 md:grid-cols-[auto_1fr_auto]">
          <Link
            to="/"
            className="flex items-center gap-2.5 select-none"
            aria-label="KasihCengkring home"
          >
            <span
              className="flex size-9 items-center justify-center rounded-xl"
              style={{ background: 'var(--accent)' }}
            >
              <Heart className="size-4 fill-current" style={{ color: 'var(--accent-ink)' }} aria-hidden="true" />
            </span>
            <span className="display text-[1.0625rem] font-bold" style={{ color: 'var(--ink)' }}>
              KasihCengkring
            </span>
          </Link>

          {!minimal && (
            <nav
              aria-label="Main"
              className="order-3 col-span-2 flex items-center gap-0.5 overflow-x-auto pb-1 md:order-none md:col-span-1 md:justify-self-center md:pb-0"
            >
              {isApp ? (
                <>
                  <NavLink to="/app" exact>
                    Dashboard
                  </NavLink>
                  <NavLink to="/app/history">History</NavLink>
                  <NavLink to="/app/setting">Settings</NavLink>
                </>
              ) : (
                <NavLink to="/app">Creator dashboard</NavLink>
              )}
            </nav>
          )}

          <div className="col-start-2 row-start-1 flex items-center justify-end gap-2 md:col-start-3">
            <ConnectKitButton label="Connect" />
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      {!isApp && (
        <footer className="border-t" style={{ borderColor: 'var(--border)' }}>
          <div
            className="shell flex flex-col gap-2 py-8 pb-20 text-xs sm:flex-row sm:items-center sm:justify-between sm:pb-8 sm:pr-44"
            style={{ color: 'var(--muted)' }}
          >
            <p>
              {IS_TESTNET
                ? 'KasihCengkring is unaudited open-source software. Use small amounts on Arc Testnet.'
                : 'KasihCengkring is unaudited open-source software. Donate only what you can afford to lose.'}
            </p>
            {isDeployed && (
              <p>
                Contract{' '}
                <a
                  href={buildAddressExplorerUrl(arcChain.id, KASIH_ADDRESS)}
                  target="_blank"
                  rel="noreferrer"
                  className="mono link"
                >
                  {KASIH_ADDRESS.slice(0, 10)}…{KASIH_ADDRESS.slice(-4)}
                </a>
              </p>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

function NavLink({
  to,
  exact = false,
  children,
}: {
  to: string;
  exact?: boolean;
  children: React.ReactNode;
}) {
  const location = useLocation();
  const active = exact ? location.pathname === to : location.pathname.startsWith(to);
  return (
    <Link to={to} className="nav-link" aria-current={active ? 'page' : undefined}>
      {children}
    </Link>
  );
}
