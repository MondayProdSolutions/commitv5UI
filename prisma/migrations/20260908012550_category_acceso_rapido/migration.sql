-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "color" TEXT,
ADD COLUMN     "icono" TEXT,
ADD COLUMN     "orden" INTEGER NOT NULL DEFAULT 0;
