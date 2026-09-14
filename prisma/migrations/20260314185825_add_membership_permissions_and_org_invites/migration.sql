-- AlterTable
ALTER TABLE "InventoryTransferRequest" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "permissionsJson" JSONB;

-- AlterTable
ALTER TABLE "Site" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "OrganizationInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'staff',
    "permissionsJson" JSONB,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedByUserId" TEXT,
    "acceptedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationInvite_tokenHash_key" ON "OrganizationInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "OrganizationInvite_organizationId_status_createdAt_idx" ON "OrganizationInvite"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OrganizationInvite_email_status_expiresAt_idx" ON "OrganizationInvite"("email", "status", "expiresAt");

-- AddForeignKey
ALTER TABLE "OrganizationInvite" ADD CONSTRAINT "OrganizationInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "InventoryTransferRequest_sourceOrganizationId_targetOrganizatio" RENAME TO "InventoryTransferRequest_sourceOrganizationId_targetOrganiz_key";

-- RenameIndex
ALTER INDEX "InventoryTransferRequest_targetOrganizationId_status_createdAt_" RENAME TO "InventoryTransferRequest_targetOrganizationId_status_create_idx";
