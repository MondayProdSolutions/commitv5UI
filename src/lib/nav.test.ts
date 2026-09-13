import { describe, it, expect } from 'vitest';
import { visibleNav, NAV_ITEMS } from './nav';
import type { AuthUser } from './auth/rbac';

const user = (perms: string[]): AuthUser => ({
  id: 'u', nombre: 'U', email: 'u@pos.com', roleId: 'r', roleName: 'R',
  permissions: new Set(perms), mustChangePassword: false,
});

describe('visibleNav', () => {
  it('siempre incluye los ítems sin permiso (Dashboard, Perfil)', () => {
    const hrefs = visibleNav(user([])).map((i) => i.href);
    expect(hrefs).toContain('/dashboard');
    expect(hrefs).toContain('/perfil');
  });
  it('oculta Usuarios sin usuarios.ver', () => {
    expect(visibleNav(user([])).some((i) => i.href === '/admin/usuarios')).toBe(false);
  });
  it('muestra Usuarios con usuarios.ver', () => {
    expect(visibleNav(user(['usuarios.ver'])).some((i) => i.href === '/admin/usuarios')).toBe(true);
  });
  it('filtra cada ítem por su permiso', () => {
    const gerente = visibleNav(user(['usuarios.ver', 'roles.ver', 'auditoria.ver']));
    const hrefs = gerente.map((i) => i.href);
    expect(hrefs).toContain('/admin/roles');
    expect(hrefs).toContain('/admin/auditoria');
    expect(hrefs).not.toContain('/admin/configuracion');
  });
  it('trata a un usuario null como sin permisos', () => {
    const hrefs = visibleNav(null).map((i) => i.href);
    expect(hrefs).toEqual(['/dashboard', '/perfil']);
  });
  it('NAV_ITEMS no tiene hrefs duplicados', () => {
    const h = NAV_ITEMS.map((i) => i.href);
    expect(new Set(h).size).toBe(h.length);
  });
  it('visibleNav incluye /productos con productos.ver', () => {
    expect(visibleNav(user(['productos.ver'])).some((i) => i.href === '/productos')).toBe(true);
  });
  it('visibleNav excluye /productos sin productos.ver', () => {
    expect(visibleNav(user([])).some((i) => i.href === '/productos')).toBe(false);
  });
  it('visibleNav incluye /categorias con categorias.gestionar', () => {
    expect(visibleNav(user(['categorias.gestionar'])).some((i) => i.href === '/categorias')).toBe(true);
  });
  it('visibleNav incluye /inventario con inventario.ver', () => {
    expect(visibleNav(user(['inventario.ver'])).some((i) => i.href === '/inventario')).toBe(true);
  });
  it('visibleNav excluye /inventario sin inventario.ver', () => {
    expect(visibleNav(user([])).some((i) => i.href === '/inventario')).toBe(false);
  });
  it('visibleNav(user([])) no incluye ninguno de los 3 items de Bloque 2', () => {
    const hrefs = visibleNav(user([])).map((i) => i.href);
    expect(hrefs).not.toContain('/productos');
    expect(hrefs).not.toContain('/categorias');
    expect(hrefs).not.toContain('/inventario');
  });
  it('visibleNav(user([productos.ver])) incluye /productos pero no /inventario', () => {
    const hrefs = visibleNav(user(['productos.ver'])).map((i) => i.href);
    expect(hrefs).toContain('/productos');
    expect(hrefs).not.toContain('/inventario');
  });
});
