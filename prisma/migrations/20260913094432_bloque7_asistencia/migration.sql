-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL,
    "checkInFotoPath" TEXT,
    "checkOutAt" TIMESTAMP(3),
    "checkOutFotoPath" TEXT,
    "minutosTrabajados" INTEGER,
    "corregidoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceRecord_fecha_idx" ON "AttendanceRecord"("fecha");

-- CreateIndex
CREATE INDEX "AttendanceRecord_userId_fecha_idx" ON "AttendanceRecord"("userId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_userId_fecha_key" ON "AttendanceRecord"("userId", "fecha");

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_corregidoPorId_fkey" FOREIGN KEY ("corregidoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
