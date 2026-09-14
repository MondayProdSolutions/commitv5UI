-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "RolePermission" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "AppSetting" DROP CONSTRAINT "AppSetting_pkey";
ALTER TABLE "AppSetting" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("tenantId", "clave");

-- AlterTable
ALTER TABLE "TaxRate" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "SaleLine" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "Return" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "ReturnLine" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "FolioCounter" DROP CONSTRAINT "FolioCounter_pkey";
ALTER TABLE "FolioCounter" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);
ALTER TABLE "FolioCounter" ADD CONSTRAINT "FolioCounter_pkey" PRIMARY KEY ("tenantId", "serie");

-- AlterTable
ALTER TABLE "CashSession" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "CashMovement" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true);

-- DropIndex
DROP INDEX "User_email_key";

-- DropIndex
DROP INDEX "Role_nombre_key";

-- DropIndex
DROP INDEX "TaxRate_nombre_key";

-- DropIndex
DROP INDEX "ProductVariant_sku_key";

-- DropIndex
DROP INDEX "ProductVariant_codigoBarras_key";

-- DropIndex
DROP INDEX "Customer_telefono_key";

-- DropIndex
DROP INDEX "Customer_correo_key";

-- DropIndex
DROP INDEX "Customer_rfc_key";

-- DropIndex
DROP INDEX "Sale_folio_key";

-- DropIndex
DROP INDEX "Return_folio_key";

-- DropIndex
DROP INDEX "CashSession_folio_key";

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Role_tenantId_idx" ON "Role"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_nombre_key" ON "Role"("tenantId", "nombre");

-- CreateIndex
CREATE INDEX "RolePermission_tenantId_idx" ON "RolePermission"("tenantId");

-- CreateIndex
CREATE INDEX "Session_tenantId_idx" ON "Session"("tenantId");

-- CreateIndex
CREATE INDEX "ActivityLog_tenantId_idx" ON "ActivityLog"("tenantId");

-- CreateIndex
CREATE INDEX "AppSetting_tenantId_idx" ON "AppSetting"("tenantId");

-- CreateIndex
CREATE INDEX "TaxRate_tenantId_idx" ON "TaxRate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRate_tenantId_nombre_key" ON "TaxRate"("tenantId", "nombre");

-- CreateIndex
CREATE INDEX "Category_tenantId_idx" ON "Category"("tenantId");

-- CreateIndex
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");

-- CreateIndex
CREATE INDEX "ProductVariant_tenantId_idx" ON "ProductVariant"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_tenantId_sku_key" ON "ProductVariant"("tenantId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_tenantId_codigoBarras_key" ON "ProductVariant"("tenantId", "codigoBarras");

-- CreateIndex
CREATE INDEX "InventoryMovement_tenantId_idx" ON "InventoryMovement"("tenantId");

-- CreateIndex
CREATE INDEX "Customer_tenantId_idx" ON "Customer"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_telefono_key" ON "Customer"("tenantId", "telefono");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_correo_key" ON "Customer"("tenantId", "correo");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_rfc_key" ON "Customer"("tenantId", "rfc");

-- CreateIndex
CREATE INDEX "Sale_tenantId_idx" ON "Sale"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_tenantId_folio_key" ON "Sale"("tenantId", "folio");

-- CreateIndex
CREATE INDEX "SaleLine_tenantId_idx" ON "SaleLine"("tenantId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");

-- CreateIndex
CREATE INDEX "Return_tenantId_idx" ON "Return"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Return_tenantId_folio_key" ON "Return"("tenantId", "folio");

-- CreateIndex
CREATE INDEX "ReturnLine_tenantId_idx" ON "ReturnLine"("tenantId");

-- CreateIndex
CREATE INDEX "CashSession_tenantId_idx" ON "CashSession"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CashSession_tenantId_folio_key" ON "CashSession"("tenantId", "folio");

-- CreateIndex
CREATE INDEX "CashMovement_tenantId_idx" ON "CashMovement"("tenantId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_tenantId_idx" ON "AttendanceRecord"("tenantId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnLine" ADD CONSTRAINT "ReturnLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolioCounter" ADD CONSTRAINT "FolioCounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
