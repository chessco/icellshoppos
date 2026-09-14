ALTER TABLE "InventoryItem"
ADD COLUMN "grade" TEXT;

UPDATE "InventoryItem"
SET "grade" = "condition"
WHERE "grade" IS NULL
  AND "condition" IS NOT NULL
  AND BTRIM("condition") <> '';
