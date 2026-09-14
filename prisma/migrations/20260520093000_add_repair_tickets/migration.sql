CREATE TYPE "RepairStage" AS ENUM ('receive', 'diagnosis', 'repairing', 'ready_for_pickup', 'completed', 'cancelled');

CREATE TYPE "RepairStatus" AS ENUM (
  'received',
  'pending_diagnosis',
  'quoted',
  'awaiting_approval',
  'approved',
  'disassembled',
  'parts_ordered',
  'parts_received',
  'working',
  'testing',
  'ready_for_pickup',
  'picked_up',
  'cancelled'
);

CREATE TABLE "RepairTicket" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "customerId" TEXT,
  "assignedTechnicianId" TEXT,
  "completedSaleId" TEXT,
  "supplierId" TEXT,
  "repairNumber" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "color" TEXT,
  "imei" TEXT,
  "extrasJson" JSONB,
  "notes" TEXT,
  "intakeFailuresJson" JSONB,
  "intakeDiagnosisText" TEXT,
  "possibleFixText" TEXT,
  "diagnosisText" TEXT,
  "diagnosisPending" BOOLEAN NOT NULL DEFAULT true,
  "quotedTotal" DECIMAL(12, 2),
  "partsCost" DECIMAL(12, 2),
  "stage" "RepairStage" NOT NULL DEFAULT 'receive',
  "status" "RepairStatus" NOT NULL DEFAULT 'received',
  "customerName" TEXT NOT NULL,
  "customerWhatsapp" TEXT NOT NULL,
  "customerEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "readyForPickupAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "RepairTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RepairTicketPart" (
  "id" TEXT NOT NULL,
  "repairTicketId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitCost" DECIMAL(12, 2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RepairTicketPart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RepairTicketStatusLog" (
  "id" TEXT NOT NULL,
  "repairTicketId" TEXT NOT NULL,
  "changedByUserId" TEXT,
  "stage" "RepairStage" NOT NULL,
  "status" "RepairStatus" NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RepairTicketStatusLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RepairTicket_organizationId_repairNumber_key" ON "RepairTicket"("organizationId", "repairNumber");
CREATE INDEX "RepairTicket_organizationId_stage_createdAt_idx" ON "RepairTicket"("organizationId", "stage", "createdAt");
CREATE INDEX "RepairTicket_organizationId_status_createdAt_idx" ON "RepairTicket"("organizationId", "status", "createdAt");
CREATE INDEX "RepairTicket_customerId_idx" ON "RepairTicket"("customerId");
CREATE INDEX "RepairTicket_assignedTechnicianId_idx" ON "RepairTicket"("assignedTechnicianId");
CREATE INDEX "RepairTicketPart_repairTicketId_createdAt_idx" ON "RepairTicketPart"("repairTicketId", "createdAt");
CREATE INDEX "RepairTicketStatusLog_repairTicketId_createdAt_idx" ON "RepairTicketStatusLog"("repairTicketId", "createdAt");
CREATE INDEX "RepairTicketStatusLog_changedByUserId_createdAt_idx" ON "RepairTicketStatusLog"("changedByUserId", "createdAt");

ALTER TABLE "RepairTicket" ADD CONSTRAINT "RepairTicket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepairTicket" ADD CONSTRAINT "RepairTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RepairTicket" ADD CONSTRAINT "RepairTicket_assignedTechnicianId_fkey" FOREIGN KEY ("assignedTechnicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RepairTicket" ADD CONSTRAINT "RepairTicket_completedSaleId_fkey" FOREIGN KEY ("completedSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RepairTicket" ADD CONSTRAINT "RepairTicket_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RepairTicketPart" ADD CONSTRAINT "RepairTicketPart_repairTicketId_fkey" FOREIGN KEY ("repairTicketId") REFERENCES "RepairTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepairTicketStatusLog" ADD CONSTRAINT "RepairTicketStatusLog_repairTicketId_fkey" FOREIGN KEY ("repairTicketId") REFERENCES "RepairTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepairTicketStatusLog" ADD CONSTRAINT "RepairTicketStatusLog_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;