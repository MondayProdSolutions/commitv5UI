-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('RETIRO', 'INGRESO');

-- AlterTable
ALTER TABLE "Return" ADD COLUMN     "cashSessionId" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "cashSessionId" TEXT;

-- CreateTable
CREATE TABLE "CashSession" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "estado" "CashSessionStatus" NOT NULL DEFAULT 'ABIERTA',
    "fondoApertura" DECIMAL(12,2) NOT NULL,
    "abiertaPorId" TEXT NOT NULL,
    "abiertaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradaPorId" TEXT,
    "cerradaEn" TIMESTAMP(3),
    "efectivoContado" DECIMAL(12,2),
    "esperadoEfectivo" DECIMAL(12,2),
    "diferencia" DECIMAL(12,2),
    "totalEfectivoVentas" DECIMAL(12,2),
    "totalTarjeta" DECIMAL(12,2),
    "totalTransferencia" DECIMAL(12,2),
    "totalReembolsosEfectivo" DECIMAL(12,2),
    "totalRetiros" DECIMAL(12,2),
    "totalIngresos" DECIMAL(12,2),
    "nVentas" INTEGER,
    "notaCierre" TEXT,

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tipo" "CashMovementType" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashSession_folio_key" ON "CashSession"("folio");

-- CreateIndex
CREATE INDEX "CashSession_estado_idx" ON "CashSession"("estado");

-- CreateIndex
CREATE INDEX "CashSession_abiertaEn_idx" ON "CashSession"("abiertaEn");

-- CreateIndex
CREATE INDEX "CashMovement_sessionId_idx" ON "CashMovement"("sessionId");

-- CreateIndex
CREATE INDEX "Return_cashSessionId_idx" ON "Return"("cashSessionId");

-- CreateIndex
CREATE INDEX "Sale_cashSessionId_idx" ON "Sale"("cashSessionId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_abiertaPorId_fkey" FOREIGN KEY ("abiertaPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_cerradaPorId_fkey" FOREIGN KEY ("cerradaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
