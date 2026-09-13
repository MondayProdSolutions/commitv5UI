export const PERMISSIONS = [
  {
    modulo: 'usuarios', label: 'Usuarios',
    permisos: [
      { key: 'usuarios.ver', label: 'Ver usuarios' },
      { key: 'usuarios.crear', label: 'Crear usuarios' },
      { key: 'usuarios.editar', label: 'Editar usuarios y su rol' },
      { key: 'usuarios.desactivar', label: 'Activar/desactivar usuarios' },
      { key: 'usuarios.reset_password', label: 'Restablecer contraseñas' },
    ],
  },
  {
    modulo: 'roles', label: 'Roles y permisos',
    permisos: [
      { key: 'roles.ver', label: 'Ver roles' },
      { key: 'roles.gestionar', label: 'Crear, editar y borrar roles' },
    ],
  },
  {
    modulo: 'auditoria', label: 'Auditoría',
    permisos: [{ key: 'auditoria.ver', label: 'Ver el historial de actividad' }],
  },
  {
    modulo: 'configuracion', label: 'Configuración',
    permisos: [{ key: 'config.editar', label: 'Editar la configuración del sistema' }],
  },
  {
    modulo: 'productos', label: 'Productos',
    permisos: [
      { key: 'productos.ver', label: 'Ver catálogo y detalle' },
      { key: 'productos.crear', label: 'Alta de productos y variantes' },
      { key: 'productos.editar', label: 'Editar datos, precios, disponibilidad, variantes' },
      { key: 'productos.archivar', label: 'Archivar / restaurar productos y variantes' },
    ],
  },
  {
    modulo: 'categorias', label: 'Categorías',
    permisos: [
      { key: 'categorias.gestionar', label: 'Crear, editar y archivar categorías y subcategorías' },
    ],
  },
  {
    modulo: 'inventario', label: 'Inventario',
    permisos: [
      { key: 'inventario.ver', label: 'Ver stock, movimientos y alertas' },
      { key: 'inventario.entrada', label: 'Registrar entradas' },
      { key: 'inventario.salida', label: 'Registrar salidas' },
      { key: 'inventario.ajustar', label: 'Ajustar stock a un valor' },
    ],
  },
  {
    modulo: 'clientes', label: 'Clientes',
    permisos: [
      { key: 'clientes.ver', label: 'Ver clientes y su detalle' },
      { key: 'clientes.crear', label: 'Alta de clientes' },
      { key: 'clientes.editar', label: 'Editar datos de contacto y facturación' },
      { key: 'clientes.archivar', label: 'Archivar / restaurar clientes' },
    ],
  },
  {
    modulo: 'ventas', label: 'Ventas',
    permisos: [
      { key: 'ventas.crear', label: 'Registrar ventas en el punto de venta' },
      { key: 'ventas.descuento', label: 'Aplicar descuentos (línea y ticket)' },
      { key: 'ventas.cancelar', label: 'Cancelar una venta mientras la caja siga abierta' },
      { key: 'ventas.devolver', label: 'Registrar devoluciones' },
      { key: 'ventas.ver', label: 'Ver historial y detalle de ventas y devoluciones' },
    ],
  },
  {
    modulo: 'caja', label: 'Caja',
    permisos: [
      { key: 'caja.gestionar', label: 'Abrir y cerrar caja, registrar movimientos y ver cortes' },
    ],
  },
  {
    modulo: 'reportes', label: 'Reportes',
    permisos: [
      { key: 'reportes.ver', label: 'Ver reportes de ventas, inventario y clientes' },
      { key: 'reportes.margen', label: 'Ver el reporte de utilidad y margen (costos)' },
    ],
  },
  {
    modulo: 'asistencia', label: 'Asistencia',
    permisos: [
      { key: 'asistencia.registrar', label: 'Registrar la propia entrada y salida' },
      { key: 'asistencia.ver', label: 'Ver el dashboard y reportes de asistencia de todos los empleados' },
      { key: 'asistencia.corregir', label: 'Editar o cerrar manualmente un registro de asistencia' },
    ],
  },
] as const;

export type PermissionKey =
  (typeof PERMISSIONS)[number]['permisos'][number]['key'];

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] =
  PERMISSIONS.flatMap((g) => g.permisos.map((p) => p.key));

export const ADMIN_LOCKED_PERMISSIONS = [
  'roles.gestionar', 'usuarios.editar', 'usuarios.desactivar',
] as const satisfies readonly PermissionKey[];

export const MANAGER_GUARD_PERMISSIONS = [
  'roles.gestionar', 'usuarios.editar',
] as const satisfies readonly PermissionKey[];

export type AuthUser = {
  id: string;
  nombre: string;
  email: string;
  roleId: string;
  roleName: string;
  permissions: Set<string>;
  mustChangePassword: boolean;
};

export function can(user: AuthUser | null, permiso: PermissionKey): boolean {
  return !!user && user.permissions.has(permiso);
}
