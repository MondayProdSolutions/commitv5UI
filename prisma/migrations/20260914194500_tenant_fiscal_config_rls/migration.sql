-- Fix 4 (revisión final de rama, hallazgo real): "TenantFiscalConfig" tiene una
-- columna "tenantId" (es su propia PK, ver prisma/schema.prisma) pero quedó
-- fuera de la migración 20260914060000_row_level_security — no está entre las
-- "21 tablas de negocio" que esa migración enumera explícitamente. A
-- diferencia de Tenant/Plan/PlatformAdmin/PlatformAdminSession (catálogos de
-- plataforma sin tenantId, correctamente sin RLS), esta tabla SÍ es
-- tenant-scoped y además guarda material extremadamente sensible por tenant
-- (CSD: certificado, llave privada cifrada, contraseña cifrada, credenciales
-- de PAC cifradas — ver columnas csdCertificado/csdLlaveCifrada/
-- csdPasswordCifrada/pacCredencialesCifradas). Sin RLS, cualquier código que
-- alguna vez consulte esta tabla sin filtrar explícitamente por tenantId (el
-- `db` Proxy de src/lib/db.ts no inyecta ningún where de tenant — RLS es la
-- única capa que filtra SELECTs) expondría el material fiscal de un tenant a
-- otro. Encontrado por el nuevo test de catálogo de
-- src/lib/db-isolation.itest.ts (Fix 4), que consulta pg_class/pg_policies
-- directamente en vez de confiar en el schema de Prisma. Mismo patrón exacto
-- que las 21 tablas ya cubiertas.

ALTER TABLE "TenantFiscalConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantFiscalConfig" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TenantFiscalConfig"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );
