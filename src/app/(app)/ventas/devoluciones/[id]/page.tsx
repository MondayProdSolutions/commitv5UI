import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { getReturn } from '@/lib/sales/returns';
import { money, METODO_LABEL, fmtFechaMX } from '../../types';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-subtle">{title}</h2>
      {children}
    </div>
  );
}

type DevolucionDetallePageProps = { params: Promise<{ id: string }> };

export default async function DevolucionDetallePage(props: DevolucionDetallePageProps) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, () => renderDevolucionDetallePage(props));
}

async function renderDevolucionDetallePage(props: DevolucionDetallePageProps) {
  await requirePermission('ventas.ver');
  const { id } = await props.params;

  const ret = await getReturn(id);
  if (!ret) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/ventas/devoluciones"
          className="text-sm text-ink-subtle hover:text-ink"
        >
          ← Devoluciones
        </Link>
        <h1 className="text-2xl font-bold">Devolución {ret.folio}</h1>
        <p className="text-ink-muted">
          {fmtFechaMX(ret.createdAt)} · Cajero: {ret.cajeroNombre} ·{' '}
          <Link href={`/ventas/${ret.ventaId}`} className="text-ink hover:underline">
            Venta {ret.ventaFolio}
          </Link>
        </p>
      </div>

      <Section title="Líneas devueltas">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="border-b border-line text-left text-ink-subtle">
              <tr>
                <th className="py-2 pr-3 font-medium">Producto</th>
                <th className="py-2 pr-3 font-medium">Cantidad</th>
                <th className="py-2 pr-3 font-medium">Base neta</th>
                <th className="py-2 pr-3 font-medium">IVA</th>
                <th className="py-2 pr-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ret.lines.map((l) => (
                <tr key={l.saleLineId}>
                  <td className="py-2 pr-3">
                    {l.productoNombre}
                    {l.varianteNombre ? (
                      <span className="text-ink-subtle"> · {l.varianteNombre}</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">{l.cantidad}</td>
                  <td className="py-2 pr-3">{money(l.baseNeta)}</td>
                  <td className="py-2 pr-3">{money(l.impuesto)}</td>
                  <td className="py-2 pr-3">{money(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Reembolso">
        <dl className="grid max-w-sm gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-subtle">Método</dt>
            <dd>{METODO_LABEL[ret.metodoReembolso] ?? ret.metodoReembolso}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 font-semibold">
            <dt>Total reembolsado</dt>
            <dd>{money(ret.total)}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Motivo">
        <p className="text-sm text-ink-muted">{ret.motivo}</p>
      </Section>
    </div>
  );
}
