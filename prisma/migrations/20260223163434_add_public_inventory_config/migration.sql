-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "publicInventoryColumns" TEXT,
ADD COLUMN     "publicInventoryEnabled" BOOLEAN NOT NULL DEFAULT false;
