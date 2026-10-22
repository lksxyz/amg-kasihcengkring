import { Link, useLocation } from 'react-router-dom';
import { ConnectKitButton } from 'connectkit';
import { Heart } from 'lucide-react';
import { arcTestnet } from 'viem/chains';
import { KASIH_ADDRESS } from '../contract';
import { buildAddressExplorerUrl } from '../onchain-facts';

interface LayoutProps {
  children: React.ReactNode;
  /** If true, renders a minimal nav without the app links */
  minimal?: boolean;
}

export default function Layout({ children, minimal = false }: LayoutProps) {
  const location = useLocation();
  const isApp = location.pathname.startsWith('/app');

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg-gradient)' }}>
      {/* Nav */}
      <header
        className="sticky top-0 z-40 border-b"
        style={{
          background: 'rgba(255,255,255,0.80)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 select-none" aria-label="KasihCengkring home">
            <div
              className="flex size-8 items-center justify-center rounded-xl"
              style={{ background: 'var(--accent)' }}
            >
              <Heart className="size-4 text-white" aria-hidden="true" />
            </div>
            <span className="display text-base font-700" style={{ color: 'var(--ink)' }}>
              KasihCengkring
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {!minimal && (
              <nav className="hidden sm:flex items-center gap-1" aria-label="Main navigation">
                {isApp ? (
                  <>
                    <NavLink to="/app" exact>Dashboard</NavLink>
                    <NavLink to="/app/history">History</NavLink>
                    <NavLink to="/app/setting">Settings</NavLink>
                  </>
                ) : (
                  <NavLink to="/app">Creator Dashboard</NavLink>
                )}
              </nav>
            )}
            <ConnectKitButton />
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">{children}</main>

      {/* Footer — only on non-app pages */}
      {!isApp && (
        <footer
          className="border-t py-8 text-center"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            KasihCengkring is unaudited. Use small amounts.{' '}
            {KASIH_ADDRESS !== '0x0000000000000000000000000000000000000000' && (
              <>
                Contract:{' '}
                <a
                  href={buildAddressExplorerUrl(arcTestnet.id, KASIH_ADDRESS)}
                  target="_blank"
                  rel="noreferrer"
                  className="mono underline underline-offset-2"
                  style={{ color: 'var(--accent-hover)' }}
                >
                  {KASIH_ADDRESS.slice(0, 10)}...
                </a>
              </>
            )}
          </p>
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
    <Link
      to={to}
      className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
      style={{
        color: active ? 'var(--accent)' : 'var(--muted)',
        background: active ? 'var(--surface-muted)' : 'transparent',
      }}
    >
      {children}
    </Link>
  );
}
