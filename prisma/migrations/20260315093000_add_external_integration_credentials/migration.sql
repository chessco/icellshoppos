CREATE TABLE "ExternalIntegrationCredential" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL,
    "keyLast4" TEXT NOT NULL,
    "confirmationToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalIntegrationCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalIntegrationCredential_organizationId_provider_key"
ON "ExternalIntegrationCredential"("organizationId", "provider");

CREATE INDEX "ExternalIntegrationCredential_provider_idx"
ON "ExternalIntegrationCredential"("provider");

CREATE INDEX "ExternalIntegrationCredential_organizationId_provider_idx"
ON "ExternalIntegrationCredential"("organizationId", "provider");

ALTER TABLE "ExternalIntegrationCredential"
ADD CONSTRAINT "ExternalIntegrationCredential_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
