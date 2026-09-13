import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import type { CustomerInput, EditCustomerInput } from '@/lib/validation/customer';
import { bloqueFiscalCompleto, enmascararRfc, normalizarRfc } from '@/lib/customers/fiscal';
import { getRegimenLabel } from '@/lib/sat/regimenes-fiscales';
import { getUsoCfdiLabel } from '@/lib/sat/usos-cfdi';

export type CustomerDetail = {
  id: string;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  notas: string | null;
  rfc: string | null;
  razonSocial: string | null;
  regimenFiscalCode: string | null;
  usoCfdiCode: string | null;
  cpFiscal: string | null;
  correoFacturacion: string | null;
  esGenerico: boolean;
  archivado: boolean;
  createdAt: Date;
  facturable: boolean;
  regimenLabel: string | null;
  usoCfdiLabel: string | null;
};

function isP2002(e: unknown): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

// Reúne las pistas del P2002 sobre qué restricción única se violó. Prisma 7 con
// `@prisma/adapter-pg` no expone `meta.target`; la columna llega en
// `meta.driverAdapterError.cause.constraint.index` (p. ej. `Customer_correo_key`)
// y repetida en `originalMessage`. Se conserva `meta.target` como respaldo.
function p2002Hints(e: Prisma.PrismaClientKnownRequestError): string {
  const bits: string[] = [];
  const meta: unknown = e.meta;
  if (meta && typeof meta === 'object') {
    const target = (meta as { target?: unknown }).target;
    if (typeof target === 'string') bits.push(target);
    else if (Array.isArray(target)) bits.push(...target.map(String));

    const dae = (meta as { driverAdapterError?: unknown }).driverAdapterError;
    const cause =
      dae && typeof dae === 'object' ? (dae as { cause?: unknown }).cause : undefined;
    if (cause && typeof cause === 'object') {
      const c = cause as { originalMessage?: unknown; constraint?: unknown };
      if (typeof c.originalMessage === 'string') bits.push(c.originalMessage);
      const constraint = c.constraint;
      if (constraint && typeof constraint === 'object') {
        const idx = (constraint as { index?: unknown }).index;
        const flds = (constraint as { fields?: unknown }).fields;
        if (typeof idx === 'string') bits.push(idx);
        if (Array.isArray(flds)) bits.push(...flds.map(String));
      }
    }
  }
  return bits.join(' ');
}

// Traduce el P2002 al campo del input (`telefono` por defecto).
function uniqueField(e: Prisma.PrismaClientKnownRequestError): 'telefono' | 'correo' | 'rfc' {
  const hints = p2002Hints(e);
  if (hints.includes('correo')) return 'correo';
  if (hints.includes('rfc')) return 'rfc';
  return 'telefono';
}

const FISCAL_KEYS = [
  'rfc', 'razonSocial', 'regimenFiscalCode', 'usoCfdiCode', 'cpFiscal', 'correoFacturacion',
] as const;

type FiscalSource = {
  rfc?: string | null;
  razonSocial?: string | null;
  regimenFiscalCode?: string | null;
  usoCfdiCode?: string | null;
  cpFiscal?: string | null;
  correoFacturacion?: string | null;
};

// `rfc` SIEMPRE se enmascara: el metadata de auditoría nunca contiene el RFC completo.
function fiscalMetadata(src: FiscalSource): Record<string, unknown> {
  return {
    rfc: src.rfc ? enmascararRfc(src.rfc) : null,
    razonSocial: src.razonSocial ?? null,
    regimenFiscalCode: src.regimenFiscalCode ?? null,
    usoCfdiCode: src.usoCfdiCode ?? null,
    cpFiscal: src.cpFiscal ?? null,
    correoFacturacion: src.correoFacturacion ?? null,
  };
}

export async function createCustomer(
  actorId: string,
  input: CustomerInput,
  ip: string | null,
): Promise<{ id: string }> {
  const facturable = bloqueFiscalCompleto(input);

  return db.$transaction(async (tx) => {
    let customer;
    try {
      customer = await tx.customer.create({
        data: {
          nombre: input.nombre,
          telefono: input.telefono,
          correo: input.correo,
          direccion: input.direccion,
          notas: input.notas,
          rfc: input.rfc,
          razonSocial: input.razonSocial,
          regimenFiscalCode: input.regimenFiscalCode,
          usoCfdiCode: input.usoCfdiCode,
          cpFiscal: input.cpFiscal,
          correoFacturacion: input.correoFacturacion,
          createdById: actorId,
        },
      });
    } catch (e) {
      if (isP2002(e)) throw new ValidationError({ [uniqueField(e)]: 'Ya está en uso.' });
      throw e;
    }

    await logActivity(
      {
        actorId,
        accion: 'clientes.crear',
        entidad: 'Customer',
        entidadId: customer.id,
        metadata: { nombre: input.nombre, facturable },
        ip,
      },
      tx,
    );

    if (facturable) {
      await logActivity(
        {
          actorId,
          accion: 'clientes.datos_fiscales',
          entidad: 'Customer',
          entidadId: customer.id,
          metadata: { despues: fiscalMetadata(input) },
          ip,
        },
        tx,
      );
    }

    return { id: customer.id };
  });
}

export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  const c = await db.customer.findUnique({ where: { id } });
  if (!c) return null;
  return {
    id: c.id,
    nombre: c.nombre,
    telefono: c.telefono,
    correo: c.correo,
    direccion: c.direccion,
    notas: c.notas,
    rfc: c.rfc,
    razonSocial: c.razonSocial,
    regimenFiscalCode: c.regimenFiscalCode,
    usoCfdiCode: c.usoCfdiCode,
    cpFiscal: c.cpFiscal,
    correoFacturacion: c.correoFacturacion,
    esGenerico: c.esGenerico,
    archivado: c.archivado,
    createdAt: c.createdAt,
    facturable: bloqueFiscalCompleto(c),
    regimenLabel: c.regimenFiscalCode ? getRegimenLabel(c.regimenFiscalCode) : null,
    usoCfdiLabel: c.usoCfdiCode ? getUsoCfdiLabel(c.usoCfdiCode) : null,
  };
}

// Campos de contacto: los únicos que el cliente genérico ("Público en General")
// puede cambiar y los únicos que audita `clientes.editar`.
const CONTACTO_KEYS = ['nombre', 'telefono', 'correo', 'direccion', 'notas'] as const;

export async function updateCustomer(
  actorId: string,
  id: string,
  input: EditCustomerInput,
  ip: string | null,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const current = await tx.customer.findUnique({ where: { id } });
    if (!current) throw new ValidationError({ _form: 'El cliente no existe.' });

    const next = {
      nombre: input.nombre,
      telefono: input.telefono,
      correo: input.correo,
      direccion: input.direccion,
      notas: input.notas,
      rfc: input.rfc,
      razonSocial: input.razonSocial,
      regimenFiscalCode: input.regimenFiscalCode,
      usoCfdiCode: input.usoCfdiCode,
      cpFiscal: input.cpFiscal,
      correoFacturacion: input.correoFacturacion,
    };

    // Cambio fiscal real (para la auditoría de un cliente normal): cualquier
    // diferencia en los 6 campos, incluido pasar de facturable a no facturable.
    const fiscalCambio = FISCAL_KEYS.some((k) => current[k] !== next[k]);

    if (current.esGenerico) {
      // Intento de tocar identidad fija: cambiar `nombre` o dar de alta / alterar
      // cualquier dato fiscal (valor entrante no nulo distinto del actual).
      const nombreCambia = current.nombre !== next.nombre;
      const fiscalIntento = FISCAL_KEYS.some(
        (k) => next[k] !== null && next[k] !== current[k],
      );
      if (nombreCambia || fiscalIntento) {
        throw new ValidationError({
          _form:
            'El cliente Público en General tiene campos fijos; solo puedes editar contacto y notas.',
        });
      }
    }

    const data = current.esGenerico
      ? {
          telefono: next.telefono,
          correo: next.correo,
          direccion: next.direccion,
          notas: next.notas,
        }
      : next;

    try {
      await tx.customer.update({ where: { id }, data });
    } catch (e) {
      if (isP2002(e)) throw new ValidationError({ [uniqueField(e)]: 'Ya está en uso.' });
      throw e;
    }

    // Auditoría de contacto: solo los campos de contacto que realmente cambiaron.
    const antesC: Record<string, string | null> = {};
    const despuesC: Record<string, string | null> = {};
    for (const k of CONTACTO_KEYS) {
      if (current[k] !== next[k]) {
        antesC[k] = current[k];
        despuesC[k] = next[k];
      }
    }
    if (Object.keys(despuesC).length > 0) {
      await logActivity(
        {
          actorId,
          accion: 'clientes.editar',
          entidad: 'Customer',
          entidadId: id,
          metadata: { antes: antesC, despues: despuesC },
          ip,
        },
        tx,
      );
    }

    // Auditoría fiscal (RFC enmascarado en ambos lados). El cliente genérico
    // nunca escribe datos fiscales, así que no genera esta fila.
    if (!current.esGenerico && fiscalCambio) {
      await logActivity(
        {
          actorId,
          accion: 'clientes.datos_fiscales',
          entidad: 'Customer',
          entidadId: id,
          metadata: { antes: fiscalMetadata(current), despues: fiscalMetadata(next) },
          ip,
        },
        tx,
      );
    }
  });
}

async function setArchived(
  actorId: string,
  id: string,
  archivado: boolean,
  accion: 'clientes.archivar' | 'clientes.restaurar',
  ip: string | null,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const current = await tx.customer.findUnique({ where: { id } });
    if (!current) throw new ValidationError({ _form: 'El cliente no existe.' });
    if (archivado && current.esGenerico) {
      throw new ValidationError({
        _form: 'No se puede archivar el cliente Público en General.',
      });
    }
    if (current.archivado === archivado) return; // idempotente: sin mutación ni auditoría
    await tx.customer.update({ where: { id }, data: { archivado } });
    await logActivity(
      { actorId, accion, entidad: 'Customer', entidadId: id, metadata: { customerId: id }, ip },
      tx,
    );
  });
}

export function archiveCustomer(actorId: string, id: string, ip: string | null): Promise<void> {
  return setArchived(actorId, id, true, 'clientes.archivar', ip);
}

export function restoreCustomer(actorId: string, id: string, ip: string | null): Promise<void> {
  return setArchived(actorId, id, false, 'clientes.restaurar', ip);
}

export type CustomerRow = {
  id: string;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  rfc: string | null;
  facturable: boolean;
  esGenerico: boolean;
  estado: 'activo' | 'archivado';
};

export type ListCustomersFilter = {
  q?: string;
  estado?: 'activos' | 'archivados' | 'todos';
  soloFacturables?: boolean;
  page: number;
  pageSize: number;
};

export async function listCustomers(
  filtro: ListCustomersFilter,
): Promise<{ rows: CustomerRow[]; total: number }> {
  const { q, estado = 'activos', soloFacturables, page, pageSize } = filtro;

  const where: Prisma.CustomerWhereInput = {};
  if (estado === 'activos') where.archivado = false;
  else if (estado === 'archivados') where.archivado = true;

  if (soloFacturables) {
    where.rfc = { not: null };
    where.razonSocial = { not: null };
    where.regimenFiscalCode = { not: null };
    where.usoCfdiCode = { not: null };
    where.cpFiscal = { not: null };
  }

  if (q !== undefined && q.trim() !== '') {
    const term = q.trim();
    where.OR = [
      { nombre: { contains: term, mode: 'insensitive' } },
      { telefono: { contains: term } },
      { correo: { contains: term, mode: 'insensitive' } },
      { rfc: { startsWith: normalizarRfc(term) } },
    ];
  }

  const [total, rows] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      orderBy: [{ esGenerico: 'desc' }, { nombre: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    rows: rows.map(
      (c): CustomerRow => ({
        id: c.id,
        nombre: c.nombre,
        telefono: c.telefono,
        correo: c.correo,
        rfc: c.rfc,
        facturable: bloqueFiscalCompleto(c),
        esGenerico: c.esGenerico,
        estado: c.archivado ? 'archivado' : 'activo',
      }),
    ),
    total,
  };
}
