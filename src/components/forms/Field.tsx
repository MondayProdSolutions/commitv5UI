import type { ReactNode } from 'react';

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-semibold text-ink">{label}</span>
      {children}
      {error ? <span className="block text-sm text-danger">{error}</span> : null}
    </label>
  );
}
