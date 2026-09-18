import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { CountUp } from './CountUp';

/**
 * Tarjeta de una cifra que responde una pregunta concreta ("¿Cuánto vendí
 * hoy?"). Si se pasa `href`, la tarjeta completa enlaza a la pantalla que
 * explica esa cifra a fondo — el KPI no reemplaza esa pantalla, solo
 * responde la pregunta rápida.
 */
type KpiTone = 'default' | 'warning' | 'dark' | 'accent';

// Contenedor + texto por tono. `dark`/`accent` son la tarjeta "hero" y la de
// acento sólido que le dan jerarquía al grid de KPIs (patrón base44), con la
// paleta de marca en vez de negro/terracota crudos.
//
// `dark` usa los tokens `hero`/`on-hero*` (fijos, ver globals.css) en vez de
// `ink`/`ink-muted`: esos SÍ se invierten en dark mode (--c-ink pasa a hueso
// claro), lo que dejaría el label/hint oscuro-sobre-oscuro (casi invisible)
// contra el fondo negro fijo de esta tarjeta. `accent` sí puede usar
// `primary`/`on-primary` normales porque ambos están diseñados para
// invertir juntos y mantener contraste en los dos temas.
const TONE_CONTAINER: Record<KpiTone, string> = {
  default: 'border border-line bg-surface group-hover:border-primary/50',
  warning: 'border border-line bg-surface group-hover:border-primary/50',
  dark: 'border border-hero bg-hero group-hover:border-on-hero-accent',
  accent: 'border border-primary bg-primary group-hover:border-primary-hover',
};

const TONE_LABEL: Record<KpiTone, string> = {
  default: 'text-ink-subtle',
  warning: 'text-ink-subtle',
  dark: 'text-on-hero-muted',
  accent: 'text-on-primary/80',
};

// El número grande va en color de acento sobre las tarjetas oscura/primaria
// (igual que la plantilla de referencia: el "0" queda en el color de marca,
// no en blanco liso), y en ink/warning sobre las tarjetas claras.
const TONE_VALUE: Record<KpiTone, string> = {
  default: 'text-ink',
  warning: 'text-warning',
  dark: 'text-on-hero-accent',
  accent: 'text-on-primary',
};

const TONE_HINT: Record<KpiTone, string> = {
  default: 'text-ink-subtle',
  warning: 'text-ink-subtle',
  dark: 'text-on-hero-muted',
  accent: 'text-on-primary/80',
};

const TONE_DOT: Record<KpiTone, string> = {
  default: 'bg-primary',
  warning: 'bg-warning',
  dark: 'bg-on-hero',
  accent: 'bg-on-primary',
};

export function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
  href,
  revealDelay,
  dotClassName,
  countUp,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: KpiTone;
  href?: string;
  /** ms de retraso de entrada, para escalonar un grid de varias KpiCard. */
  revealDelay?: number;
  /** Color del punto junto al label; por defecto depende del tono. */
  dotClassName?: string;
  /** Si se pasa, `value` se ignora y la cifra se anima con requestAnimationFrame. */
  countUp?: { value: number; from?: number; format?: 'integer' | 'money' };
}) {
  const content = (
    <div
      className={
        'reveal h-full rounded-card p-4 shadow-card transition-colors ' + TONE_CONTAINER[tone]
      }
      style={revealDelay ? ({ '--reveal-delay': `${revealDelay}ms` } as CSSProperties) : undefined}
    >
      <p className={'flex items-center gap-2 text-xs font-medium ' + TONE_LABEL[tone]}>
        <span aria-hidden="true" className={'inline-block h-2.5 w-2.5 rounded-pill ' + (dotClassName ?? TONE_DOT[tone])} />
        {label}
      </p>
      <p className={'mt-1.5 font-mono text-3xl font-light tracking-tight tabular-nums md:text-[48px] ' + TONE_VALUE[tone]}>
        {countUp ? <CountUp {...countUp} /> : value}
      </p>
      {hint ? <p className={'mt-1 text-xs ' + TONE_HINT[tone]}>{hint}</p> : null}
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
