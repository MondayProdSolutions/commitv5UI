import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { ForbiddenError } from '@/lib/errors';
import { listCustomers, type CustomerRow } from '@/lib/customers/customers';
import { getRegimenLabel } from '@/lib/sat/regimenes-fiscales';
import { getUsoCfdiLabel } from '@/lib/sat/usos-cfdi';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function estadoFrom(v: string | null): 'activos' | 'archivados' | 'todos' {
  return v === 'archivados' || v === 'todos' ? v : 'activos';
}

export async function GET(req: Request) {
  try {
    await requirePermission('clientes.ver');
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() || undefined;
  const estado = estadoFrom(url.searchParams.get('estado'));
  const soloFacturables = url.searchParams.get('soloFacturables') === '1';

  const { rows } = await listCustomers({ q, estado, soloFacturables, page: 1, pageSize: 5000 });

  // `CustomerRow` no trae los campos fiscales de detalle: se releen para los ids
  // devueltos en UNA sola consulta y se mapean por id.
  const ids = rows.map((r) => r.id);
  const full = ids.length
    ? await db.customer.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          razonSocial: true,
          regimenFiscalCode: true,
          usoCfdiCode: true,
          cpFiscal: true,
        },
      })
    : [];
  const byId = new Map(full.map((c) => [c.id, c] as const));

  const header =
    'Nombre,Teléfono,Correo,RFC,Razón social,Régimen,Uso CFDI,CP fiscal,Facturable,Estado';
  const lines = rows.map((r: CustomerRow) => {
    const extra = byId.get(r.id);
    return [
      r.nombre,
      r.telefono ?? '',
      r.correo ?? '',
      r.rfc ?? '', // Export administrativo bajo permiso: RFC COMPLETO, sin enmascarar.
      extra?.razonSocial ?? '',
      extra?.regimenFiscalCode ? getRegimenLabel(extra.regimenFiscalCode) : '',
      extra?.usoCfdiCode ? getUsoCfdiLabel(extra.usoCfdiCode) : '',
      extra?.cpFiscal ?? '',
      r.facturable ? 'Sí' : 'No',
      r.estado === 'archivado' ? 'Archivado' : 'Activo',
    ]
      .map((v) => esc(String(v)))
      .join(',');
  });

  const csv = '﻿' + [header, ...lines].join('\n') + '\n';
  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="clientes-${fecha}.csv"`,
    },
  });
}
