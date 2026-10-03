-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "paymentCapabilitiesJson" JSONB;

-- AlterTable
ALTER TABLE "Site" ADD COLUMN "stripeLocationId" TEXT,
ADD COLUMN "paymentCapabilitiesJson" JSONB;
