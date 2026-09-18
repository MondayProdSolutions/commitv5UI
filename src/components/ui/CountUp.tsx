'use client';

import { useEffect, useState } from 'react';
import { money } from '@/app/(app)/ventas/types';

const FORMATTERS = {
  integer: (n: number) => String(Math.round(n)),
  money: (n: number) => money(n),
} as const;

/**
 * Cifra animada (requestAnimationFrame, ease-out cúbico). Arranca en `from`
 * (puede ser negativo, p. ej. la tarjeta de alertas de stock) y termina en
 * `value`. Respeta `prefers-reduced-motion`: sin JS de por medio, muestra el
 * valor final directo.
 *
 * `format` es un string, no una función: este componente es Client y las
 * funciones no se pueden pasar como prop desde un Server Component (RSC) —
 * de ahí el error en runtime la primera vez que se intentó con `formatValue`.
 */
export function CountUp({
  value,
  from = 0,
  durationMs = 900,
  format = 'integer',
}: {
  value: number;
  from?: number;
  durationMs?: number;
  format?: keyof typeof FORMATTERS;
}) {
  const formatValue = FORMATTERS[format];
  // Arranca siempre en `from`, igual en servidor y cliente (sin mismatch de
  // hidratación) — la animación real solo corre en el efecto, después del
  // montaje, igual que el patrón `mounted` clásico.
  const [display, setDisplay] = useState(from);

  useEffect(() => {
    let raf = 0;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      raf = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(raf);
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, from, durationMs]);

  return <>{formatValue(display)}</>;
}
