/**
 * iReader Multiplatform Architecture v2.0 - POS Payment & Capabilities Contracts
 *
 * Canonical contracts for:
 *  - Multi-tenant Payment Capabilities (Tenant / Site level)
 *  - POS Device Identity
 *  - Stripe Reader records & operational discovery states
 *  - Stripe Terminal payment intents & authoritative verification
 */

export interface IPaymentCapabilities {
  cashEnabled: boolean;
  transferEnabled: boolean;
  cardEnabled: boolean;
  stripeReaderEnabled: boolean;
  stripeTapToPayEnabled: boolean;
  creditEnabled: boolean;
  otherEnabled: boolean;
  defaultMethod?: string;
  stripeLocationId?: string | null;
  currency?: string;
}

export type StripeTerminalOperationalState =
  | "NO_READER"
  | "DISCOVERING"
  | "READERS_FOUND"
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "CHECKING_DEVICE"
  | "PREPARING_TAP_TO_PAY"
  | "WAITING_FOR_CUSTOMER"
  | "PROCESSING_PAYMENT"
  | "VERIFYING_PAYMENT"
  | "WAITING_FOR_CARD"
  | "PROCESSING"
  | "VERIFYING"
  | "PAYMENT_SUCCEEDED"
  | "PAYMENT_FAILED"
  | "PAYMENT_CANCELED"
  | "PAYMENT_UNKNOWN"
  | "ERROR";

export interface IStripeReaderInfo {
  id: string;
  stripeReaderId?: string;
  label: string;
  serialNumber: string;
  deviceType: string;
  status: "ONLINE" | "OFFLINE" | "IN_USE" | "DISCONNECTED" | "UPDATING";
  ipAddress?: string | null;
  batteryLevel?: number | null;
  stripeLocationId?: string | null;
  lastSeenAt?: string | null;
}

export interface IPOSDeviceInfo {
  id: string;
  deviceUuid: string;
  deviceName: string;
  deviceType: "IPAD_POS" | "IPHONE_TAP_TO_PAY" | "IPHONE_TAP" | "DESKTOP_POS" | "WEB_POS" | "OTHER";
  isActive: boolean;
  lastSeenAt?: string | null;
  currentReaderId?: string | null;
  currentReader?: IStripeReaderInfo | null;
}

export interface IConnectionTokenResponse {
  secret: string;
}

export interface ICreatePaymentIntentPayload {
  saleId: string;
  amount: number;
  currency?: string;
  posDeviceId?: string;
  stripeReaderId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  idempotencyKey?: string;
}

export interface ICreatePaymentIntentResponse {
  ok: boolean;
  paymentIntentId: string;
  clientSecret: string;
  posPaymentId: string;
  paymentAttemptId: string;
  amount: number;
  currency: string;
  status: string;
  idempotentReplay?: boolean;
  error?: string;
}

export interface IVerifyPaymentStatusPayload {
  paymentIntentId: string;
  paymentAttemptId?: string;
  saleId?: string;
  posDeviceId?: string;
}

export interface IVerifyPaymentStatusResponse {
  ok: boolean;
  status: "SUCCEEDED" | "FAILED" | "UNKNOWN" | "PROCESSING" | "REQUIRES_PAYMENT_METHOD" | "CANCELED";
  paymentAttemptStatus: string;
  posPaymentStatus: string;
  saleId?: string;
  amount?: number;
  currency?: string;
  cardBrand?: string;
  cardLast4?: string;
  receiptUrl?: string;
  error?: string;
  isUnknown?: boolean;
}

export type PaymentHandoffStatusType =
  | "CREATED"
  | "WAITING_FOR_DEVICE"
  | "ASSIGNED"
  | "ACCEPTED"
  | "PAYMENT_PROCESSING"
  | "VERIFYING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED"
  | "EXPIRED"
  | "UNKNOWN";

export interface IPaymentHandoffInfo {
  id: string;
  organizationId: string;
  siteId?: string | null;
  saleId?: string | null;
  saleNumber?: string | null;
  posPaymentId: string;
  paymentAttemptId?: string | null;
  sourceDeviceId?: string | null;
  sourceDeviceName?: string | null;
  targetDeviceId?: string | null;
  targetDeviceName?: string | null;
  requestedByUserId?: string | null;
  acceptedByUserId?: string | null;
  channel: string;
  amount: number;
  currency: string;
  status: PaymentHandoffStatusType;
  expiresAt: string;
  acceptedAt?: string | null;
  completedAt?: string | null;
  canceledAt?: string | null;
  clientSecret?: string | null;
  stripePaymentIntentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateHandoffPayload {
  saleId?: string;
  posPaymentId?: string;
  sourceDeviceId?: string;
  targetDeviceId?: string;
  amount: number;
  currency?: string;
  idempotencyKey?: string;
  notes?: string;
}

export interface ICreateHandoffResponse {
  ok: boolean;
  handoffId: string;
  handoff: IPaymentHandoffInfo;
  error?: string;
}

export interface IAcceptHandoffPayload {
  targetDeviceId?: string;
}

export interface IAcceptHandoffResponse {
  ok: boolean;
  handoff: IPaymentHandoffInfo;
  clientSecret?: string;
  paymentIntentId?: string;
  error?: string;
}

export interface IAvailableTargetDevice {
  id: string;
  deviceUuid: string;
  deviceName: string;
  deviceType: "IPHONE_TAP_TO_PAY";
  status: "ACTIVE" | "INACTIVE" | "BUSY" | "AVAILABLE";
  lastSeenAt?: string;
  isAvailable: boolean;
}

