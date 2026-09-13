import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { nextFolio } from './folio';

// Este itest fija el estado de FolioCounter para poder aseverar el número exacto.
beforeEach(async () => {
  await db.folioCounter.update({ where: { serie: 'V' }, data: { valor: 0 } });
  await db.folioCounter.update({ where: { serie: 'C' }, data: { valor: 0 } });
});

afterAll(async () => {
  await db.folioCounter.update({ where: { serie: 'V' }, data: { valor: 0 } });
  await db.folioCounter.update({ where: { serie: 'C' }, data: { valor: 0 } });
});

describe('nextFolio', () => {
  it('incrementa y formatea a 6 dígitos', async () => {
    const a = await db.$transaction((tx) => nextFolio(tx, 'V'));
    const b = await db.$transaction((tx) => nextFolio(tx, 'V'));
    expect(a).toBe('V-000001');
    expect(b).toBe('V-000002');
  });

  it('un rollback de la transacción revierte el incremento (sin huecos)', async () => {
    await db.$transaction((tx) => nextFolio(tx, 'V')); // V-000001
    await expect(
      db.$transaction(async (tx) => {
        await nextFolio(tx, 'V'); // consumiría V-000002
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    const next = await db.$transaction((tx) => nextFolio(tx, 'V'));
    expect(next).toBe('V-000002'); // no se saltó a 000003
  });

  it('serie C incrementa y formatea', async () => {
    const a = await db.$transaction((tx) => nextFolio(tx, 'C'));
    const b = await db.$transaction((tx) => nextFolio(tx, 'C'));
    expect(a).toBe('C-000001');
    expect(b).toBe('C-000002');
  });
});
