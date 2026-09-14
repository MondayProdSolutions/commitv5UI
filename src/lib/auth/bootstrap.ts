import { db, getCurrentTenantId } from '@/lib/db';
import { hashPassword, passwordPolicyError } from './password';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import type { SetupInput } from '@/lib/validation/auth';

/** El sistema necesita bootstrap mientras no exista ningún usuario. */
export async function isBootstrapNeeded(): Promise<boolean> {
  return (await db.user.count()) === 0;
}

/**
 * Crea el primer usuario Administrador (flujo `/setup`).
 * - Aplica la política de contraseñas (defensivo; el esquema ya valida longitud).
 * - Crea el rol Administrador de sistema si no existe (upsert defensivo).
 * - Registra `usuarios.crear` con `metadata.bootstrap = true` dentro de la misma transacción.
 */
export async function createFirstAdmin(input: SetupInput): Promise<{ userId: string }> {
  const policy = passwordPolicyError(input.password, input.email);
  if (policy) throw new ValidationError({ password: policy });

  const passwordHash = await hashPassword(input.password);

  const tenantId = getCurrentTenantId();

  return db.$transaction(async (tx) => {
    const role = await tx.role.upsert({
      where: { tenantId_nombre: { tenantId, nombre: 'Administrador' } },
      update: { esSistema: true },
      create: { nombre: 'Administrador', esSistema: true, descripcion: 'Rol de sistema: Administrador' },
    });

    const user = await tx.user.create({
      data: {
        nombre: input.nombre,
        email: input.email,
        passwordHash,
        roleId: role.id,
        mustChangePassword: false,
      },
    });

    await logActivity(
      {
        actorId: user.id,
        accion: 'usuarios.crear',
        entidad: 'User',
        entidadId: user.id,
        metadata: { bootstrap: true, email: user.email, nombre: user.nombre, rol: 'Administrador' },
      },
      tx,
    );

    return { userId: user.id };
  });
}
