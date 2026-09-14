import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { ForbiddenError } from '@/lib/errors';
import { parseDateParam } from '@/lib/activity/query';
import { db, withTenant } from '@/lib/db';
import { listCashSessions, type CashSessionRow } from '@/lib/cash/sessions';
import { fmtFechaMX } from '@/app/(app)/ventas/types';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const runtime = 'nodejs';

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// CSV: importe sin símbolo de moneda (a diferencia de `money` de `../../../ventas/types`).
const money = (n: number) => n.toFixed(2);

const estadoLabel = (e: CashSessionRow['estado']) => (e === 'ABIERTA' ? 'Abierta' : 'Cerrada');

type Extra = {
  cerradaPor: string;
  totalEfectivoVentas: number | null;
  totalTarjeta: number | null;
  totalTransferencia: number | null;
  totalReembolsosEfectivo: number | null;
  totalRetiros: number | null;
  totalIngresos: number | null;
  esperadoEfectivo: number | null;
  nVentas: number | null;
};

const HEADER =
  'Folio,Estado,Apertura,Cierre,Abrió,Cerró,Fondo,Efectivo ventas,Tarjeta,Transferencia,Reembolsos efectivo,Retiros,Ingresos,Esperado,Contado,Diferencia,Nº ventas';

function toCsv(rows: CashSessionRow[], extra: Map<string, Extra>): string {
  const lines = rows.map((r) => {
    const x = extra.get(r.id);
    return [
      r.folio,
      estadoLabel(r.estado),
      fmtFechaMX(r.abiertaEn),
      r.cerradaEn ? fmtFechaMX(r.cerradaEn) : '',
      r.abiertaPor,
      x?.cerradaPor ?? '',
      money(r.fondoApertura),
      x?.totalEfectivoVentas != null ? money(x.totalEfectivoVentas) : '',
      x?.totalTarjeta != null ? money(x.totalTarjeta) : '',
      x?.totalTransferencia != null ? money(x.totalTransferencia) : '',
      x?.totalReembolsosEfectivo != null ? money(x.totalReembolsosEfectivo) : '',
      x?.totalRetiros != null ? money(x.totalRetiros) : '',
      x?.totalIngresos != null ? money(x.totalIngresos) : '',
      x?.esperadoEfectivo != null ? money(x.esperadoEfectivo) : '',
      r.efectivoContado != null ? money(r.efectivoContado) : '',
      r.diferencia != null ? money(r.diferencia) : '',
      x?.nVentas != null ? String(x.nVentas) : '',
    ]
      .map(esc)
      .join(',');
  });
  return [HEADER, ...lines].join('\n') + '\n';
}

export async function GET(req: Request) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    try {
      await requirePermission('caja.gestionar');
    } catch (e) {
      if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
      throw e;
    }

    const url = new URL(req.url);
    const rawEstado = url.searchParams.get('estado') ?? undefined;
    const estado = rawEstado === 'ABIERTA' || rawEstado === 'CERRADA' ? rawEstado : undefined;

    const { rows } = await listCashSessions({
      estado,
      desde: parseDateParam(url.searchParams.get('desde')),
      hasta: parseDateParam(url.searchParams.get('hasta')),
      page: 1,
      pageSize: 5000,
    });

    // `CashSessionRow` no trae los `total*`/`esperadoEfectivo`/`cerradaPor`: se
    // recuperan en una sola consulta y se mapean por id.
    const detalles = await db.cashSession.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: {
        id: true,
        totalEfectivoVentas: true,
        totalTarjeta: true,
        totalTransferencia: true,
        totalReembolsosEfectivo: true,
        totalRetiros: true,
        totalIngresos: true,
        esperadoEfectivo: true,
        nVentas: true,
        cerradaPor: { select: { nombre: true } },
      },
    });

    const extra = new Map(
      detalles.map((d) => [
        d.id,
        {
          cerradaPor: d.cerradaPor?.nombre ?? '',
          totalEfectivoVentas: d.totalEfectivoVentas != null ? Number(d.totalEfectivoVentas) : null,
          totalTarjeta: d.totalTarjeta != null ? Number(d.totalTarjeta) : null,
          totalTransferencia: d.totalTransferencia != null ? Number(d.totalTransferencia) : null,
          totalReembolsosEfectivo:
            d.totalReembolsosEfectivo != null ? Number(d.totalReembolsosEfectivo) : null,
          totalRetiros: d.totalRetiros != null ? Number(d.totalRetiros) : null,
          totalIngresos: d.totalIngresos != null ? Number(d.totalIngresos) : null,
          esperadoEfectivo: d.esperadoEfectivo != null ? Number(d.esperadoEfectivo) : null,
          nVentas: d.nVentas,
        } satisfies Extra,
      ]),
    );

    const csv = '﻿' + toCsv(rows, extra);
    const fecha = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="cortes-caja-${fecha}.csv"`,
      },
    });
  });
}
