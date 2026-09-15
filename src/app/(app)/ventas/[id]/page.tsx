import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission, getCurrentUser } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { getSale } from '@/lib/sales/sales';
import { enmascararRfc } from '@/lib/customers/fiscal';
import { getRegimenLabel } from '@/lib/sat/regimenes-fiscales';
import { getUsoCfdiLabel } from '@/lib/sat/usos-cfdi';
import { PermissionGate } from '@/components/PermissionGate';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { CancelSaleForm } from '../CancelSaleForm';
import { leerDatosFiscales } from '../TicketView';
import { money, METODO_LABEL, fmtFechaMX } from '../types';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-subtle">{title}</h2>
      {children}
    </Card>
  );
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export default async function VentaDetallePage(props: { params: Promise<{ id: string }> }) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, () => renderVentaDetallePage(props));
}

async function renderVentaDetallePage(props: { params: Promise<{ id: string }> }) {
  await requirePermission('ventas.ver');
  const { id } = await props.params;

  const sale = await getSale(id);
  if (!sale) notFound();

  const actor = await getCurrentUser();
  const canCancelar = can(actor, 'ventas.cancelar');
  const canDevolver = can(actor, 'ventas.devolver');

  const datosFiscales = leerDatosFiscales(sale.datosFiscales);
  const descuentos = sale.descuentoLineas + sale.descuentoTicket;
  // "Subtotal" mostrado = base BRUTA, para que `Subtotal − Descuentos + IVA == Total`.
  const baseBruta = round2(sale.subtotal + sale.descuentoLineas + sale.descuentoTicket);

  const puedeCancelar =
    canCancelar &&
    sale.estado === 'COMPLETADA' &&
    sale.cashSessionEstado === 'ABIERTA' &&
    sale.returns.length === 0;

  const quedaDevolvible = sale.lines.some((l) => l.cantidad > (sale.devuelto[l.id] ?? 0));
  const puedeDevolver = canDevolver && sale.estado === 'COMPLETADA' && quedaDevolvible;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/ventas/historial" className="text-sm text-ink-subtle hover:text-ink">
            ← Ventas
          </Link>
          <h1 className="text-2xl font-bold">Venta {sale.folio}</h1>
          <p className="text-ink-muted">
            {fmtFechaMX(sale.createdAt)} · {sale.clienteNombre} · Cajero: {sale.cajeroNombre}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sale.estado === 'CANCELADA' ? <Badge tone="neutral">Cancelada</Badge> : (
            <Badge tone="success">Completada</Badge>
          )}
          {sale.requiereFactura ? <Badge tone="warning">Requiere factura</Badge> : null}
        </div>
      </div>

      {sale.estado === 'CANCELADA' ? (
        <Section title="Cancelación">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-subtle">Fecha</dt>
              <dd>{sale.canceladaEn ? fmtFechaMX(sale.canceladaEn) : '—'}</dd>
            </div>
            <div>
              <dt className="text-ink-subtle">Cancelada por</dt>
              <dd>{sale.canceladaPorNombre ?? '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-ink-subtle">Motivo</dt>
              <dd>{sale.motivoCancelacion ?? '—'}</dd>
            </div>
          </dl>
        </Section>
      ) : null}

      <Section title="Líneas">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="border-b border-line text-left text-ink-subtle">
              <tr>
                <th className="py-2 pr-3 font-medium">Producto</th>
                <th className="py-2 pr-3 font-medium">Cantidad</th>
                <th className="py-2 pr-3 font-medium">Precio unit.</th>
                <th className="py-2 pr-3 font-medium">Descuento</th>
                <th className="py-2 pr-3 font-medium">Base neta</th>
                <th className="py-2 pr-3 font-medium">IVA</th>
                <th className="py-2 pr-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sale.lines.map((l) => {
                const descLinea = l.descuentoMonto + l.descuentoTicketProrrateado;
                return (
                  <tr key={l.id}>
                    <td className="py-2 pr-3">
                      {l.productoNombre}
                      {l.varianteNombre ? (
                        <span className="text-ink-subtle"> · {l.varianteNombre}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{l.cantidad}</td>
                    <td className="py-2 pr-3">{money(l.precioUnitario)}</td>
                    <td className="py-2 pr-3">{descLinea > 0 ? `-${money(descLinea)}` : '—'}</td>
                    <td className="py-2 pr-3">{money(l.baseNeta)}</td>
                    <td className="py-2 pr-3">{money(l.impuesto)}</td>
                    <td className="py-2 pr-3">{money(l.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Totales">
        <dl className="grid max-w-sm gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-subtle">Subtotal</dt>
            <dd>{money(baseBruta)}</dd>
          </div>
          {descuentos > 0 ? (
            <div className="flex justify-between">
              <dt className="text-ink-subtle">Descuentos</dt>
              <dd>-{money(descuentos)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-ink-subtle">IVA</dt>
            <dd>{money(sale.impuestos)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 font-semibold">
            <dt>Total</dt>
            <dd>{money(sale.total)}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Pagos">
        <dl className="grid max-w-sm gap-2 text-sm">
          {sale.payments.map((p, i) => (
            <div className="flex justify-between" key={`${p.metodo}-${i}`}>
              <dt className="text-ink-subtle">{METODO_LABEL[p.metodo] ?? p.metodo}</dt>
              <dd>{money(p.monto)}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-line pt-2">
            <dt className="text-ink-subtle">Pagado</dt>
            <dd>{money(sale.pagado)}</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt>Cambio</dt>
            <dd>{money(sale.cambio)}</dd>
          </div>
        </dl>
      </Section>

      {datosFiscales ? (
        <Section title="Datos de facturación">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-subtle">Razón social</dt>
              <dd>{datosFiscales.razonSocial || '—'}</dd>
            </div>
            <div>
              <dt className="text-ink-subtle">RFC</dt>
              <dd>{enmascararRfc(datosFiscales.rfc)}</dd>
            </div>
            <div>
              <dt className="text-ink-subtle">Régimen fiscal</dt>
              <dd>
                {datosFiscales.regimenFiscalCode
                  ? getRegimenLabel(datosFiscales.regimenFiscalCode)
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-subtle">Uso de CFDI</dt>
              <dd>
                {datosFiscales.usoCfdiCode ? getUsoCfdiLabel(datosFiscales.usoCfdiCode) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-subtle">Código postal</dt>
              <dd>{datosFiscales.cpFiscal || '—'}</dd>
            </div>
          </dl>
        </Section>
      ) : null}

      {sale.returns.length > 0 ? (
        <Section title="Devoluciones asociadas">
          <ul className="divide-y divide-line text-sm">
            {sale.returns.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <span>
                  <Link
                    href={`/ventas/devoluciones/${r.id}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {r.folio}
                  </Link>
                  <span className="text-ink-subtle"> · {fmtFechaMX(r.createdAt)}</span>
                </span>
                <span>{money(r.total)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Acciones">
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/ventas-ticket/${sale.id}`}
            className="rounded-control border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-raised"
          >
            Imprimir ticket
          </Link>
          {puedeDevolver ? (
            <PermissionGate permiso="ventas.devolver" user={actor}>
              <Link
                href={`/ventas/${sale.id}/devolucion`}
                className="inline-flex items-center justify-center gap-1.5 rounded-control bg-primary px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                Registrar devolución
              </Link>
            </PermissionGate>
          ) : null}
        </div>

        {puedeCancelar ? (
          <PermissionGate permiso="ventas.cancelar" user={actor}>
            <div className="mt-4 border-t border-line pt-4">
              <CancelSaleForm saleId={sale.id} />
            </div>
          </PermissionGate>
        ) : null}
      </Section>
    </div>
  );
}
