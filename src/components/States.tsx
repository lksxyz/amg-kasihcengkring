import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Full-page state for gates (connect wallet, wrong network, empty route). */
export function StatePanel({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center sm:px-10">
      {Icon && (
        <span
          className="mb-1 flex size-12 items-center justify-center rounded-2xl"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent-deep)' }}
        >
          <Icon className="size-6" aria-hidden="true" />
        </span>
      )}
      <h1 className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>
        {title}
      </h1>
      <p className="max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
        {description}
      </p>
      {children && <div className="pt-2">{children}</div>}
    </div>
  );
}

/** In-page empty state with an explicit next step. */
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
        {title}
      </p>
      <p className="max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
        {description}
      </p>
      {children && <div className="pt-2">{children}</div>}
    </div>
  );
}
