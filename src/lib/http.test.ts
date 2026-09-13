import { describe, it, expect } from 'vitest';
import { getClientIp } from './http';

describe('getClientIp', () => {
  it('toma el primer valor de x-forwarded-for', () => {
    const h = new Headers({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' });
    expect(getClientIp(h)).toBe('9.9.9.9');
  });
  it('cae a x-real-ip', () => {
    expect(getClientIp(new Headers({ 'x-real-ip': '8.8.8.8' }))).toBe('8.8.8.8');
  });
  it('null si no hay cabeceras', () => {
    expect(getClientIp(new Headers())).toBeNull();
  });
});
