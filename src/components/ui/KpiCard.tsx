import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Tarjeta de una cifra que responde una pregunta concreta ("¿Cuánto vendí
 * hoy?"). Si se pasa `href`, la tarjeta completa enlaza a la pantalla que
 * explica esa cifra a fondo — el KPI no reemplaza esa pantalla, solo
 * responde la pregunta rápida.
 */
export function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'warning';
  href?: string;
}) {
  const content = (
    <div className="h-full rounded-card border border-line bg-surface p-5 shadow-card transition-colors group-hover:border-primary/50">
      <p className="text-xs font-medium text-ink-subtle">{label}</p>
      <p
        className={
          'mt-1.5 text-3xl font-extrabold tracking-tight tabular-nums ' +
          (tone === 'warning' ? 'text-warning' : 'text-ink')
        }
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-subtle">{hint}</p> : null}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        {content}
      </Link>
    );
  }
  return content;
}
