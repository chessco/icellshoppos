import test from "node:test";
import assert from "node:assert/strict";
import { TapToPayIPhoneAdapter } from "../src/services/TapToPayIPhoneAdapter";
import type { ProBuyerApiClient } from "@ireader/api-client";

test("PAYMENT-04 — TapToPayIPhoneAdapter Eligibility & Device Rules", async (t) => {
  const mockApiClient: Partial<ProBuyerApiClient> = {
    getStripeConnectionToken: async () => ({
      ok: true,
      secret: "pst_test_tap_to_pay_token_9988",
    }),
    registerPosDevice: async () => ({
      ok: true,
      data: {
        id: "pos_iphone_01",
        deviceUuid: "iphone-device-uuid-1",
        deviceName: "iPhone Tap to Pay Terminal",
        deviceType: "IPHONE_TAP_TO_PAY",
        isActive: true,
      },
    }),
    verifyStripePaymentStatus: async () => ({
      ok: true,
      status: "SUCCEEDED",
      paymentAttemptStatus: "SUCCEEDED",
      posPaymentStatus: "PAID",
      cardBrand: "mastercard",
      cardLast4: "8899",
      amount: 12450,
    }),
    cancelStripePaymentIntent: async () => ({
      ok: true,
    }),
  };

  const adapter = new TapToPayIPhoneAdapter(mockApiClient as ProBuyerApiClient, "site_cdmx_01");

  await t.test("Initial state of Tap to Pay adapter is READY", () => {
    assert.strictEqual(adapter.getState(), "READY");
    assert.strictEqual(adapter.isLocalMobileConnected(), false);
  });

  await t.test("Eligibility check accurately identifies OS and device constraints", () => {
    const eligibility = adapter.checkEligibility();
    assert.strictEqual(typeof eligibility.supported, "boolean");
    assert.strictEqual(typeof eligibility.isIPhone, "boolean");
    assert.ok(eligibility.osVersion !== undefined);
  });

  await t.test("Local mobile reader initialization requests connection token and registers POSDevice", async () => {
    const initialized = await adapter.initializeLocalMobile("iphone-pos-001");
    assert.strictEqual(initialized, true);
    assert.strictEqual(adapter.isLocalMobileConnected(), true);
    assert.strictEqual(adapter.getState(), "READY");
  });

  await t.test("Contactless card collection and authoritative verification follows strict state transitions", async () => {
    const steps: string[] = [];
    const result = await adapter.collectAndProcessPayment(
      {
        ok: true,
        paymentIntentId: "pi_test_tap_to_pay_12345",
        clientSecret: "pi_test_tap_to_pay_12345_secret_xxx",
        posPaymentId: "pos_pay_tap_01",
        paymentAttemptId: "att_tap_01",
        amount: 12450,
        currency: "mxn",
        status: "REQUIRES_CONFIRMATION",
      },
      (step) => steps.push(step)
    );

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, "SUCCEEDED");
    assert.strictEqual(result.cardBrand, "mastercard");
    assert.strictEqual(result.cardLast4, "8899");
    assert.deepStrictEqual(steps, [
      "PREPARING_TAP_TO_PAY",
      "WAITING_FOR_CUSTOMER",
      "PROCESSING_PAYMENT",
      "VERIFYING_PAYMENT",
      "PAYMENT_SUCCEEDED",
    ]);
  });

  await t.test("Ambiguous contactless payment loss transitions to UNKNOWN state for safe recovery", async () => {
    const mockApiClientWithTimeout: Partial<ProBuyerApiClient> = {
      verifyStripePaymentStatus: async () => ({
        ok: false,
        status: "UNKNOWN",
        paymentAttemptStatus: "UNKNOWN",
        posPaymentStatus: "UNKNOWN",
        isUnknown: true,
        error: "Network timed out during verification.",
      }),
    };

    const timeoutAdapter = new TapToPayIPhoneAdapter(mockApiClientWithTimeout as ProBuyerApiClient, "site_cdmx_01");
    const steps: string[] = [];

    const result = await timeoutAdapter.collectAndProcessPayment(
      {
        ok: true,
        paymentIntentId: "pi_test_tap_unknown",
        clientSecret: "secret_xxx",
        posPaymentId: "pos_01",
        paymentAttemptId: "att_01",
        amount: 5000,
        currency: "mxn",
        status: "REQUIRES_CONFIRMATION",
      },
      (step) => steps.push(step)
    );

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, "UNKNOWN");
    assert.strictEqual(result.isUnknown, true);
    assert.strictEqual(timeoutAdapter.getState(), "PAYMENT_UNKNOWN");
  });
});
