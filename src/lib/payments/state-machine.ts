/**
 * Pro Buyer POS Payment System - State Machine
 *
 * Implements strict, auditable state machine transitions for:
 * - PosPaymentStatus: CREATED -> PROCESSING -> SUCCEEDED | FAILED | CANCELED | UNKNOWN
 * - PaymentAttemptStatus: CREATED -> PROCESSING -> SUCCEEDED | FAILED | CANCELED | UNKNOWN
 *
 * Enforces failure recovery rules:
 * - Never blindly retry an UNKNOWN state.
 * - UNKNOWN must be resolved through direct Stripe verification before retrying.
 */

import {
  PosPaymentStatus,
  PaymentAttemptStatus,
  PaymentHandoffStatus,
} from "@prisma/client";

/**
 * Valid transitions for a PosPayment entity
 */
const VALID_PAYMENT_TRANSITIONS: Record<PosPaymentStatus, readonly PosPaymentStatus[]> = {
  CREATED: ["PROCESSING", "CANCELED", "FAILED"],
  PROCESSING: ["SUCCEEDED", "FAILED", "CANCELED", "UNKNOWN"],
  SUCCEEDED: ["REFUNDED", "PARTIALLY_REFUNDED"],
  FAILED: ["CREATED", "PROCESSING", "CANCELED"], // Can retry with a new attempt
  CANCELED: [], // Terminal
  REFUNDED: [], // Terminal
  PARTIALLY_REFUNDED: ["REFUNDED", "PARTIALLY_REFUNDED"],
  UNKNOWN: ["SUCCEEDED", "FAILED", "CANCELED"], // Resolved strictly after backend verification
};

/**
 * Valid transitions for an individual PaymentAttempt
 */
const VALID_ATTEMPT_TRANSITIONS: Record<PaymentAttemptStatus, readonly PaymentAttemptStatus[]> = {
  CREATED: ["PROCESSING", "CANCELED", "FAILED"],
  PROCESSING: ["SUCCEEDED", "FAILED", "CANCELED", "UNKNOWN"],
  SUCCEEDED: [], // Terminal for this specific attempt
  FAILED: [], // Terminal for this attempt (new attempt must be created)
  CANCELED: [], // Terminal for this attempt
  UNKNOWN: ["SUCCEEDED", "FAILED", "CANCELED"], // Resolved after verification
};

/**
 * Valid transitions for a cross-device PaymentHandoff
 */
const VALID_HANDOFF_TRANSITIONS: Record<PaymentHandoffStatus, readonly PaymentHandoffStatus[]> = {
  CREATED: ["WAITING_FOR_DEVICE", "ASSIGNED", "CANCELED", "EXPIRED"],
  WAITING_FOR_DEVICE: ["ASSIGNED", "CANCELED", "EXPIRED"],
  ASSIGNED: ["ACCEPTED", "CANCELED", "EXPIRED", "FAILED"],
  ACCEPTED: ["PAYMENT_PROCESSING", "CANCELED", "FAILED"],
  PAYMENT_PROCESSING: ["VERIFYING", "FAILED", "UNKNOWN"],
  VERIFYING: ["SUCCEEDED", "FAILED", "UNKNOWN"],
  SUCCEEDED: [], // Terminal
  FAILED: [], // Terminal
  CANCELED: [], // Terminal
  EXPIRED: [], // Terminal
  UNKNOWN: ["SUCCEEDED", "FAILED", "CANCELED"], // Resolved after Stripe verification
};

export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly entity: "PosPayment" | "PaymentAttempt" | "PaymentHandoff",
    public readonly fromState: string,
    public readonly toState: string,
    message?: string
  ) {
    super(
      message ||
        `Invalid ${entity} state transition from "${fromState}" to "${toState}".`
    );
    this.name = "InvalidStateTransitionError";
  }
}

/**
 * Checks if a transition between two PosPaymentStatus values is allowed
 */
export function isValidPaymentTransition(
  from: PosPaymentStatus,
  to: PosPaymentStatus
): boolean {
  if (from === to) return true;
  const allowed = VALID_PAYMENT_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

/**
 * Asserts that a PosPayment transition is valid, throwing InvalidStateTransitionError if not
 */
export function assertValidPaymentTransition(
  from: PosPaymentStatus,
  to: PosPaymentStatus
): void {
  if (!isValidPaymentTransition(from, to)) {
    throw new InvalidStateTransitionError("PosPayment", from, to);
  }
}

/**
 * Checks if a transition between two PaymentAttemptStatus values is allowed
 */
export function isValidAttemptTransition(
  from: PaymentAttemptStatus,
  to: PaymentAttemptStatus
): boolean {
  if (from === to) return true;
  const allowed = VALID_ATTEMPT_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

/**
 * Asserts that a PaymentAttempt transition is valid, throwing InvalidStateTransitionError if not
 */
export function assertValidAttemptTransition(
  from: PaymentAttemptStatus,
  to: PaymentAttemptStatus
): void {
  if (!isValidAttemptTransition(from, to)) {
    throw new InvalidStateTransitionError("PaymentAttempt", from, to);
  }
}

/**
 * Checks if a transition between two PaymentHandoffStatus values is allowed
 */
export function isValidHandoffTransition(
  from: PaymentHandoffStatus,
  to: PaymentHandoffStatus
): boolean {
  if (from === to) return true;
  const allowed = VALID_HANDOFF_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

/**
 * Asserts that a PaymentHandoff transition is valid, throwing InvalidStateTransitionError if not
 */
export function assertValidHandoffTransition(
  from: PaymentHandoffStatus,
  to: PaymentHandoffStatus
): void {
  if (!isValidHandoffTransition(from, to)) {
    throw new InvalidStateTransitionError("PaymentHandoff", from, to);
  }
}

/**
 * Maps a Stripe PaymentIntent status to the corresponding Pro Buyer PosPaymentStatus
 */
export function mapStripeIntentStatusToPaymentStatus(
  stripeStatus: string
): PosPaymentStatus {
  switch (stripeStatus) {
    case "succeeded":
      return PosPaymentStatus.SUCCEEDED;
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
    case "processing":
      return PosPaymentStatus.PROCESSING;
    case "canceled":
      return PosPaymentStatus.CANCELED;
    default:
      return PosPaymentStatus.UNKNOWN;
  }
}

/**
 * Maps a Stripe PaymentIntent status to the corresponding Pro Buyer PaymentAttemptStatus
 */
export function mapStripeIntentStatusToAttemptStatus(
  stripeStatus: string
): PaymentAttemptStatus {
  switch (stripeStatus) {
    case "succeeded":
      return PaymentAttemptStatus.SUCCEEDED;
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
    case "processing":
      return PaymentAttemptStatus.PROCESSING;
    case "canceled":
      return PaymentAttemptStatus.CANCELED;
    default:
      return PaymentAttemptStatus.UNKNOWN;
  }
}
