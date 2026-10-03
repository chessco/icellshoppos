import test from "node:test";
import assert from "node:assert/strict";
import { PosPaymentStatus, PaymentAttemptStatus } from "@prisma/client";
import {
  isValidPaymentTransition,
  assertValidPaymentTransition,
  isValidAttemptTransition,
  assertValidAttemptTransition,
  InvalidStateTransitionError,
  mapStripeIntentStatusToPaymentStatus,
  mapStripeIntentStatusToAttemptStatus,
} from "../src/lib/payments/state-machine";

test("Payment State Machine: Valid PosPayment transitions", () => {
  // CREATED transitions
  assert.equal(isValidPaymentTransition(PosPaymentStatus.CREATED, PosPaymentStatus.PROCESSING), true);
  assert.equal(isValidPaymentTransition(PosPaymentStatus.CREATED, PosPaymentStatus.FAILED), true);
  assert.equal(isValidPaymentTransition(PosPaymentStatus.CREATED, PosPaymentStatus.CANCELED), true);

  // PROCESSING transitions
  assert.equal(isValidPaymentTransition(PosPaymentStatus.PROCESSING, PosPaymentStatus.SUCCEEDED), true);
  assert.equal(isValidPaymentTransition(PosPaymentStatus.PROCESSING, PosPaymentStatus.FAILED), true);
  assert.equal(isValidPaymentTransition(PosPaymentStatus.PROCESSING, PosPaymentStatus.CANCELED), true);
  assert.equal(isValidPaymentTransition(PosPaymentStatus.PROCESSING, PosPaymentStatus.UNKNOWN), true);

  // SUCCEEDED transitions (refunds)
  assert.equal(isValidPaymentTransition(PosPaymentStatus.SUCCEEDED, PosPaymentStatus.REFUNDED), true);
  assert.equal(isValidPaymentTransition(PosPaymentStatus.SUCCEEDED, PosPaymentStatus.PARTIALLY_REFUNDED), true);

  // UNKNOWN transitions (strictly resolved after direct verification)
  assert.equal(isValidPaymentTransition(PosPaymentStatus.UNKNOWN, PosPaymentStatus.SUCCEEDED), true);
  assert.equal(isValidPaymentTransition(PosPaymentStatus.UNKNOWN, PosPaymentStatus.FAILED), true);
  assert.equal(isValidPaymentTransition(PosPaymentStatus.UNKNOWN, PosPaymentStatus.CANCELED), true);

  // Same state is always valid (no-op)
  assert.equal(isValidPaymentTransition(PosPaymentStatus.SUCCEEDED, PosPaymentStatus.SUCCEEDED), true);
});

test("Payment State Machine: Invalid PosPayment transitions reject & throw", () => {
  // Cannot jump from CREATED directly to SUCCEEDED without processing
  assert.equal(isValidPaymentTransition(PosPaymentStatus.CREATED, PosPaymentStatus.SUCCEEDED), false);
  assert.throws(
    () => assertValidPaymentTransition(PosPaymentStatus.CREATED, PosPaymentStatus.SUCCEEDED),
    InvalidStateTransitionError
  );

  // Terminal CANCELED state cannot transition to SUCCEEDED
  assert.equal(isValidPaymentTransition(PosPaymentStatus.CANCELED, PosPaymentStatus.SUCCEEDED), false);
  assert.throws(
    () => assertValidPaymentTransition(PosPaymentStatus.CANCELED, PosPaymentStatus.SUCCEEDED),
    InvalidStateTransitionError
  );

  // Terminal REFUNDED state cannot transition to CREATED or PROCESSING
  assert.equal(isValidPaymentTransition(PosPaymentStatus.REFUNDED, PosPaymentStatus.PROCESSING), false);

  // UNKNOWN state CANNOT transition back to CREATED (no blind reset)
  assert.equal(isValidPaymentTransition(PosPaymentStatus.UNKNOWN, PosPaymentStatus.CREATED), false);
  assert.throws(
    () => assertValidPaymentTransition(PosPaymentStatus.UNKNOWN, PosPaymentStatus.CREATED),
    InvalidStateTransitionError
  );
});

test("Payment Attempt State Machine: Valid & Invalid transitions", () => {
  assert.equal(isValidAttemptTransition(PaymentAttemptStatus.CREATED, PaymentAttemptStatus.PROCESSING), true);
  assert.equal(isValidAttemptTransition(PaymentAttemptStatus.PROCESSING, PaymentAttemptStatus.SUCCEEDED), true);
  assert.equal(isValidAttemptTransition(PaymentAttemptStatus.PROCESSING, PaymentAttemptStatus.UNKNOWN), true);

  // Terminal attempt SUCCEEDED cannot transition to FAILED
  assert.equal(isValidAttemptTransition(PaymentAttemptStatus.SUCCEEDED, PaymentAttemptStatus.FAILED), false);
  assert.throws(
    () => assertValidAttemptTransition(PaymentAttemptStatus.SUCCEEDED, PaymentAttemptStatus.FAILED),
    InvalidStateTransitionError
  );
});

test("Payment State Machine: Stripe Intent Status Mapping", () => {
  assert.equal(mapStripeIntentStatusToPaymentStatus("succeeded"), PosPaymentStatus.SUCCEEDED);
  assert.equal(mapStripeIntentStatusToPaymentStatus("requires_payment_method"), PosPaymentStatus.PROCESSING);
  assert.equal(mapStripeIntentStatusToPaymentStatus("requires_confirmation"), PosPaymentStatus.PROCESSING);
  assert.equal(mapStripeIntentStatusToPaymentStatus("canceled"), PosPaymentStatus.CANCELED);
  assert.equal(mapStripeIntentStatusToPaymentStatus("unknown_weird_status"), PosPaymentStatus.UNKNOWN);

  assert.equal(mapStripeIntentStatusToAttemptStatus("succeeded"), PaymentAttemptStatus.SUCCEEDED);
  assert.equal(mapStripeIntentStatusToAttemptStatus("requires_action"), PaymentAttemptStatus.PROCESSING);
  assert.equal(mapStripeIntentStatusToAttemptStatus("canceled"), PaymentAttemptStatus.CANCELED);
});
