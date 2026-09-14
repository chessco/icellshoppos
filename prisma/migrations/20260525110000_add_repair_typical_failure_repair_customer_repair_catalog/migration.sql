-- Add repairCatalogJson to Organization
ALTER TABLE "Organization" ADD COLUMN "repairCatalogJson" JSONB;

-- Create RepairTypicalFailure table
CREATE TABLE "RepairTypicalFailure" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairTypicalFailure_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RepairTypicalFailure_organizationId_name_key" ON "RepairTypicalFailure"("organizationId", "name");
CREATE INDEX "RepairTypicalFailure_organizationId_idx" ON "RepairTypicalFailure"("organizationId");

ALTER TABLE "RepairTypicalFailure" ADD CONSTRAINT "RepairTypicalFailure_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create RepairCustomer table
CREATE TABLE "RepairCustomer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "whatsapp" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairCustomer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RepairCustomer_organizationId_idx" ON "RepairCustomer"("organizationId");

ALTER TABLE "RepairCustomer" ADD CONSTRAINT "RepairCustomer_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add repairCustomerId to RepairTicket
ALTER TABLE "RepairTicket" ADD COLUMN "repairCustomerId" TEXT;

CREATE INDEX "RepairTicket_repairCustomerId_idx" ON "RepairTicket"("repairCustomerId");

ALTER TABLE "RepairTicket" ADD CONSTRAINT "RepairTicket_repairCustomerId_fkey"
    FOREIGN KEY ("repairCustomerId") REFERENCES "RepairCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
