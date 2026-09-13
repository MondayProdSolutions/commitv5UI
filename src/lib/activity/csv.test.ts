import { describe, it, expect } from 'vitest';
import { toCsv } from './csv';
import type { ActivityRow } from '@/lib/activity/query';

const row = (over: Partial<ActivityRow>): ActivityRow => ({
  id: '1',
  accion: 'usuarios.crear',
  accionLabel: 'Alta de usuario',
  actorNombre: 'Ana',
  entidad: 'User',
  entidadId: 'u1',
  metadata: { email: 'x@pos.com' },
  ip: '1.2.3.4',
  createdAt: new Date('2026-09-02T10:00:00Z'),
  ...over,
});

describe('toCsv', () => {
  it('incluye la cabecera y una fila', () => {
    const csv = toCsv([row({})]);
    const [header, line] = csv.trim().split('\n');
    expect(header).toBe('Fecha,Acción,Usuario,Entidad,ID entidad,IP,Detalle');
    expect(line).toContain('Alta de usuario');
    expect(line).toContain('Ana');
  });

  it('escapa comas y comillas', () => {
    const csv = toCsv([row({ actorNombre: 'Pérez, Ana "La Jefa"' })]);
    expect(csv).toContain('"Pérez, Ana ""La Jefa"""');
  });

  it('serializa metadata como JSON en Detalle', () => {
    const csv = toCsv([row({ metadata: { a: 1 } })]);
    expect(csv).toContain('{""a"":1}');
  });

  it('usa "Sistema" cuando no hay actor', () => {
    expect(toCsv([row({ actorNombre: null })])).toContain('Sistema');
  });
});
