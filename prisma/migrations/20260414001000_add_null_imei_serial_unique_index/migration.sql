-- Enforce uniqueness for serial numbers when IMEI is null.
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryItem_organizationId_serialNumber_when_imei_null_key"
ON "InventoryItem"("organizationId", "serialNumber")
WHERE "imei" IS NULL AND "serialNumber" IS NOT NULL;
