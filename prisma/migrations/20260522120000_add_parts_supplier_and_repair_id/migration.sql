CREATE TABLE "PartsSupplier" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PartsSupplier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartsSupplier_organizationId_name_key" ON "PartsSupplier"("organizationId", "name");
CREATE INDEX "PartsSupplier_organizationId_idx" ON "PartsSupplier"("organizationId");

ALTER TABLE "RepairTicket" ADD COLUMN "partsSupplierId" TEXT;
ALTER TABLE "RepairTicket" ADD COLUMN "repairId" TEXT;

INSERT INTO "PartsSupplier" ("id", "organizationId", "name", "status", "createdAt", "updatedAt")
SELECT "id", "organizationId", "name", "status", "createdAt", "updatedAt"
FROM "Supplier"
ON CONFLICT ("id") DO NOTHING;

UPDATE "RepairTicket"
SET "partsSupplierId" = "supplierId"
WHERE "supplierId" IS NOT NULL;

UPDATE "RepairTicket"
SET "repairId" = COALESCE(NULLIF("repairNumber", ''), ('REP-' || SUBSTRING("id" FROM 1 FOR 8)))
WHERE "repairId" IS NULL;

ALTER TABLE "RepairTicket" ALTER COLUMN "repairId" SET NOT NULL;

CREATE UNIQUE INDEX "RepairTicket_organizationId_repairId_key" ON "RepairTicket"("organizationId", "repairId");
CREATE INDEX "RepairTicket_partsSupplierId_idx" ON "RepairTicket"("partsSupplierId");

ALTER TABLE "PartsSupplier" ADD CONSTRAINT "PartsSupplier_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RepairTicket" ADD CONSTRAINT "RepairTicket_partsSupplierId_fkey"
FOREIGN KEY ("partsSupplierId") REFERENCES "PartsSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RepairTicket" DROP CONSTRAINT "RepairTicket_supplierId_fkey";
ALTER TABLE "RepairTicket" DROP COLUMN "supplierId";
