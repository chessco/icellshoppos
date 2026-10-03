import test from "node:test";
import assert from "node:assert/strict";
import { PosPaymentStatus, PaymentAttemptStatus } from "@prisma/client";
import {
  normalizePaymentCapabilities,
  resolvePaymentCapabilities,
  DEFAULT_PAYMENT_CAPABILITIES,
  type PaymentCapabilitiesConfig,
} from "../src/lib/payments/payment-capabilities";
import {
  isValidPaymentTransition,
  isValidAttemptTransition,
  assertValidPaymentTransition,
  assertValidAttemptTransition,
  mapStripeIntentStatusToAttemptStatus,
  mapStripeIntentStatusToPaymentStatus,
} from "../src/lib/payments/state-machine";

test("PaymentCapabilities — Multi-Tenant & Safe Defaults", async (t) => {
  await t.test("Default capabilities has Stripe Reader disabled (Stripe is optional)", () => {
    const caps = normalizePaymentCapabilities(null);
    assert.strictEqual(caps.cashEnabled, true);
    assert.strictEqual(caps.transferEnabled, true);
    assert.strictEqual(caps.stripeReaderEnabled, false);
    assert.strictEqual(caps.tapToPayIPhoneEnabled, false);
    assert.strictEqual(caps.defaultMethod, "Cash");
  });

  await t.test("Tenant A (Without Stripe) operates purely on Cash & Transfer without Stripe configuration", () => {
    const tenantAOrg = {
      cashEnabled: true,
      transferEnabled: true,
      stripeReaderEnabled: false,
      tapToPayIPhoneEnabled: false,
      creditEnabled: true,
      otherEnabled: true,
      defaultMethod: "Cash",
    };

    const resolved = normalizePaymentCapabilities(tenantAOrg);
    assert.strictEqual(resolved.cashEnabled, true);
    assert.strictEqual(resolved.transferEnabled, true);
    assert.strictEqual(resolved.stripeReaderEnabled, false);
    assert.strictEqual(resolved.stripeLocationId, undefined);
  });

  await t.test("Tenant B (With Stripe Reader) activates Stripe Terminal channel", () => {
    const tenantBOrg = {
      cashEnabled: true,
      transferEnabled: true,
      stripeReaderEnabled: true,
      tapToPayIPhoneEnabled: false,
      defaultMethod: "Card",
    };

    const siteConfig = {
      stripeLocationId: "loc_mx_sucursal_monterrey_01",
    };

    const resolved = normalizePaymentCapabilities(tenantBOrg, siteConfig);
    assert.strictEqual(resolved.cashEnabled, true);
    assert.strictEqual(resolved.stripeReaderEnabled, true);
    assert.strictEqual(resolved.stripeLocationId, "loc_mx_sucursal_monterrey_01");
  });

  await t.test("Site-level capabilities override Organization defaults cleanly", () => {
    const orgDefaults = {
      cashEnabled: true,
      transferEnabled: true,
      stripeReaderEnabled: false, // Org default is false
    };

    const siteOverrides = {
      stripeReaderEnabled: true, // Site overrides to enable WisePad 3
      stripeLocationId: "loc_mx_cdmx_flagship",
    };

    const resolved = normalizePaymentCapabilities(orgDefaults, siteOverrides);
    assert.strictEqual(resolved.stripeReaderEnabled, true);
    assert.strictEqual(resolved.stripeLocationId, "loc_mx_cdmx_flagship");
  });
});

test("PaymentStateMachine — UNKNOWN State & Authoritative Verification", async (t) => {
  await t.test("In-flight payment encountering network loss transitions to UNKNOWN instead of FAILED", () => {
    // Attempt moves from CREATED -> PROCESSING
    assert.strictEqual(isValidAttemptTransition(PaymentAttemptStatus.CREATED, PaymentAttemptStatus.PROCESSING), true);

    // Network timeout during processing -> UNKNOWN
    assert.strictEqual(isValidAttemptTransition(PaymentAttemptStatus.PROCESSING, PaymentAttemptStatus.UNKNOWN), true);
  });

  await t.test("Authoritative backend verification resolves UNKNOWN to SUCCEEDED once Stripe confirms", () => {
    assert.strictEqual(isValidAttemptTransition(PaymentAttemptStatus.UNKNOWN, PaymentAttemptStatus.SUCCEEDED), true);
    assert.strictEqual(isValidAttemptTransition(PaymentAttemptStatus.UNKNOWN, PaymentAttemptStatus.FAILED), true);

    // Once SUCCEEDED, terminal state cannot be altered
    assert.strictEqual(isValidAttemptTransition(PaymentAttemptStatus.SUCCEEDED, PaymentAttemptStatus.FAILED), false);
  });

  await t.test("PosPayment correctly updates to SUCCEEDED when attempt succeeds", () => {
    assert.strictEqual(isValidPaymentTransition(PosPaymentStatus.PROCESSING, PosPaymentStatus.SUCCEEDED), true);
    assert.strictEqual(isValidPaymentTransition(PosPaymentStatus.UNKNOWN, PosPaymentStatus.SUCCEEDED), true);
  });
});
