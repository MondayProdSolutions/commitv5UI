import { describe, it, expect } from 'vitest';
import {
  hashPassword, verifyPassword, generateTempPassword, passwordPolicyError,
} from './password';

describe('hashPassword / verifyPassword', () => {
  it('el hash no es el texto plano y tiene formato argon2id', async () => {
    const hash = await hashPassword('contraseñaSegura123');
    expect(hash).not.toContain('contraseñaSegura123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifica la contraseña correcta', async () => {
    const hash = await hashPassword('contraseñaSegura123');
    expect(await verifyPassword(hash, 'contraseñaSegura123')).toBe(true);
  });

  it('rechaza la contraseña incorrecta', async () => {
    const hash = await hashPassword('contraseñaSegura123');
    expect(await verifyPassword(hash, 'otraCosa')).toBe(false);
  });

  it('dos hashes de la misma contraseña son distintos (salt aleatorio)', async () => {
    expect(await hashPassword('abcabcabc1')).not.toBe(await hashPassword('abcabcabc1'));
  });

  it('verifyPassword devuelve false ante un hash corrupto en vez de lanzar', async () => {
    expect(await verifyPassword('no-es-un-hash', 'x')).toBe(false);
  });
});

describe('generateTempPassword', () => {
  it('genera 12 caracteres del alfabeto sin ambiguos', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateTempPassword();
      expect(p).toHaveLength(12);
      expect(p).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]+$/);
    }
  });

  it('no repite en 100 generaciones', () => {
    const s = new Set(Array.from({ length: 100 }, () => generateTempPassword()));
    expect(s.size).toBe(100);
  });
});

describe('passwordPolicyError', () => {
  it('acepta una contraseña válida', () => {
    expect(passwordPolicyError('caballoAzul42', 'user@pos.com')).toBeNull();
  });
  it('rechaza menos de 10 caracteres', () => {
    expect(passwordPolicyError('corta1', 'user@pos.com')).toMatch(/10 caracteres/);
  });
  it('rechaza que sea igual al email', () => {
    expect(passwordPolicyError('User@Pos.com', 'user@pos.com')).toMatch(/correo/i);
  });
  it('rechaza una contraseña común', () => {
    expect(passwordPolicyError('password123', 'user@pos.com')).toMatch(/común/i);
  });
});
