CREATE TABLE "ImeiCheck2RequestLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "imei" TEXT,
    "imeisJson" JSONB,
    "orderId" INTEGER,
    "status" TEXT,
    "charged" DECIMAL(12,4),
    "balance" DECIMAL(12,4),
    "responseJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImeiCheck2RequestLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImeiCheck2RequestLog_organizationId_createdAt_idx"
ON "ImeiCheck2RequestLog"("organizationId", "createdAt");

ALTER TABLE "ImeiCheck2RequestLog"
ADD CONSTRAINT "ImeiCheck2RequestLog_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
