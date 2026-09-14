ALTER TABLE "ExternalIntegrationCredential"
ADD COLUMN "servicePricingJson" JSONB,
ADD COLUMN "pricingUpdatedAt" TIMESTAMP(3);
