import Link from 'next/link';

/** Reemplaza los textos sueltos "Sin resultados." de cada tabla, con una acción opcional para salir del estado vacío. */
export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="py-10 text-center text-sm text-ink-muted">
      <p>{message}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-1 inline-block font-semibold text-primary hover:text-primary-hover"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
