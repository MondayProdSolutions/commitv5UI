import { describe, it, expect } from 'vitest';
import { KNOWN_ACTIONS, actionLabel } from './audit';

describe('acciones de auditoría de ventas', () => {
  const acciones = ['ventas.crear', 'ventas.cancelar', 'ventas.devolver'];
  it('están en KNOWN_ACTIONS', () => {
    for (const a of acciones) expect(KNOWN_ACTIONS).toContain(a);
  });
  it('tienen etiqueta en español', () => {
    for (const a of acciones) expect(actionLabel(a)).not.toBe(a);
  });
});
