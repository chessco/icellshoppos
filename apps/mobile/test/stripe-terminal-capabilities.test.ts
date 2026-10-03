import test from "node:test";
import assert from "node:assert/strict";
import { StripeTerminalAdapter } from "../src/services/StripeTerminalAdapter";
import { CheckoutApplicationService } from "@ireader/application";
import type { ProBuyerApiClient } from "@ireader/api-client";
import type { IPaymentCapabilities } from "@ireader/contracts";

test("StripeTerminalAdapter — Reader Discovery, Connection & Payment Lifecycle", async (t) => {
  // Mock API client
  const mockApiClient: Partial<ProBuyerApiClient> = {
    getStripeConnectionToken: async () => ({
      ok: true,
      secret: "pst_test_secret_token_12345",
    }),
    getStripeReaders: async () => ({
      ok: true,
      data: [
        {
          id: "rdr_mx_wisepad3_01",
          label: "BBPOS WisePad 3 (Caja Principal)",
          serialNumber: "WSC3-MX-88910",
          deviceType: "bbpos_wisepad3",
          status: "ONLINE",
          batteryLevel: 0.92,
        },
      ],
    }),
    registerPosDevice: async () => ({
      ok: true,
      data: {
        id: "pos_device_01",
        deviceUuid: "ipad-device-uuid-1",
        deviceName: "iPad POS Terminal",
        deviceType: "IPAD_POS",
        isActive: true,
      },
    }),
    verifyStripePaymentStatus: async () => ({
      ok: true,
      status: "SUCCEEDED",
      paymentAttemptStatus: "SUCCEEDED",
      posPaymentStatus: "PAID",
      cardBrand: "visa",
      cardLast4: "4242",
      amount: 15000,
    }),
    cancelStripePaymentIntent: async () => ({
      ok: true,
    }),
  };

  const adapter = new StripeTerminalAdapter(mockApiClient as ProBuyerApiClient, "site_monterrey_01");

  await t.test("Initial state is NO_READER", () => {
    assert.strictEqual(adapter.getState(), "NO_READER");
    assert.strictEqual(adapter.getConnectedReader(), null);
  });

  await t.test("Reader discovery returns discovered readers and emits state", async () => {
    let emittedState = "";
    adapter.addListener({
      onStateChange: (s) => {
        emittedState = s;
      },
    });

    const readers = await adapter.discoverReaders("bluetooth");
    assert.strictEqual(readers.length, 1);
    assert.strictEqual(readers[0].serialNumber, "WSC3-MX-88910");
    assert.strictEqual(adapter.getState(), "READERS_FOUND");
  });

  await t.test("Reader connection transitions state to CONNECTED", async () => {
    const readers = adapter.getDiscoveredReaders();
    const connected = await adapter.connectReader(readers[0], "ipad-pos-001");
    assert.strictEqual(connected, true);
    assert.strictEqual(adapter.getState(), "CONNECTED");
    assert.strictEqual(adapter.getConnectedReader()?.serialNumber, "WSC3-MX-88910");
  });

  await t.test("Payment execution follows full lifecycle and authoritative verification", async () => {
    const steps: string[] = [];
    const result = await adapter.collectAndProcessPayment(
      {
        ok: true,
        paymentIntentId: "pi_test_12345678",
        clientSecret: "pi_test_12345678_secret_xxx",
        posPaymentId: "pos_pay_01",
        paymentAttemptId: "att_01",
        amount: 15000,
        currency: "mxn",
        status: "REQUIRES_CONFIRMATION",
      },
      (step) => steps.push(step)
    );

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, "SUCCEEDED");
    assert.strictEqual(result.cardBrand, "visa");
    assert.strictEqual(result.cardLast4, "4242");
    assert.deepStrictEqual(steps, ["WAITING_FOR_CARD", "PROCESSING", "VERIFYING", "PAYMENT_SUCCEEDED"]);
  });

  await t.test("Reader disconnect transitions state to DISCONNECTED", async () => {
    await adapter.disconnectReader();
    assert.strictEqual(adapter.getState(), "DISCONNECTED");
    assert.strictEqual(adapter.getConnectedReader(), null);
  });
});

test("CheckoutApplicationService — Multi-Tenant Capabilities & Fallback", async (t) => {
  await t.test("When Stripe is disabled, safe default capabilities are returned", async () => {
    const mockApiClientWithoutStripe: Partial<ProBuyerApiClient> = {
      getPaymentCapabilities: async () => ({
        ok: true,
        data: {
          cashEnabled: true,
          transferEnabled: true,
          cardEnabled: false,
          stripeReaderEnabled: false,
          stripeTapToPayEnabled: false,
          creditEnabled: true,
          otherEnabled: true,
          defaultMethod: "Cash",
        },
      }),
    };

    const service = new CheckoutApplicationService(mockApiClientWithoutStripe as ProBuyerApiClient);
    const caps = await service.getPaymentCapabilities();
    assert.strictEqual(caps?.cashEnabled, true);
    assert.strictEqual(caps?.stripeReaderEnabled, false);
  });

  await t.test("When Stripe is enabled, capabilities report stripeReaderEnabled = true", async () => {
    const mockApiClientWithStripe: Partial<ProBuyerApiClient> = {
      getPaymentCapabilities: async () => ({
        ok: true,
        data: {
          cashEnabled: true,
          transferEnabled: true,
          cardEnabled: true,
          stripeReaderEnabled: true,
          stripeTapToPayEnabled: false,
          creditEnabled: true,
          otherEnabled: true,
          defaultMethod: "Card",
          stripeLocationId: "loc_mx_mty",
        },
      }),
    };

    const service = new CheckoutApplicationService(mockApiClientWithStripe as ProBuyerApiClient);
    const caps = await service.getPaymentCapabilities();
    assert.strictEqual(caps?.stripeReaderEnabled, true);
    assert.strictEqual(caps?.stripeLocationId, "loc_mx_mty");
  });
});
