import test from "node:test";
import assert from "node:assert/strict";
import { PosPaymentStatus, PaymentAttemptStatus, PaymentChannel, POSDeviceType } from "@prisma/client";
import {
  normalizePaymentCapabilities,
  resolvePaymentCapabilities,
  type PaymentCapabilitiesConfig,
} from "../src/lib/payments/payment-capabilities";
import {
  isValidPaymentTransition,
  isValidAttemptTransition,
  mapStripeIntentStatusToAttemptStatus,
  mapStripeIntentStatusToPaymentStatus,
} from "../src/lib/payments/state-machine";

test("PAYMENT-04 — Tap to Pay on iPhone Capabilities & Device Validation", async (t) => {
  await t.test("Tenant with Tap to Pay enabled normalizes tapToPayIPhoneEnabled = true", () => {
    const orgConfig: PaymentCapabilitiesConfig = {
      cashEnabled: true,
      transferEnabled: true,
      stripeReaderEnabled: false,
      tapToPayIPhoneEnabled: true,
      creditEnabled: true,
      otherEnabled: true,
      defaultMethod: "Card",
      currency: "MXN",
    };

    const resolved = normalizePaymentCapabilities(orgConfig);
    assert.strictEqual(resolved.cashEnabled, true);
    assert.strictEqual(resolved.transferEnabled, true);
    assert.strictEqual(resolved.stripeReaderEnabled, false);
    assert.strictEqual(resolved.tapToPayIPhoneEnabled, true);
  });

  await t.test("Tenant without Tap to Pay keeps tapToPayIPhoneEnabled = false (Opt-in isolation)", () => {
    const orgConfig = {
      cashEnabled: true,
      transferEnabled: true,
      stripeReaderEnabled: false,
    };

    const resolved = normalizePaymentCapabilities(orgConfig);
    assert.strictEqual(resolved.tapToPayIPhoneEnabled, false);
    assert.strictEqual(resolved.stripeReaderEnabled, false);
  });

  await t.test("Site-level override can activate Tap to Pay for specific branch", () => {
    const orgConfig = {
      cashEnabled: true,
      transferEnabled: true,
      tapToPayIPhoneEnabled: false,
    };

    const siteOverride = {
      tapToPayIPhoneEnabled: true,
      stripeLocationId: "loc_mx_cdmx_branch_02",
    };

    const resolved = normalizePaymentCapabilities(orgConfig, siteOverride);
    assert.strictEqual(resolved.tapToPayIPhoneEnabled, true);
    assert.strictEqual(resolved.stripeLocationId, "loc_mx_cdmx_branch_02");
  });
});

test("PAYMENT-04 — Tap to Pay State Machine & Payment Channel Integrity", async (t) => {
  await t.test("PaymentChannel enum recognizes STRIPE_TAP_TO_PAY_IPHONE as a valid channel", () => {
    assert.strictEqual(PaymentChannel.STRIPE_TAP_TO_PAY_IPHONE, "STRIPE_TAP_TO_PAY_IPHONE");
    assert.strictEqual(PaymentChannel.STRIPE_READER, "STRIPE_READER");
  });

  await t.test("POSDeviceType enum recognizes IPHONE_TAP_TO_PAY as an authorized device type", () => {
    assert.strictEqual(POSDeviceType.IPHONE_TAP_TO_PAY, "IPHONE_TAP_TO_PAY");
    assert.strictEqual(POSDeviceType.IPAD_POS, "IPAD_POS");
  });

  await t.test("Tap to Pay in-flight network loss transitions to UNKNOWN instead of FAILED", () => {
    // Attempt moves from CREATED -> PROCESSING
    assert.strictEqual(isValidAttemptTransition(PaymentAttemptStatus.CREATED, PaymentAttemptStatus.PROCESSING), true);

    // Network timeout during contactless processing -> UNKNOWN
    assert.strictEqual(isValidAttemptTransition(PaymentAttemptStatus.PROCESSING, PaymentAttemptStatus.UNKNOWN), true);
  });

  await t.test("Tap to Pay authoritative verification resolves UNKNOWN to SUCCEEDED once Stripe confirms", () => {
    assert.strictEqual(isValidAttemptTransition(PaymentAttemptStatus.UNKNOWN, PaymentAttemptStatus.SUCCEEDED), true);
    assert.strictEqual(isValidPaymentTransition(PosPaymentStatus.UNKNOWN, PosPaymentStatus.SUCCEEDED), true);
  });
});
