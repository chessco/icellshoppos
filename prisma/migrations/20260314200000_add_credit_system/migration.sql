-- Add creditEnabled to Customer
ALTER TABLE "Customer" ADD COLUMN "creditEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Create CreditLedger table
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleId" TEXT,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX "CreditLedger_organizationId_customerId_createdAt_idx" ON "CreditLedger"("organizationId", "customerId", "createdAt");
CREATE INDEX "CreditLedger_customerId_createdAt_idx" ON "CreditLedger"("customerId", "createdAt");
CREATE INDEX "CreditLedger_saleId_idx" ON "CreditLedger"("saleId");

-- Add foreign keys
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
