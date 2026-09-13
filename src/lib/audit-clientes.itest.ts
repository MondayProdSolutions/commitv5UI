import { describe, it, expect } from 'vitest';
import { KNOWN_ACTIONS, actionLabel } from './audit';

describe('acciones de auditoría de clientes', () => {
  const acciones = [
    'clientes.crear', 'clientes.editar', 'clientes.archivar',
    'clientes.restaurar', 'clientes.datos_fiscales',
  ];

  it('están en KNOWN_ACTIONS', () => {
    for (const a of acciones) expect(KNOWN_ACTIONS).toContain(a);
  });

  it('tienen etiqueta en español (no el código crudo)', () => {
    for (const a of acciones) expect(actionLabel(a)).not.toBe(a);
  });
});
