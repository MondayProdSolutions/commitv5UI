import { can, type AuthUser, type PermissionKey } from './auth/rbac';

export type NavItem = { href: string; label: string; permiso?: PermissionKey; badge?: 'stock' };

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Inicio' },
  { href: '/admin/usuarios', label: 'Usuarios', permiso: 'usuarios.ver' },
  { href: '/admin/roles', label: 'Roles', permiso: 'roles.ver' },
  { href: '/admin/auditoria', label: 'Auditoría', permiso: 'auditoria.ver' },
  { href: '/admin/configuracion', label: 'Configuración', permiso: 'config.editar' },
  { href: '/productos', label: 'Productos', permiso: 'productos.ver' },
  { href: '/categorias', label: 'Categorías', permiso: 'categorias.gestionar' },
  { href: '/inventario', label: 'Inventario', permiso: 'inventario.ver', badge: 'stock' },
  { href: '/clientes', label: 'Clientes', permiso: 'clientes.ver' },
  { href: '/ventas', label: 'Punto de venta', permiso: 'ventas.crear' },
  { href: '/ventas/historial', label: 'Ventas', permiso: 'ventas.ver' },
  { href: '/caja', label: 'Caja', permiso: 'caja.gestionar' },
  { href: '/reportes', label: 'Reportes', permiso: 'reportes.ver' },
  { href: '/asistencia/registrar', label: 'Registrar asistencia', permiso: 'asistencia.registrar' },
  { href: '/asistencia', label: 'Asistencia (dashboard)', permiso: 'asistencia.ver' },
  { href: '/perfil', label: 'Mi perfil' },
];

export function visibleNav(user: AuthUser | null): NavItem[] {
  return NAV_ITEMS.filter((i) => !i.permiso || can(user, i.permiso));
}
