ALTER TABLE "InventoryItem"
ADD COLUMN IF NOT EXISTS "sku" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryItem_organizationId_sku_key"
ON "InventoryItem"("organizationId", "sku");
