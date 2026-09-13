import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-solid';
type ButtonSize = 'sm' | 'md';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-on-primary shadow-primary hover:bg-primary-hover active:bg-primary-active disabled:opacity-60',
  secondary:
    'bg-surface border border-line-strong text-ink hover:bg-surface-raised disabled:opacity-60',
  danger:
    'bg-surface border border-danger/40 text-danger hover:bg-danger-soft disabled:opacity-60',
  'danger-solid':
    'bg-danger-solid text-on-danger shadow-card hover:bg-danger-solid-hover disabled:opacity-60',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  // Alturas mínimas pensadas para uso táctil (tablet en el punto de venta).
  sm: 'min-h-10 px-3 py-2 text-sm',
  md: 'min-h-11 px-4 py-2.5 text-sm',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pending?: boolean;
  pendingLabel?: ReactNode;
  children: ReactNode;
};

/**
 * Botón compartido — 4 variantes, nada más. Una pantalla tiene, como máximo,
 * un `primary` visible a la vez (la acción principal).
 *
 * `pending`/`pendingLabel` consolidan el patrón `SubmitBtn` local que varios
 * formularios duplicaban: el llamador sigue leyendo `useFormStatus()` /
 * `useActionState()` como hoy y pasa el resultado a estas dos props.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  pending = false,
  pendingLabel,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || pending}
      className={
        'inline-flex items-center justify-center gap-1.5 rounded-control font-semibold transition-colors ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ' +
        VARIANT_CLASSES[variant] +
        ' ' +
        SIZE_CLASSES[size] +
        ' ' +
        className
      }
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
