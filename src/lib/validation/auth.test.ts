import { describe, it, expect } from 'vitest';
import { setupSchema, loginSchema, changePasswordSchema } from './auth';

describe('setupSchema', () => {
  it('acepta datos válidos', () => {
    const r = setupSchema.safeParse({
      nombre: 'Ana', email: 'ana@pos.com', password: 'caballoAzul42', confirm: 'caballoAzul42',
    });
    expect(r.success).toBe(true);
  });

  it('normaliza email (trim + lowercase) y nombre (trim)', () => {
    const r = setupSchema.safeParse({
      nombre: '  Ana  ', email: '  Ana@POS.com  ', password: 'caballoAzul42', confirm: 'caballoAzul42',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe('ana@pos.com');
      expect(r.data.nombre).toBe('Ana');
    }
  });

  it('rechaza si confirm no coincide', () => {
    const r = setupSchema.safeParse({
      nombre: 'Ana', email: 'ana@pos.com', password: 'caballoAzul42', confirm: 'otra',
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path.includes('confirm'))).toBe(true);
  });

  it('rechaza email inválido', () => {
    expect(
      setupSchema.safeParse({ nombre: 'Ana', email: 'no', password: 'x'.repeat(10), confirm: 'x'.repeat(10) }).success,
    ).toBe(false);
  });

  it('rechaza nombre de menos de 2 caracteres', () => {
    expect(
      setupSchema.safeParse({ nombre: 'A', email: 'ana@pos.com', password: 'x'.repeat(10), confirm: 'x'.repeat(10) }).success,
    ).toBe(false);
  });

  it('rechaza password de menos de 10 caracteres', () => {
    const r = setupSchema.safeParse({ nombre: 'Ana', email: 'ana@pos.com', password: 'corta', confirm: 'corta' });
    expect(r.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('requiere email y password', () => {
    expect(loginSchema.safeParse({ email: '', password: '' }).success).toBe(false);
  });

  it('acepta credenciales bien formadas y normaliza el email', () => {
    const r = loginSchema.safeParse({ email: '  User@Pos.com ', password: 'algo' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('user@pos.com');
  });
});

describe('changePasswordSchema', () => {
  it('acepta sin currentPassword (reset obligatorio)', () => {
    const r = changePasswordSchema.safeParse({ newPassword: 'x'.repeat(10), confirm: 'x'.repeat(10) });
    expect(r.success).toBe(true);
  });

  it('rechaza si confirm no coincide', () => {
    const r = changePasswordSchema.safeParse({
      currentPassword: 'vieja', newPassword: 'x'.repeat(10), confirm: 'distinta',
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path.includes('confirm'))).toBe(true);
  });

  it('rechaza newPassword de menos de 10 caracteres', () => {
    expect(changePasswordSchema.safeParse({ newPassword: 'corta', confirm: 'corta' }).success).toBe(false);
  });
});
