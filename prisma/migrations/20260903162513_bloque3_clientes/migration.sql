-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "correo" TEXT,
    "direccion" TEXT,
    "notas" TEXT,
    "rfc" TEXT,
    "razonSocial" TEXT,
    "regimenFiscalCode" TEXT,
    "usoCfdiCode" TEXT,
    "cpFiscal" TEXT,
    "correoFacturacion" TEXT,
    "esGenerico" BOOLEAN NOT NULL DEFAULT false,
    "archivado" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_telefono_key" ON "Customer"("telefono");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_correo_key" ON "Customer"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_rfc_key" ON "Customer"("rfc");

-- CreateIndex
CREATE INDEX "Customer_archivado_idx" ON "Customer"("archivado");

-- CreateIndex
CREATE INDEX "Customer_nombre_idx" ON "Customer"("nombre");
