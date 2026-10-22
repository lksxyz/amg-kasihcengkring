import type { ReactNode } from 'react';

/** Shared page header so every route starts on the same baseline. */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 space-y-1.5">
        <h1 className="display text-[1.75rem] font-bold sm:text-[2.125rem]" style={{ color: 'var(--ink)' }}>
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-sm" style={{ color: 'var(--muted)' }}>
            {description}
          </p>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
