import { ALL_PERMISSION_KEYS } from './rbac';

// Asignación canónica de permisos por rol de sistema. Única fuente de verdad
// compartida por `prisma/seed.ts` y `src/lib/roles/admin.itest.ts`: no deben
// divergir jamás. Solo constantes — sin `PrismaClient` ni efectos secundarios —
// para que el itest pueda importarlo sin arrastrar un cliente de base de datos.
export const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  Administrador: ALL_PERMISSION_KEYS,
  Gerente: [
    'usuarios.ver', 'usuarios.crear', 'usuarios.editar',
    'usuarios.reset_password', 'roles.ver', 'auditoria.ver',
    // Bloque 2: Productos, Categorías e Inventario
    'productos.ver', 'productos.crear', 'productos.editar', 'productos.archivar',
    'categorias.gestionar', 'inventario.ver', 'inventario.entrada',
    'inventario.salida', 'inventario.ajustar',
    // Bloque 3: Clientes
    'clientes.ver', 'clientes.crear', 'clientes.editar', 'clientes.archivar',
    // Bloque 4: Ventas
    'ventas.crear', 'ventas.descuento', 'ventas.cancelar', 'ventas.devolver', 'ventas.ver',
    // Bloque 5: Caja
    'caja.gestionar',
    // Bloque 6: Reportes
    'reportes.ver', 'reportes.margen',
    // Bloque 7: Asistencia
    'asistencia.registrar', 'asistencia.ver',
  ],
  Cajero: [
    'productos.ver', 'inventario.ver', 'clientes.ver', 'clientes.crear',
    'ventas.crear', 'ventas.ver', 'ventas.devolver',
    'caja.gestionar',
    'reportes.ver',
    // Bloque 7: Asistencia
    'asistencia.registrar',
  ],
  Empleado: ['productos.ver', 'inventario.ver', 'clientes.ver', 'asistencia.registrar'],
};
