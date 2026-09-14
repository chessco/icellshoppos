/*
  Warnings:

  - A unique constraint covering the columns `[requestId,imei]` on the table `InventoryTransferItem` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "InventoryTransferItem" DROP CONSTRAINT "InventoryTransferItem_saleItemId_fkey";

-- DropIndex (conditional)
DROP INDEX IF EXISTS "InventoryTransferItem_requestId_saleItemId_key";

-- AlterTable
ALTER TABLE "InventoryTransferItem" ALTER COLUMN "saleItemId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "InventoryTransferItem" ADD CONSTRAINT "InventoryTransferItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex (conditional)
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryTransferItem_requestId_imei_key" ON "InventoryTransferItem"("requestId", "imei");
