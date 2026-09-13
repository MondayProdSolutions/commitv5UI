import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export type AuditAction =
  | 'auth.login' | 'auth.logout' | 'auth.login_failed' | 'auth.logout_idle'
  | 'auth.forbidden' | 'auth.password_changed'
  | 'usuarios.crear' | 'usuarios.editar' | 'usuarios.rol_cambiado'
  | 'usuarios.desactivar' | 'usuarios.activar' | 'usuarios.reset_password'
  | 'usuarios.sesiones_revocadas'
  | 'roles.crear' | 'roles.editar' | 'roles.borrar'
  | 'config.editar'
  | 'categorias.crear' | 'categorias.editar' | 'categorias.archivar' | 'categorias.restaurar'
  | 'productos.crear' | 'productos.editar' | 'productos.precio_cambiado'
  | 'productos.archivar' | 'productos.restaurar' | 'productos.disponibilidad'
  | 'productos.variante_agregada' | 'productos.variante_archivada'
  | 'inventario.movimiento'
  | 'clientes.crear' | 'clientes.editar' | 'clientes.archivar'
  | 'clientes.restaurar' | 'clientes.datos_fiscales'
  | 'ventas.crear' | 'ventas.cancelar' | 'ventas.devolver'
  | 'caja.abrir' | 'caja.cerrar' | 'caja.movimiento';

const LABELS: Record<string, string> = {
  'auth.login': 'Inicio de sesión',
  'auth.logout': 'Cierre de sesión',
  'auth.login_failed': 'Intento de inicio de sesión fallido',
  'auth.logout_idle': 'Cierre de sesión por inactividad',
  'auth.forbidden': 'Acceso denegado',
  'auth.password_changed': 'Cambio de contraseña',
  'usuarios.crear': 'Alta de usuario',
  'usuarios.editar': 'Edición de usuario',
  'usuarios.rol_cambiado': 'Cambio de rol de usuario',
  'usuarios.desactivar': 'Desactivación de usuario',
  'usuarios.activar': 'Reactivación de usuario',
  'usuarios.reset_password': 'Restablecimiento de contraseña',
  'usuarios.sesiones_revocadas': 'Revocación de sesiones de usuario',
  'roles.crear': 'Creación de rol',
  'roles.editar': 'Edición de rol',
  'roles.borrar': 'Eliminación de rol',
  'config.editar': 'Cambio de configuración',
  'categorias.crear': 'Creación de categoría',
  'categorias.editar': 'Edición de categoría',
  'categorias.archivar': 'Archivado de categoría',
  'categorias.restaurar': 'Restauración de categoría',
  'productos.crear': 'Alta de producto',
  'productos.editar': 'Edición de producto',
  'productos.precio_cambiado': 'Cambio de precio',
  'productos.archivar': 'Archivado de producto',
  'productos.restaurar': 'Restauración de producto',
  'productos.disponibilidad': 'Cambio de disponibilidad',
  'productos.variante_agregada': 'Variante agregada',
  'productos.variante_archivada': 'Variante archivada',
  'inventario.movimiento': 'Movimiento de inventario',
  'clientes.crear': 'Alta de cliente',
  'clientes.editar': 'Edición de cliente',
  'clientes.archivar': 'Archivado de cliente',
  'clientes.restaurar': 'Restauración de cliente',
  'clientes.datos_fiscales': 'Cambio de datos de facturación',
  'ventas.crear': 'Registro de venta',
  'ventas.cancelar': 'Cancelación de venta',
  'ventas.devolver': 'Devolución registrada',
  'caja.abrir': 'Apertura de caja',
  'caja.cerrar': 'Cierre de caja',
  'caja.movimiento': 'Movimiento de caja',
};

export const KNOWN_ACTIONS = Object.keys(LABELS);

export function actionLabel(accion: string): string {
  return LABELS[accion] ?? accion;
}

export async function logActivity(
  input: {
    actorId?: string | null;
    accion: AuditAction;
    entidad?: string;
    entidadId?: string;
    metadata?: Record<string, unknown>;
    ip?: string | null;
  },
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? db;
  await client.activityLog.create({
    data: {
      actorId: input.actorId ?? null,
      accion: input.accion,
      entidad: input.entidad ?? null,
      entidadId: input.entidadId ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      ip: input.ip ?? null,
    },
  });
}
