'use client';

import { money, type SaleComputeResult } from './types';

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={
        strong
          ? 'flex items-baseline justify-between border-t border-line pt-2'
          : 'flex items-center justify-between text-ink-muted'
      }
    >
      <dt className={strong ? 'text-sm font-bold uppercase tracking-wide text-ink-muted' : undefined}>{label}</dt>
      <dd
        className={
          'tabular-nums ' +
          (strong ? 'text-[44px] font-extrabold leading-none text-ink' : '')
        }
      >
        {value}
      </dd>
    </div>
  );
}

const round2 = (x: number): number => Math.round(x * 100) / 100;

export function TotalsPanel({ quote }: { quote: SaleComputeResult | null }) {
  const dash = '—';
  const descuentos = quote ? quote.descuentoLineas + quote.descuentoTicket : 0;
  // "Subtotal" mostrado = base BRUTA (previa a descuentos), de modo que en
  // pantalla `Subtotal − Descuentos + IVA == Total`. `quote.subtotal` ya es la
  // base NETA (post-descuento); la identidad de reconstrucción es exacta.
  const baseBruta = quote
    ? round2(quote.subtotal + quote.descuentoLineas + quote.descuentoTicket)
    : 0;

  return (
    <dl className="space-y-1.5 rounded-card border border-line bg-surface p-4 text-sm">
      <Row label="Subtotal" value={quote ? money(baseBruta) : dash} />
      {descuentos > 0 ? <Row label="Descuentos" value={`− ${money(descuentos)}`} /> : null}
      <Row label="IVA" value={quote ? money(quote.impuestos) : dash} />
      <Row label="Total" value={quote ? money(quote.total) : dash} strong />
    </dl>
  );
}
