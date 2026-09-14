-- Task 3: Row-Level Security + prueba de fuga entre tenants
--
-- Nota: el DEFAULT de columna `tenantId` (`current_setting('app.tenant_id', true)`)
-- ya quedó establecido para las 21 tablas de negocio en la migración
-- 20260914050000_tenant_id_everywhere (Task 2). Volver a fijarlo aquí sería un
-- no-op inofensivo, así que se omite y este archivo solo agrega lo que Task 2
-- todavía no cubría: el rol de aplicación sin privilegios de superusuario y las
-- políticas RLS en sí.
--
-- Por qué hace falta un rol nuevo: tanto en desarrollo (scripts/db.mjs) como en
-- tests (test/pg-embedded.ts, test/e2e-pg.ts) la app se conecta a Postgres como
-- el rol "postgres", que es superusuario. En Postgres, un superusuario SIEMPRE
-- ignora RLS — ENABLE/FORCE ROW LEVEL SECURITY no tiene ningún efecto sobre esa
-- conexión, sin excepción (esto se confirmó empíricamente: rolsuper=true,
-- rolbypassrls=true en el rol "postgres" de la instancia embebida de test). Sin
-- un rol distinto, sin privilegio de superusuario, para ejecutar las consultas
-- reales, las políticas de abajo no protegerían nada en este proyecto — quedarían
-- como teatro de seguridad. Por eso se crea "app_role" (sin LOGIN: nunca se usa
-- para abrir una conexión nueva, solo para que `withTenant`/`withPlatformAdmin`
-- hagan `SET LOCAL ROLE app_role` dentro de su transacción — ver src/lib/db.ts)
-- y se le otorgan los privilegios DML que la app necesita. Un superusuario como
-- "postgres" puede hacer SET ROLE a cualquier rol sin necesitar membresía
-- explícita, así que esto no requiere cambiar ninguna cadena de conexión.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_role') THEN
    CREATE ROLE app_role NOSUPERUSER NOBYPASSRLS NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
-- Para que las tablas de las tareas siguientes (4-9), creadas por migraciones
-- futuras que también corren como "postgres", queden accesibles para app_role
-- sin tener que recordar agregar un GRANT en cada una.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_role;

-- RLS: solo en las 21 tablas de negocio con columna tenantId. Tenant, Plan,
-- PlatformAdmin y PlatformAdminSession son catálogos de plataforma sin
-- tenantId — no llevan RLS (ver task-3-brief.md, "Nota de alcance").

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Role" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Role"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RolePermission" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RolePermission"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Session"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "ActivityLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivityLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ActivityLog"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "AppSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppSetting" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AppSetting"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "TaxRate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaxRate" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TaxRate"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Category"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Product"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "ProductVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductVariant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProductVariant"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "InventoryMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryMovement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "InventoryMovement"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Customer"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Sale" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Sale"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "SaleLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaleLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SaleLine"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Payment"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "Return" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Return" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Return"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "ReturnLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReturnLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ReturnLine"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "FolioCounter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FolioCounter" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FolioCounter"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "CashSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashSession"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "CashMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashMovement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashMovement"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER TABLE "AttendanceRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AttendanceRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AttendanceRecord"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );
