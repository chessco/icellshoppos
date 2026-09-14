CREATE TABLE "Site" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Site_organizationId_name_key" ON "Site"("organizationId", "name");
CREATE INDEX "Site_organizationId_idx" ON "Site"("organizationId");

ALTER TABLE "Site"
ADD CONSTRAINT "Site_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryItem" ADD COLUMN "siteId" TEXT;

INSERT INTO "Site" ("id", "organizationId", "name", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o."id", 'Main', 'Active', NOW(), NOW()
FROM "Organization" o
WHERE NOT EXISTS (
  SELECT 1 FROM "Site" s
  WHERE s."organizationId" = o."id" AND lower(s."name") = 'main'
);

UPDATE "InventoryItem" i
SET "siteId" = s."id"
FROM "Site" s
WHERE s."organizationId" = i."organizationId"
  AND lower(s."name") = 'main'
  AND i."siteId" IS NULL;

ALTER TABLE "InventoryItem" ALTER COLUMN "siteId" SET NOT NULL;

ALTER TABLE "InventoryItem"
ADD CONSTRAINT "InventoryItem_siteId_fkey"
FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "InventoryItem_organizationId_siteId_idx" ON "InventoryItem"("organizationId", "siteId");
