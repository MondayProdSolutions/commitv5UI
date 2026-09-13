'use client';

import { useMemo } from 'react';
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import { dictionary, adjacencyGraphs } from '@zxcvbn-ts/language-common';

// One factory for the whole client bundle. This build of @zxcvbn-ts/core (v4.2)
// exposes `ZxcvbnFactory` rather than the older `zxcvbn` / `zxcvbnOptions`
// singletons, so we construct it with the common-language dictionary + graphs.
const zxcvbn = new ZxcvbnFactory({
  dictionary: { ...dictionary },
  graphs: adjacencyGraphs,
});

const LABELS = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte'] as const;
const BAR_COLORS = [
  'bg-danger-solid',
  'bg-accent-amber',
  'bg-warning',
  'bg-lime-500',
  'bg-success',
] as const;

/**
 * Informative-only strength meter. It never blocks submission — the server
 * action + password policy are the real gate.
 */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const score = useMemo(() => {
    if (!password) return 0;
    return zxcvbn.check(password).score; // 0..4
  }, [password]);

  const filled = password ? score + 1 : 0;

  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-pill ${i < filled ? BAR_COLORS[score] : 'bg-surface-sunken'}`}
          />
        ))}
      </div>
      <p className="text-xs text-ink-subtle">
        {password ? `Seguridad: ${LABELS[score]}` : 'Usa al menos 10 caracteres.'}
      </p>
    </div>
  );
}
