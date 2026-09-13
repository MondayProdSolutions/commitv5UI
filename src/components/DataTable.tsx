import type { ComponentType, ReactNode } from 'react';
import Link from 'next/link';

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
};

export type DataTableRowProps = { href?: string; children: ReactNode };

function cellValue<T>(row: T, key: string): ReactNode {
  const v = (row as Record<string, unknown>)[key];
  if (v == null) return '';
  if (v instanceof Date) return v.toLocaleString('es-ES');
  return String(v);
}

function DefaultRow({ children }: DataTableRowProps) {
  return <tr className="relative transition-colors hover:bg-surface-raised">{children}</tr>;
}

/**
 * Tabla genérica y responsive: en pantallas pequeñas hace scroll horizontal
 * (`overflow-x-auto` + ancho mínimo en `<table>`).
 *
 * - `rowHref` enlaza la primera celda de cada fila a esa ruta con un enlace
 *   "estirado" que cubre toda la fila (funciona sin JavaScript).
 * - `rowComponent` permite sustituir el `<tr>` por un componente cliente
 *   (p. ej. para navegación interactiva); recibe `href` y las celdas ya renderizadas.
 */
export function DataTable<T>({
  columns,
  rows,
  getKey,
  rowHref,
  rowComponent,
  emptyMessage = 'Sin resultados.',
}: {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string;
  rowHref?: (row: T) => string;
  rowComponent?: ComponentType<DataTableRowProps>;
  emptyMessage?: string;
}) {
  const Row = rowComponent ?? DefaultRow;

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead className="border-b border-line bg-surface-raised">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="px-4 py-3 text-left font-semibold text-ink-muted">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-ink-subtle">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const href = rowHref?.(row);
              return (
                <Row key={getKey(row)} href={href}>
                  {columns.map((c, i) => {
                    const content = c.render ? c.render(row) : cellValue(row, c.key);
                    return (
                      <td key={c.key} className="px-4 py-3.5 text-ink-muted">
                        {href && i === 0 && !rowComponent ? (
                          <Link
                            href={href}
                            className="font-semibold text-ink after:absolute after:inset-0 after:content-['']"
                          >
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}
                </Row>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
