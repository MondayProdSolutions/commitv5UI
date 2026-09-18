-- AlterTable
ALTER TABLE "ActivityLog" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "AppSetting" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "AttendanceRecord" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "CashMovement" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "CashSession" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "FolioCounter" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "InventoryMovement" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "ProductVariant" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "Return" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "ReturnLine" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "RolePermission" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "Sale" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "SaleLine" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "TaxRate" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "estadoDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);
