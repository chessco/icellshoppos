/*
  Warnings:

  - Added the required column `capacity` to the `SaleItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `color` to the `SaleItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `imei` to the `SaleItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `model` to the `SaleItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "defaultPriceTier" TEXT NOT NULL DEFAULT 'Price',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'Active';

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "batteryHealth" TEXT,
ADD COLUMN     "carrier" TEXT,
ADD COLUMN     "comments" TEXT,
ADD COLUMN     "condition" TEXT,
ADD COLUMN     "costUsd" DECIMAL(12,2),
ADD COLUMN     "cycleCount" INTEGER,
ADD COLUMN     "dateOfPurchase" TIMESTAMP(3),
ADD COLUMN     "iosVersion" TEXT,
ADD COLUMN     "qrRaw" TEXT,
ADD COLUMN     "serialNumber" TEXT,
ADD COLUMN     "supplierId" TEXT,
ADD COLUMN     "usdToPesosRate" DECIMAL(12,4);

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "soldBy" TEXT;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "capacity" TEXT NOT NULL,
ADD COLUMN     "color" TEXT NOT NULL,
ADD COLUMN     "imei" TEXT NOT NULL,
ADD COLUMN     "model" TEXT NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'Finished';

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "usdToMxn" DECIMAL(12,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "capacity" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "price2" DECIMAL(12,2) NOT NULL,
    "price3" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_organizationId_idx" ON "Supplier"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_organizationId_name_key" ON "Supplier"("organizationId", "name");

-- CreateIndex
CREATE INDEX "ExchangeRate_organizationId_createdAt_idx" ON "ExchangeRate"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "PriceRule_organizationId_idx" ON "PriceRule"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceRule_organizationId_model_capacity_key" ON "PriceRule"("organizationId", "model", "capacity");

-- CreateIndex
CREATE INDEX "InventoryItem_supplierId_idx" ON "InventoryItem"("supplierId");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
