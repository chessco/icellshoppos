ALTER TABLE "ExternalIntegrationCredential"
ADD COLUMN "balance" DECIMAL(12,2),
ADD COLUMN "balanceUpdatedAt" TIMESTAMP(3);
