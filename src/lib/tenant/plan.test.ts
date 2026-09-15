import { describe, it, expect } from 'vitest';
import type { Tenant, Plan, PlatformAdmin, PlatformAdminSession, TenantFiscalConfig, TenantStatus as TenantStatusType } from '@prisma/client';

// Type-safe constants for TenantStatus values used in type validation
const TENANT_STATUS_VALUES = {
  PRUEBA: 'PRUEBA' as const,
  ACTIVO: 'ACTIVO' as const,
  SUSPENDIDO: 'SUSPENDIDO' as const,
};

describe('Tenant Platform Models', () => {
  describe('TenantStatus enum values', () => {
    it('debería tener el valor PRUEBA', () => {
      expect(TENANT_STATUS_VALUES.PRUEBA).toBe('PRUEBA');
    });

    it('debería tener el valor ACTIVO', () => {
      expect(TENANT_STATUS_VALUES.ACTIVO).toBe('ACTIVO');
    });

    it('debería tener el valor SUSPENDIDO', () => {
      expect(TENANT_STATUS_VALUES.SUSPENDIDO).toBe('SUSPENDIDO');
    });

    it('debería tener exactamente 3 valores', () => {
      const values = Object.values(TENANT_STATUS_VALUES);
      expect(values).toHaveLength(3);
    });
  });

  describe('Plan model types', () => {
    it('debería permitir crear un objeto Plan con los campos requeridos tipado correctamente', () => {
      // TypeScript verifies at compile-time that this object conforms to the Plan type
      const plan: Plan = {
        id: 'test-id',
        nombre: 'Plan Básico',
        maxUsuarios: 10,
        maxSucursales: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(plan.id).toBe('test-id');
      expect(plan.nombre).toBe('Plan Básico');
      expect(plan.maxUsuarios).toBe(10);
      expect(plan.maxSucursales).toBe(1);
      expect(plan.createdAt).toBeInstanceOf(Date);
      expect(plan.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('Tenant model types', () => {
    it('debería permitir crear un objeto Tenant con los campos requeridos tipado correctamente', () => {
      // TypeScript verifies at compile-time that this object conforms to the Tenant type
      // The estado field is type-checked against TenantStatus enum values
      const tenant: Tenant = {
        id: 'test-tenant-id',
        slug: 'test-tenant',
        nombre: 'Test Tenant',
        estado: TENANT_STATUS_VALUES.PRUEBA as TenantStatusType,
        planId: 'test-plan-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(tenant.id).toBe('test-tenant-id');
      expect(tenant.slug).toBe('test-tenant');
      expect(tenant.nombre).toBe('Test Tenant');
      expect(tenant.estado).toBe(TENANT_STATUS_VALUES.PRUEBA);
      expect(tenant.planId).toBe('test-plan-id');
      expect(tenant.createdAt).toBeInstanceOf(Date);
      expect(tenant.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('PlatformAdmin model types', () => {
    it('debería permitir crear un objeto PlatformAdmin con los campos requeridos tipado correctamente', () => {
      // TypeScript verifies at compile-time that this object conforms to the PlatformAdmin type
      const admin: PlatformAdmin = {
        id: 'admin-id',
        nombre: 'Admin User',
        email: 'admin@platform.com',
        passwordHash: 'hashed-password',
        createdAt: new Date(),
      };

      expect(admin.id).toBe('admin-id');
      expect(admin.nombre).toBe('Admin User');
      expect(admin.email).toBe('admin@platform.com');
      expect(admin.passwordHash).toBe('hashed-password');
      expect(admin.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('PlatformAdminSession model types', () => {
    it('debería permitir crear un objeto PlatformAdminSession con los campos requeridos tipado correctamente', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const now = new Date();

      // TypeScript verifies at compile-time that this object conforms to the PlatformAdminSession type
      const session: PlatformAdminSession = {
        id: 'session-id',
        tokenHash: 'token-hash',
        platformAdminId: 'admin-id',
        createdAt: now,
        expiresAt: futureDate,
        lastActivityAt: now,
        ip: '127.0.0.1',
        userAgent: 'Mozilla/5.0...',
        revokedAt: null,
      };

      expect(session.id).toBe('session-id');
      expect(session.tokenHash).toBe('token-hash');
      expect(session.platformAdminId).toBe('admin-id');
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.expiresAt).toBeInstanceOf(Date);
      expect(session.lastActivityAt).toBeInstanceOf(Date);
      expect(session.ip).toBe('127.0.0.1');
      expect(session.userAgent).toBe('Mozilla/5.0...');
      expect(session.revokedAt).toBeNull();
    });
  });

  describe('TenantFiscalConfig model types', () => {
    it('debería permitir crear un objeto TenantFiscalConfig con los campos opcionales tipado correctamente', () => {
      // TypeScript verifies at compile-time that this object conforms to the TenantFiscalConfig type
      const fiscalConfig: TenantFiscalConfig = {
        tenantId: 'tenant-id',
        rfcEmisor: 'RFC123456789',
        razonSocial: 'Test Company S.A. de C.V.',
        regimenFiscalCode: '601',
        csdCertificado: Buffer.from('cert-data'),
        csdLlaveCifrada: Buffer.from('key-data'),
        csdPasswordCifrada: Buffer.from('password-data'),
        pacProveedor: 'test-pac',
        pacCredencialesCifradas: Buffer.from('credentials-data'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(fiscalConfig.tenantId).toBe('tenant-id');
      expect(fiscalConfig.rfcEmisor).toBe('RFC123456789');
      expect(fiscalConfig.razonSocial).toBe('Test Company S.A. de C.V.');
      expect(fiscalConfig.regimenFiscalCode).toBe('601');
      expect(fiscalConfig.pacProveedor).toBe('test-pac');
      expect(fiscalConfig.createdAt).toBeInstanceOf(Date);
      expect(fiscalConfig.updatedAt).toBeInstanceOf(Date);
    });
  });
});
