import type { SaleComputeResult } from '@/lib/sales/compute';

export type { SaleComputeResult };

export type Descuento = { tipo: 'monto' | 'porcentaje'; valor: number };

/** Producto/variante listo para añadirse al carrito. */
export type AddItem = {
  variantId: string;
  productoNombre: string;
  varianteNombre: string | null;
  precioConImpuesto: number;
  stock: number;
};

export type CartLine = {
  key: string;
  variantId: string;
  productoNombre: string;
  varianteNombre: string | null;
  precioConImpuesto: number;
  stock: number;
  cantidad: number;
  descuento: Descuento | null;
};

export type SelectedCustomer = { id: string; nombre: string; facturable: boolean };

export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';

export type PagoRow = { id: string; metodo: MetodoPago; monto: number };

export const METODO_LABEL: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
};

export function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * Fecha + hora corta en español anclada a `America/Mexico_City`, para que la
 * presentación no dependa de la zona horaria ambiente del host.
 */
export function fmtFechaMX(d: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(d);
}

export const inputClass =
  'block w-full min-h-11 rounded-control border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40 disabled:opacity-60';
