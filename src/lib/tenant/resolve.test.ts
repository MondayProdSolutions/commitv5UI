import { describe, it, expect } from 'vitest';
import { resolveTenantSlug, RESERVED_SLUGS } from './resolve';

describe('resolveTenantSlug', () => {
  it('extrae el slug de un subdominio', () => {
    expect(resolveTenantSlug('negocio1.tuapp.com')).toBe('negocio1');
  });
  it('devuelve null en el dominio raíz (sin subdominio)', () => {
    expect(resolveTenantSlug('tuapp.com')).toBeNull();
  });
  it('devuelve null para localhost sin subdominio (Super Admin en dev)', () => {
    expect(resolveTenantSlug('localhost:3000')).toBeNull();
  });
  it('extrae el slug de un subdominio en localhost (tenant en dev)', () => {
    expect(resolveTenantSlug('negocio1.localhost:3000')).toBe('negocio1');
  });
  it('devuelve null si el subdominio es una palabra reservada', () => {
    expect(resolveTenantSlug('www.tuapp.com')).toBeNull();
    expect(resolveTenantSlug('admin.tuapp.com')).toBeNull();
  });
  it('RESERVED_SLUGS incluye las palabras clave del dominio propio', () => {
    expect(RESERVED_SLUGS.has('www')).toBe(true);
    expect(RESERVED_SLUGS.has('api')).toBe(true);
    expect(RESERVED_SLUGS.has('admin')).toBe(true);
    expect(RESERVED_SLUGS.has('app')).toBe(true);
  });
});
