import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { searchCustomers } from './search';

async function mk(data: Prisma.CustomerCreateInput & { nombre: string }) {
  return db.customer.create({ data });
}

beforeEach(async () => {
  await db.customer.deleteMany({ where: { esGenerico: false } });
});
afterAll(async () => {
  await db.customer.deleteMany({ where: { esGenerico: false } });
});

describe('searchCustomers', () => {
  it('q vacío devuelve []', async () => {
    expect(await searchCustomers('  ')).toEqual([]);
  });

  it('encuentra por nombre parcial', async () => {
    await mk({ nombre: 'Ferretería Los Pinos' });
    const hits = await searchCustomers('pinos');
    expect(hits.map((h) => h.nombre)).toContain('Ferretería Los Pinos');
  });

  it('encuentra por teléfono', async () => {
    await mk({ nombre: 'Juan', telefono: '5544332211' });
    const hits = await searchCustomers('554433');
    expect(hits.some((h) => h.telefono === '5544332211')).toBe(true);
  });

  it('encuentra por correo (insensitive)', async () => {
    await mk({ nombre: 'Ana', correo: 'ana@acme.mx' });
    const hits = await searchCustomers('ANA@ACME');
    expect(hits.some((h) => h.correo === 'ana@acme.mx')).toBe(true);
  });

  it('encuentra por prefijo de RFC normalizando el término', async () => {
    await mk({ nombre: 'Moral SA', rfc: 'ABC010101XYZ' });
    const hits = await searchCustomers('abc0101');
    expect(hits.some((h) => h.rfc === 'ABC010101XYZ')).toBe(true);
  });

  it('el cliente genérico aparece primero', async () => {
    await mk({ nombre: 'aaa primero alfabético' });
    const hits = await searchCustomers('a');
    expect(hits[0]?.esGenerico).toBe(true);
  });

  it('excluye archivados salvo incluirArchivados', async () => {
    await mk({ nombre: 'Cliente Viejo', archivado: true });
    expect((await searchCustomers('viejo')).length).toBe(0);
    expect((await searchCustomers('viejo', { incluirArchivados: true })).length).toBe(1);
  });

  it('deriva facturable', async () => {
    await mk({
      nombre: 'Facturable SA',
      rfc: 'ABC010101XYZ',
      razonSocial: 'Facturable SA',
      regimenFiscalCode: '601',
      usoCfdiCode: 'G03',
      cpFiscal: '06000',
    });
    const hit = (await searchCustomers('facturable')).find((h) => h.nombre === 'Facturable SA');
    expect(hit?.facturable).toBe(true);
  });
});
