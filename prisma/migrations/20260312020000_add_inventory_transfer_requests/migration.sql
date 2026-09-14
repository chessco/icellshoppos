CREATE TABLE "InventoryTransferRequest" (
  "id" TEXT NOT NULL,
  "sourceOrganizationId" TEXT NOT NULL,
  "targetOrganizationId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "customerEmail" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryTransferRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryTransferItem" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "saleItemId" TEXT NOT NULL,
  "imei" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "capacity" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "carrier" TEXT,
  "condition" TEXT,
  "batteryHealth" TEXT,
  "cycleCount" INTEGER,
  "iosVersion" TEXT,
  "serialNumber" TEXT,
  "comments" TEXT,
  "qrRaw" TEXT,
  "sourceCostPesos" DECIMAL(12,2) NOT NULL,
  "sourceSalePrice" DECIMAL(12,2) NOT NULL,
  "importedAt" TIMESTAMP(3),
  "importedInventoryItemId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryTransferItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryTransferRequest_sourceOrganizationId_targetOrganization_key"
ON "InventoryTransferRequest"("sourceOrganizationId", "targetOrganizationId", "saleId");

CREATE INDEX "InventoryTransferRequest_targetOrganizationId_status_createdAt_idx"
ON "InventoryTransferRequest"("targetOrganizationId", "status", "createdAt");

CREATE UNIQUE INDEX "InventoryTransferItem_requestId_saleItemId_key"
ON "InventoryTransferItem"("requestId", "saleItemId");

CREATE INDEX "InventoryTransferItem_requestId_importedAt_idx"
ON "InventoryTransferItem"("requestId", "importedAt");

ALTER TABLE "InventoryTransferRequest"
ADD CONSTRAINT "InventoryTransferRequest_sourceOrganizationId_fkey"
FOREIGN KEY ("sourceOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryTransferRequest"
ADD CONSTRAINT "InventoryTransferRequest_targetOrganizationId_fkey"
FOREIGN KEY ("targetOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryTransferRequest"
ADD CONSTRAINT "InventoryTransferRequest_saleId_fkey"
FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryTransferItem"
ADD CONSTRAINT "InventoryTransferItem_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "InventoryTransferRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryTransferItem"
ADD CONSTRAINT "InventoryTransferItem_saleItemId_fkey"
FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryTransferItem"
ADD CONSTRAINT "InventoryTransferItem_importedInventoryItemId_fkey"
FOREIGN KEY ("importedInventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
