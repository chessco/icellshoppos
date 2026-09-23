-- CreateEnum
CREATE TYPE "DiscountAuthorizationStatus" AS ENUM ('PENDING', 'APPROVED', 'PARTIAL', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "discount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DiscountAuthorization" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "draftSaleId" TEXT NOT NULL,
    "completedSaleId" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "authorizedByUserId" TEXT,
    "status" "DiscountAuthorizationStatus" NOT NULL DEFAULT 'PENDING',
    "requestedDiscount" DECIMAL(12,2) NOT NULL,
    "approvedDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "responseNote" TEXT,
    "snapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DiscountAuthorization_organizationId_status_createdAt_idx" ON "DiscountAuthorization"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DiscountAuthorization_requestedByUserId_createdAt_idx" ON "DiscountAuthorization"("requestedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DiscountAuthorization_draftSaleId_idx" ON "DiscountAuthorization"("draftSaleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DiscountAuthorization_completedSaleId_idx" ON "DiscountAuthorization"("completedSaleId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DiscountAuthorization_organizationId_fkey'
    ) THEN
        ALTER TABLE "DiscountAuthorization" ADD CONSTRAINT "DiscountAuthorization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DiscountAuthorization_requestedByUserId_fkey'
    ) THEN
        ALTER TABLE "DiscountAuthorization" ADD CONSTRAINT "DiscountAuthorization_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DiscountAuthorization_authorizedByUserId_fkey'
    ) THEN
        ALTER TABLE "DiscountAuthorization" ADD CONSTRAINT "DiscountAuthorization_authorizedByUserId_fkey" FOREIGN KEY ("authorizedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DiscountAuthorization_completedSaleId_fkey'
    ) THEN
        ALTER TABLE "DiscountAuthorization" ADD CONSTRAINT "DiscountAuthorization_completedSaleId_fkey" FOREIGN KEY ("completedSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
