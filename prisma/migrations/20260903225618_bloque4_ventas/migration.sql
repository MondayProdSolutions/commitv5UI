-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA');

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "estado" "SaleStatus" NOT NULL DEFAULT 'COMPLETADA',
    "customerId" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "descuentoLineas" DECIMAL(12,2) NOT NULL,
    "descuentoTicket" DECIMAL(12,2) NOT NULL,
    "impuestos" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "pagado" DECIMAL(12,2) NOT NULL,
    "cambio" DECIMAL(12,2) NOT NULL,
    "requiereFactura" BOOLEAN NOT NULL DEFAULT false,
    "datosFiscales" JSONB,
    "canceladaEn" TIMESTAMP(3),
    "canceladaPorId" TEXT,
    "motivoCancelacion" TEXT,
    "cajeroId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleLine" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productoNombre" TEXT NOT NULL,
    "varianteNombre" TEXT,
    "sku" TEXT,
    "cantidad" INTEGER NOT NULL,
    "precioUnitario" DECIMAL(12,2) NOT NULL,
    "tasaImpuesto" DECIMAL(5,4) NOT NULL,
    "descuentoMonto" DECIMAL(12,2) NOT NULL,
    "descuentoTicketProrrateado" DECIMAL(12,2) NOT NULL,
    "baseNeta" DECIMAL(12,2) NOT NULL,
    "impuesto" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "SaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "metodo" "PaymentMethod" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Return" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "impuestos" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "metodoReembolso" "PaymentMethod" NOT NULL,
    "motivo" TEXT NOT NULL,
    "cajeroId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnLine" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "saleLineId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "baseNeta" DECIMAL(12,2) NOT NULL,
    "impuesto" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "ReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FolioCounter" (
    "serie" TEXT NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FolioCounter_pkey" PRIMARY KEY ("serie")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sale_folio_key" ON "Sale"("folio");

-- CreateIndex
CREATE INDEX "Sale_createdAt_idx" ON "Sale"("createdAt");

-- CreateIndex
CREATE INDEX "Sale_estado_createdAt_idx" ON "Sale"("estado", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");

-- CreateIndex
CREATE INDEX "Sale_cajeroId_idx" ON "Sale"("cajeroId");

-- CreateIndex
CREATE INDEX "SaleLine_saleId_idx" ON "SaleLine"("saleId");

-- CreateIndex
CREATE INDEX "SaleLine_variantId_idx" ON "SaleLine"("variantId");

-- CreateIndex
CREATE INDEX "Payment_saleId_idx" ON "Payment"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "Return_folio_key" ON "Return"("folio");

-- CreateIndex
CREATE INDEX "Return_saleId_idx" ON "Return"("saleId");

-- CreateIndex
CREATE INDEX "Return_createdAt_idx" ON "Return"("createdAt");

-- CreateIndex
CREATE INDEX "ReturnLine_returnId_idx" ON "ReturnLine"("returnId");

-- CreateIndex
CREATE INDEX "ReturnLine_saleLineId_idx" ON "ReturnLine"("saleLineId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_canceladaPorId_fkey" FOREIGN KEY ("canceladaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cajeroId_fkey" FOREIGN KEY ("cajeroId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_cajeroId_fkey" FOREIGN KEY ("cajeroId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnLine" ADD CONSTRAINT "ReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnLine" ADD CONSTRAINT "ReturnLine_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "SaleLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
