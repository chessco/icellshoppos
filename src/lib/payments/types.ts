/**
 * Pro Buyer POS Payment System - Domain Types & Enums
 *
 * Implements canonical domain definitions for:
 * - Payment Methods (CASH, TRANSFER, CARD, STORE_CREDIT, OTHER)
 * - Payment Channels (STRIPE_READER, STRIPE_TAP_TO_PAY_IPHONE, MANUAL_REGISTER)
 * - POS Devices (IPAD_POS, IPHONE_TAP_TO_PAY, DESKTOP_POS)
 * - Payment and Attempt State Machine definitions
 */

import {
  POSDeviceType,
  PosPaymentMethod,
  PaymentChannel,
  PosPaymentStatus,
  PaymentAttemptStatus,
  PaymentHandoffStatus,
} from "@prisma/client";

export {
  POSDeviceType,
  PosPaymentMethod,
  PaymentChannel,
  PosPaymentStatus,
  PaymentAttemptStatus,
  PaymentHandoffStatus,
};

export interface Money {
  amountCents: number; // Integer minor units (e.g. 10000 = $100.00 MXN)
  currency: string; // ISO 4217, lowercase (e.g. "mxn")
  decimalAmount: number; // Major unit (e.g. 100.00)
}

export interface PaymentCartItem {
  inventoryItemId?: string;
  imei?: string;
  salePrice: number;
  cost?: number;
}

export interface CreatePaymentIntentParams {
  organizationId: string;
  userId: string;
  saleId?: string;
  amount: number; // Decimal major units (e.g. 1500.50 MXN)
  currency?: string; // Default "mxn"
  channel: PaymentChannel;
  posDeviceId?: string;
  stripeReaderId?: string;
  idempotencyKey: string;
  notes?: string;
  cartContext?: {
    items: PaymentCartItem[];
    discount?: number;
  };
}

export interface VerifyPaymentStatusParams {
  organizationId: string;
  paymentIntentId?: string;
  paymentAttemptId?: string;
  posPaymentId?: string;
}

export interface CancelPaymentIntentParams {
  organizationId: string;
  paymentIntentId?: string;
  posPaymentId?: string;
  reason?: string;
}

export interface PaymentIntentResult {
  success: boolean;
  posPaymentId: string;
  paymentAttemptId: string;
  stripePaymentIntentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
  status: PosPaymentStatus;
  channel: PaymentChannel;
  idempotentReplay?: boolean;
}

export interface PaymentVerificationResult {
  success: boolean;
  posPaymentId: string;
  paymentAttemptId?: string;
  stripePaymentIntentId: string;
  status: PosPaymentStatus;
  attemptStatus: PaymentAttemptStatus;
  amount: number;
  currency: string;
  cardBrand?: string | null;
  cardLast4?: string | null;
  cardEntryMethod?: string | null;
  isOrphan: boolean;
  saleId?: string | null;
  message?: string;
}

export interface StripeMetadataPayload {
  organizationId: string;
  saleId?: string;
  posPaymentId: string;
  paymentAttemptId: string;
  posDeviceId?: string;
  paymentChannel: string;
  environment?: string;
}
