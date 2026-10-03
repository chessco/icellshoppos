-- CreateEnum
CREATE TYPE "POSDeviceType" AS ENUM ('IPAD_POS', 'IPHONE_TAP_TO_PAY', 'DESKTOP_POS', 'OTHER');

-- CreateEnum
CREATE TYPE "PosPaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'CARD', 'STORE_CREDIT', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('STRIPE_READER', 'STRIPE_TAP_TO_PAY_IPHONE', 'MANUAL_REGISTER', 'OTHER');

-- CreateEnum
CREATE TYPE "PosPaymentStatus" AS ENUM ('CREATED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('CREATED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "POSDevice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT,
    "deviceName" TEXT NOT NULL,
    "deviceType" "POSDeviceType" NOT NULL DEFAULT 'IPAD_POS',
    "deviceUuid" TEXT NOT NULL,
    "appVersion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "POSDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeReader" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT,
    "posDeviceId" TEXT,
    "stripeReaderId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "serialNumber" TEXT,
    "deviceType" TEXT,
    "connectionType" TEXT NOT NULL DEFAULT 'BLUETOOTH',
    "ipAddress" TEXT,
    "locationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ONLINE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeReader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "saleId" TEXT,
    "posDeviceId" TEXT,
    "paymentMethod" "PosPaymentMethod" NOT NULL,
    "paymentChannel" "PaymentChannel" NOT NULL DEFAULT 'MANUAL_REGISTER',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "status" "PosPaymentStatus" NOT NULL DEFAULT 'CREATED',
    "idempotencyKey" TEXT NOT NULL,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "channel" "PaymentChannel" NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
    "stripePaymentIntentId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "rawResponseJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripePaymentRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "posPaymentId" TEXT NOT NULL,
    "paymentAttemptId" TEXT,
    "stripeReaderId" TEXT,
    "stripePaymentIntentId" TEXT NOT NULL,
    "stripeChargeId" TEXT,
    "stripeCustomerId" TEXT,
    "stripeLocationId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "status" TEXT NOT NULL,
    "channel" "PaymentChannel" NOT NULL,
    "cardBrand" TEXT,
    "cardLast4" TEXT,
    "cardEntryMethod" TEXT,
    "receiptUrl" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripePaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "stripeEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "payloadJson" JSONB NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosRefund" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "saleId" TEXT,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "stripeRefundId" TEXT,
    "requestedByUserId" TEXT,
    "authorizedByUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "POSDevice_organizationId_status_idx" ON "POSDevice"("organizationId", "status");

-- CreateIndex
CREATE INDEX "POSDevice_siteId_idx" ON "POSDevice"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "POSDevice_organizationId_deviceUuid_key" ON "POSDevice"("organizationId", "deviceUuid");

-- CreateIndex
CREATE INDEX "StripeReader_organizationId_status_idx" ON "StripeReader"("organizationId", "status");

-- CreateIndex
CREATE INDEX "StripeReader_posDeviceId_idx" ON "StripeReader"("posDeviceId");

-- CreateIndex
CREATE INDEX "StripeReader_siteId_idx" ON "StripeReader"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeReader_organizationId_stripeReaderId_key" ON "StripeReader"("organizationId", "stripeReaderId");

-- CreateIndex
CREATE INDEX "PosPayment_organizationId_status_createdAt_idx" ON "PosPayment"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PosPayment_saleId_idx" ON "PosPayment"("saleId");

-- CreateIndex
CREATE INDEX "PosPayment_posDeviceId_idx" ON "PosPayment"("posDeviceId");

-- CreateIndex
CREATE INDEX "PosPayment_createdByUserId_idx" ON "PosPayment"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PosPayment_organizationId_idempotencyKey_key" ON "PosPayment"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentAttempt_paymentId_attemptNumber_idx" ON "PaymentAttempt"("paymentId", "attemptNumber");

-- CreateIndex
CREATE INDEX "PaymentAttempt_stripePaymentIntentId_idx" ON "PaymentAttempt"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_status_idx" ON "PaymentAttempt"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StripePaymentRecord_posPaymentId_key" ON "StripePaymentRecord"("posPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "StripePaymentRecord_stripePaymentIntentId_key" ON "StripePaymentRecord"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "StripePaymentRecord_organizationId_stripePaymentIntentId_idx" ON "StripePaymentRecord"("organizationId", "stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "StripePaymentRecord_stripeReaderId_idx" ON "StripePaymentRecord"("stripeReaderId");

-- CreateIndex
CREATE INDEX "StripePaymentRecord_paymentAttemptId_idx" ON "StripePaymentRecord"("paymentAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeWebhookEvent_stripeEventId_key" ON "StripeWebhookEvent"("stripeEventId");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_stripeEventId_idx" ON "StripeWebhookEvent"("stripeEventId");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_eventType_processed_idx" ON "StripeWebhookEvent"("eventType", "processed");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_organizationId_createdAt_idx" ON "StripeWebhookEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "PosRefund_organizationId_createdAt_idx" ON "PosRefund"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "PosRefund_paymentId_idx" ON "PosRefund"("paymentId");

-- CreateIndex
CREATE INDEX "PosRefund_saleId_idx" ON "PosRefund"("saleId");

-- AddForeignKey
ALTER TABLE "POSDevice" ADD CONSTRAINT "POSDevice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POSDevice" ADD CONSTRAINT "POSDevice_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripeReader" ADD CONSTRAINT "StripeReader_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripeReader" ADD CONSTRAINT "StripeReader_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripeReader" ADD CONSTRAINT "StripeReader_posDeviceId_fkey" FOREIGN KEY ("posDeviceId") REFERENCES "POSDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosPayment" ADD CONSTRAINT "PosPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosPayment" ADD CONSTRAINT "PosPayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosPayment" ADD CONSTRAINT "PosPayment_posDeviceId_fkey" FOREIGN KEY ("posDeviceId") REFERENCES "POSDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosPayment" ADD CONSTRAINT "PosPayment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PosPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripePaymentRecord" ADD CONSTRAINT "StripePaymentRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripePaymentRecord" ADD CONSTRAINT "StripePaymentRecord_posPaymentId_fkey" FOREIGN KEY ("posPaymentId") REFERENCES "PosPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripePaymentRecord" ADD CONSTRAINT "StripePaymentRecord_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripePaymentRecord" ADD CONSTRAINT "StripePaymentRecord_stripeReaderId_fkey" FOREIGN KEY ("stripeReaderId") REFERENCES "StripeReader"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripeWebhookEvent" ADD CONSTRAINT "StripeWebhookEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosRefund" ADD CONSTRAINT "PosRefund_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosRefund" ADD CONSTRAINT "PosRefund_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosRefund" ADD CONSTRAINT "PosRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PosPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosRefund" ADD CONSTRAINT "PosRefund_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosRefund" ADD CONSTRAINT "PosRefund_authorizedByUserId_fkey" FOREIGN KEY ("authorizedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
