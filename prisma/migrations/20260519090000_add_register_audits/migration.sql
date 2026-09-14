-- CreateTable
CREATE TABLE "RegisterAudit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "auditedByUserId" TEXT NOT NULL,
    "periodStartAt" TIMESTAMP(3) NOT NULL,
    "periodEndAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedCashAmount" DECIMAL(12,2) NOT NULL,
    "countedCashAmount" DECIMAL(12,2) NOT NULL,
    "cashDifferenceAmount" DECIMAL(12,2) NOT NULL,
    "expectedTransferAmount" DECIMAL(12,2) NOT NULL,
    "countedTransferAmount" DECIMAL(12,2) NOT NULL,
    "transferDifferenceAmount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegisterAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegisterAudit_organizationId_periodStartAt_idx" ON "RegisterAudit"("organizationId", "periodStartAt");

-- CreateIndex
CREATE INDEX "RegisterAudit_organizationId_periodEndAt_idx" ON "RegisterAudit"("organizationId", "periodEndAt");

-- CreateIndex
CREATE INDEX "RegisterAudit_auditedByUserId_createdAt_idx" ON "RegisterAudit"("auditedByUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "RegisterAudit" ADD CONSTRAINT "RegisterAudit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegisterAudit" ADD CONSTRAINT "RegisterAudit_auditedByUserId_fkey" FOREIGN KEY ("auditedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;