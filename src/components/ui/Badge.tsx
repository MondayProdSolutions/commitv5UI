import type { ReactNode } from 'react';

type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral';

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: 'bg-success-soft text-on-success-soft',
  warning: 'bg-warning-soft text-on-warning-soft',
  danger: 'bg-danger-soft text-on-danger-soft',
  neutral: 'bg-surface-raised text-ink-muted',
};

/** Un tono = un significado, igual en todo el sistema (ej. `warning` siempre es "atención", nunca otra cosa en otra pantalla). */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={
        'inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-semibold ' + TONE_CLASSES[tone]
      }
    >
      {children}
    </span>
  );
}
