import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { ValidationError } from '@/lib/errors';
import {
  createCustomer,
  getCustomer,
  updateCustomer,
  archiveCustomer,
  restoreCustomer,
  listCustomers,
} from './customers';
import type { CustomerInput, EditCustomerInput } from '@/lib/validation/customer';

const ACTOR_EMAIL = 'task7-customers@pos.com';
let ACTOR: string;

function input(over: Partial<CustomerInput> = {}): CustomerInput {
  return {
    nombre: 'Cliente Prueba',
    telefono: null, correo: null, direccion: null, notas: null,
    rfc: null, razonSocial: null, regimenFiscalCode: null,
    usoCfdiCode: null, cpFiscal: null, correoFacturacion: null,
    ...over,
  } as CustomerInput;
}

function editInput(id: string, over: Partial<EditCustomerInput> = {}): EditCustomerInput {
  return { id, ...input(over) } as EditCustomerInput;
}

const fiscalFull: Partial<CustomerInput> = {
  rfc: 'ABC010101XYZ',
  razonSocial: 'ACME SA',
  regimenFiscalCode: '601',
  usoCfdiCode: 'G03',
  cpFiscal: '06000',
};

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.customer.deleteMany({ where: { esGenerico: false } });
  await db.user.deleteMany({ where: { email: ACTOR_EMAIL } });
  const admin = await db.role.findFirstOrThrow({ where: { nombre: 'Administrador' } });
  ACTOR = (
    await db.user.create({
      data: {
        nombre: 'Task7 Actor',
        email: ACTOR_EMAIL,
        passwordHash: await hashPassword('xxxxxxxxxx'),
        roleId: admin.id,
      },
    })
  ).id;
});
afterAll(async () => {
  await db.activityLog.deleteMany();
  await db.customer.deleteMany({ where: { esGenerico: false } });
  await db.user.deleteMany({ where: { email: ACTOR_EMAIL } });
  await db.customer.updateMany({
    where: { esGenerico: true },
    data: { notas: null, direccion: null, correo: null, telefono: null },
  });
});

describe('createCustomer', () => {
  it('crea sin datos fiscales: facturable = false, sin auditoría fiscal', async () => {
    const { id } = await createCustomer(ACTOR, input(), null);
    const detail = await getCustomer(id);
    expect(detail?.facturable).toBe(false);

    const logs = await db.activityLog.findMany({ where: { entidadId: id } });
    const acciones = logs.map((l) => l.accion);
    expect(acciones).toContain('clientes.crear');
    expect(acciones).not.toContain('clientes.datos_fiscales');
    const crear = logs.find((l) => l.accion === 'clientes.crear');
    expect((crear?.metadata as { facturable: boolean }).facturable).toBe(false);
  });

  it('crea con bloque fiscal completo: facturable = true, auditoría fiscal con RFC enmascarado', async () => {
    const { id } = await createCustomer(ACTOR, input(fiscalFull), null);
    const detail = await getCustomer(id);
    expect(detail?.facturable).toBe(true);
    expect(detail?.regimenLabel).toContain('Personas Morales');

    const logs = await db.activityLog.findMany({ where: { entidadId: id } });
    const fiscal = logs.find((l) => l.accion === 'clientes.datos_fiscales');
    expect(fiscal).toBeDefined();
    const meta = JSON.stringify(fiscal?.metadata);
    expect(meta).not.toContain('ABC010101XYZ');
    expect(meta).toContain('ABC******XYZ');

    const crearLog = logs.find((l) => l.accion === 'clientes.crear');
    expect(JSON.stringify(crearLog?.metadata)).not.toContain('ABC010101XYZ');
  });

  it('teléfono duplicado: ValidationError en telefono, nada creado', async () => {
    await createCustomer(ACTOR, input({ telefono: '5544332211' }), null);
    await expect(
      createCustomer(ACTOR, input({ nombre: 'Otro', telefono: '5544332211' }), null),
    ).rejects.toMatchObject({ fields: { telefono: expect.any(String) } });
    expect(await db.customer.count({ where: { telefono: '5544332211' } })).toBe(1);
  });

  it('correo duplicado: ValidationError en correo', async () => {
    await createCustomer(ACTOR, input({ correo: 'dup@acme.mx' }), null);
    await expect(
      createCustomer(ACTOR, input({ nombre: 'X', correo: 'dup@acme.mx' }), null),
    ).rejects.toMatchObject({ fields: { correo: expect.any(String) } });
  });

  it('RFC duplicado: ValidationError en rfc', async () => {
    await createCustomer(ACTOR, input(fiscalFull), null);
    await expect(
      createCustomer(ACTOR, input({ ...fiscalFull, nombre: 'Otra' }), null),
    ).rejects.toMatchObject({ fields: { rfc: expect.any(String) } });
  });

  it('rechaza ValidationError como tipo en duplicados', async () => {
    await createCustomer(ACTOR, input({ telefono: '5500000000' }), null);
    await expect(
      createCustomer(ACTOR, input({ nombre: 'Dup', telefono: '5500000000' }), null),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('getCustomer', () => {
  it('devuelve null si no existe', async () => {
    expect(await getCustomer('no-existe')).toBeNull();
  });
});

describe('updateCustomer', () => {
  it('cambia solo teléfono: audita clientes.editar con antes/despues, sin auditoría fiscal', async () => {
    const { id } = await createCustomer(ACTOR, input({ telefono: '5500000000' }), null);
    await db.activityLog.deleteMany();
    await updateCustomer(ACTOR, id, editInput(id, { telefono: '5511111111' }), null);

    const logs = await db.activityLog.findMany({ where: { entidadId: id } });
    const editar = logs.find((l) => l.accion === 'clientes.editar');
    expect(editar).toBeDefined();
    const meta = editar!.metadata as { antes: Record<string, unknown>; despues: Record<string, unknown> };
    expect(meta.antes.telefono).toBe('5500000000');
    expect(meta.despues.telefono).toBe('5511111111');
    expect(logs.some((l) => l.accion === 'clientes.datos_fiscales')).toBe(false);
  });

  it('completar el bloque fiscal marca facturable y audita datos_fiscales con RFC enmascarado', async () => {
    const { id } = await createCustomer(ACTOR, input(), null);
    await db.activityLog.deleteMany();
    await updateCustomer(ACTOR, id, editInput(id, {
      rfc: 'ABC010101XYZ', razonSocial: 'ACME', regimenFiscalCode: '601',
      usoCfdiCode: 'G03', cpFiscal: '06000',
    }), null);

    expect((await getCustomer(id))?.facturable).toBe(true);
    const fiscal = await db.activityLog.findFirst({ where: { entidadId: id, accion: 'clientes.datos_fiscales' } });
    const meta = JSON.stringify(fiscal?.metadata);
    expect(meta).toContain('ABC******XYZ');
    expect(meta).not.toContain('ABC010101XYZ');
  });

  it('cliente genérico: cambiar notas OK', async () => {
    const generico = await db.customer.findFirstOrThrow({ where: { esGenerico: true } });
    await updateCustomer(ACTOR, generico.id, editInput(generico.id, {
      nombre: 'Público en General', notas: 'nota nueva',
    }), null);
    const after = await db.customer.findUniqueOrThrow({ where: { id: generico.id } });
    expect(after.notas).toBe('nota nueva');
    // El whitelist de escritura protege identidad y datos fiscales en el camino OK.
    expect(after.rfc).toBe('XAXX010101000');
    expect(after.nombre).toBe('Público en General');
  });

  it('cliente genérico: cambiar nombre o RFC lanza ValidationError y no muta', async () => {
    const generico = await db.customer.findFirstOrThrow({ where: { esGenerico: true } });
    await expect(
      updateCustomer(ACTOR, generico.id, editInput(generico.id, { nombre: 'Otro Nombre' }), null),
    ).rejects.toBeInstanceOf(ValidationError);
    const after = await db.customer.findUniqueOrThrow({ where: { id: generico.id } });
    expect(after.nombre).toBe('Público en General');
    expect(after.rfc).toBe('XAXX010101000');
  });

  it('cliente genérico: cambiar el RFC (con nombre correcto) lanza ValidationError y no muta', async () => {
    const generico = await db.customer.findFirstOrThrow({ where: { esGenerico: true } });
    await expect(
      updateCustomer(ACTOR, generico.id, editInput(generico.id, {
        nombre: 'Público en General',
        rfc: 'ABC010101XYZ', razonSocial: 'X', regimenFiscalCode: '601',
        usoCfdiCode: 'G03', cpFiscal: '06000',
      }), null),
    ).rejects.toBeInstanceOf(ValidationError);
    const after = await db.customer.findUniqueOrThrow({ where: { id: generico.id } });
    expect(after.rfc).toBe('XAXX010101000');
    expect(after.razonSocial).toBeNull();
  });
});

describe('archiveCustomer / restoreCustomer', () => {
  it('archiva y restaura un cliente normal con auditoría', async () => {
    const { id } = await createCustomer(ACTOR, input(), null);
    await archiveCustomer(ACTOR, id, null);
    expect((await getCustomer(id))?.archivado).toBe(true);
    await restoreCustomer(ACTOR, id, null);
    expect((await getCustomer(id))?.archivado).toBe(false);

    const acciones = (await db.activityLog.findMany({ where: { entidadId: id } })).map((l) => l.accion);
    expect(acciones).toContain('clientes.archivar');
    expect(acciones).toContain('clientes.restaurar');
  });

  it('no archiva el cliente genérico', async () => {
    const generico = await db.customer.findFirstOrThrow({ where: { esGenerico: true } });
    await expect(archiveCustomer(ACTOR, generico.id, null)).rejects.toBeInstanceOf(ValidationError);
    expect((await db.customer.findUniqueOrThrow({ where: { id: generico.id } })).archivado).toBe(false);
  });

  it('archivar es idempotente', async () => {
    const { id } = await createCustomer(ACTOR, input(), null);
    await archiveCustomer(ACTOR, id, null);
    await expect(archiveCustomer(ACTOR, id, null)).resolves.not.toThrow();
    expect((await getCustomer(id))?.archivado).toBe(true);
  });
});

describe('listCustomers', () => {
  it('filtro estado: activos por defecto, archivados y todos', async () => {
    const { id: activoId } = await createCustomer(ACTOR, input({ nombre: 'Activo Uno' }), null);
    const { id: archId } = await createCustomer(ACTOR, input({ nombre: 'Archivado Uno' }), null);
    await archiveCustomer(ACTOR, archId, null);

    const activos = await listCustomers({ estado: 'activos', page: 1, pageSize: 50 });
    expect(activos.rows.some((r) => r.id === activoId)).toBe(true);
    expect(activos.rows.some((r) => r.id === archId)).toBe(false);

    const archivados = await listCustomers({ estado: 'archivados', page: 1, pageSize: 50 });
    expect(archivados.rows.every((r) => r.estado === 'archivado')).toBe(true);
    expect(archivados.rows.some((r) => r.id === archId)).toBe(true);

    const todos = await listCustomers({ estado: 'todos', page: 1, pageSize: 50 });
    expect(todos.rows.some((r) => r.id === activoId)).toBe(true);
    expect(todos.rows.some((r) => r.id === archId)).toBe(true);
  });

  it('soloFacturables devuelve únicamente clientes con bloque fiscal completo', async () => {
    await createCustomer(ACTOR, input({ nombre: 'Sin Fiscal' }), null);
    const { id: facId } = await createCustomer(ACTOR, input({
      nombre: 'Con Fiscal', rfc: 'ABC010101XYZ', razonSocial: 'ACME',
      regimenFiscalCode: '601', usoCfdiCode: 'G03', cpFiscal: '06000',
    }), null);
    const { rows } = await listCustomers({ soloFacturables: true, estado: 'todos', page: 1, pageSize: 50 });
    expect(rows.every((r) => r.facturable)).toBe(true);
    expect(rows.some((r) => r.id === facId)).toBe(true);
  });

  it('q filtra por nombre', async () => {
    await createCustomer(ACTOR, input({ nombre: 'Distribuidora Zeta' }), null);
    const { rows } = await listCustomers({ q: 'zeta', estado: 'todos', page: 1, pageSize: 50 });
    expect(rows.some((r) => r.nombre === 'Distribuidora Zeta')).toBe(true);
  });

  it('q sin coincidencias devuelve vacío', async () => {
    const res = await listCustomers({ q: 'no-existe-xyz-999', page: 1, pageSize: 50 });
    expect(res).toEqual({ rows: [], total: 0 });
  });

  it('el cliente genérico aparece primero', async () => {
    await createCustomer(ACTOR, input({ nombre: 'aaa alfabéticamente primero' }), null);
    const { rows } = await listCustomers({ estado: 'todos', page: 1, pageSize: 50 });
    expect(rows[0]?.esGenerico).toBe(true);
  });

  it('q compone con estado: archivados no se pierde por truncado', async () => {
    const { id: activoId } = await createCustomer(
      ACTOR,
      input({ nombre: 'Comercial Buscable Activo' }),
      null,
    );
    const { id: archId } = await createCustomer(
      ACTOR,
      input({ nombre: 'Comercial Buscable Archivado' }),
      null,
    );
    await archiveCustomer(ACTOR, archId, null);

    const { rows } = await listCustomers({
      q: 'Comercial Buscable',
      estado: 'archivados',
      page: 1,
      pageSize: 50,
    });
    expect(rows.some((r) => r.id === archId)).toBe(true);
    expect(rows.some((r) => r.id === activoId)).toBe(false);
  });

  it('q compone con soloFacturables', async () => {
    await createCustomer(ACTOR, input({ nombre: 'Mayorista Compone Sin Fiscal' }), null);
    const { id: facId } = await createCustomer(
      ACTOR,
      input({
        nombre: 'Mayorista Compone Con Fiscal',
        rfc: 'ABC010101XYZ',
        razonSocial: 'ACME',
        regimenFiscalCode: '601',
        usoCfdiCode: 'G03',
        cpFiscal: '06000',
      }),
      null,
    );
    const { rows } = await listCustomers({
      q: 'Mayorista Compone',
      soloFacturables: true,
      estado: 'todos',
      page: 1,
      pageSize: 50,
    });
    expect(rows.map((r) => r.id)).toEqual([facId]);
  });

  it('q por prefijo de RFC en minúsculas coincide (normalizarRfc aplicado)', async () => {
    const { id } = await createCustomer(
      ACTOR,
      input({
        nombre: 'Cliente Con RFC Buscable',
        rfc: 'ABC010101XYZ',
        razonSocial: 'ACME',
        regimenFiscalCode: '601',
        usoCfdiCode: 'G03',
        cpFiscal: '06000',
      }),
      null,
    );
    const { rows } = await listCustomers({ q: 'abc0101', estado: 'todos', page: 1, pageSize: 50 });
    expect(rows.some((r) => r.id === id)).toBe(true);
  });
});
