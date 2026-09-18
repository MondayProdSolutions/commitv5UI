import { db, withPlatformAdmin, withTenant } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import { hashPassword, passwordPolicyError } from '@/lib/auth/password';
import { requirePlatformAdmin } from '@/lib/platform-auth/context';

export type TenantSummary = {
  id: string;
  slug: string;
  nombre: string;
  estado: 'PRUEBA' | 'ACTIVO' | 'SUSPENDIDO';
  planNombre: string;
  estadoDesde: Date;
};

export type TenantStatus = 'PRUEBA' | 'ACTIVO' | 'SUSPENDIDO';

export type CreateTenantInput = {
  slug: string;
  nombre: string;
  planId: string;
  adminNombre: string;
  adminEmail: string;
  adminPassword: string;
};

export async function listTenants(): Promise<TenantSummary[]> {
  await requirePlatformAdmin();
  return withPlatformAdmin(async () => {
    const tenants = await db.tenant.findMany({ include: { plan: true }, orderBy: { createdAt: 'desc' } });
    return tenants.map((t) => ({
      id: t.id,
      slug: t.slug,
      nombre: t.nombre,
      estado: t.estado,
      planNombre: t.plan.nombre,
      estadoDesde: t.estadoDesde,
    }));
  });
}

export async function createTenant(input: CreateTenantInput): Promise<{ tenantId: string }> {
  await requirePlatformAdmin();
  const policyError = passwordPolicyError(input.adminPassword, input.adminEmail);
  if (policyError) throw new ValidationError({ adminPassword: policyError });

  const existing = await withPlatformAdmin(() => db.tenant.findUnique({ where: { slug: input.slug } }));
  if (existing) throw new ValidationError({ slug: 'Ese identificador de empresa ya está en uso' });

  const tenant = await withPlatformAdmin(() =>
    db.tenant.create({
      data: { slug: input.slug, nombre: input.nombre, estado: 'ACTIVO', planId: input.planId },
    }),
  );

  await withTenant(tenant.id, async () => {
    const role = await db.role.upsert({
      where: { tenantId_nombre: { tenantId: tenant.id, nombre: 'Administrador' } },
      update: { esSistema: true },
      create: { tenantId: tenant.id, nombre: 'Administrador', esSistema: true, descripcion: 'Rol de sistema: Administrador' },
    });

    const { ALL_PERMISSION_KEYS } = await import('@/lib/auth/rbac');
    await db.rolePermission.createMany({
      data: ALL_PERMISSION_KEYS.map((permiso) => ({ tenantId: tenant.id, roleId: role.id, permiso })),
      skipDuplicates: true,
    });

    const passwordHash = await hashPassword(input.adminPassword);
    await db.user.create({
      data: {
        tenantId: tenant.id,
        nombre: input.adminNombre,
        email: input.adminEmail,
        passwordHash,
        roleId: role.id,
        mustChangePassword: false,
      },
    });
  });

  return { tenantId: tenant.id };
}

export async function setTenantEstado(tenantId: string, estado: TenantStatus): Promise<void> {
  await requirePlatformAdmin();
  await withPlatformAdmin(() =>
    db.tenant.update({ where: { id: tenantId }, data: { estado, estadoDesde: new Date() } }),
  );
}
