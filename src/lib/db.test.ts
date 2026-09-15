import { describe, it, expect } from 'vitest';
import { getCurrentTenantId } from './db';

describe('getCurrentTenantId', () => {
  it('lanza si no hay contexto de tenant activo', () => {
    expect(() => getCurrentTenantId()).toThrow('No hay contexto de tenant activo');
  });
});
