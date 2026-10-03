import { test, describe } from "node:test";
import assert from "node:assert";
import { PaymentHandoffClient } from "../src/services/PaymentHandoffService";
import type {
  IPaymentHandoffInfo,
  ICreateHandoffPayload,
  IAcceptHandoffPayload,
} from "@ireader/contracts";

describe("PHASE PAYMENT-05: Mobile Payment Handoff Client & Polling Tests", () => {
  test("PaymentHandoffClient: createHandoff sends correct headers & payload", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedBody: any = null;
    let capturedHeaders: any = null;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedMethod = init?.method || "GET";
      capturedHeaders = init?.headers;
      capturedBody = JSON.parse(init?.body || "{}");
      return {
        ok: true,
        json: async () => ({
          ok: true,
          handoffId: "handoff_123",
          handoff: {
            id: "handoff_123",
            organizationId: "org_01",
            amount: 1500,
            currency: "MXN",
            status: "ASSIGNED",
            targetDeviceId: "dev_iphone_01",
          },
        }),
      } as any;
    }) as any;

    try {
      const client = new PaymentHandoffClient("https://api.example.com", async () => "token_abc");
      const res = await client.createHandoff({
        amount: 1500,
        currency: "mxn",
        targetDeviceId: "dev_iphone_01",
        saleId: "sale_01",
      });

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.handoffId, "handoff_123");
      assert.strictEqual(capturedUrl, "https://api.example.com/api/payments/handoffs");
      assert.strictEqual(capturedMethod, "POST");
      assert.strictEqual(capturedHeaders["Authorization"], "Bearer token_abc");
      assert.strictEqual(capturedBody.amount, 1500);
      assert.strictEqual(capturedBody.targetDeviceId, "dev_iphone_01");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("PaymentHandoffClient: acceptHandoff sends targetDeviceId and returns clientSecret", async () => {
    let capturedUrl = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      capturedUrl = String(url);
      return {
        ok: true,
        json: async () => ({
          ok: true,
          handoff: {
            id: "handoff_123",
            status: "ACCEPTED",
            posPaymentId: "pos_pay_01",
          },
          clientSecret: "pi_test_secret_xyz",
          paymentIntentId: "pi_test_123",
        }),
      } as any;
    }) as any;

    try {
      const client = new PaymentHandoffClient("https://api.example.com", async () => "token_abc");
      const res = await client.acceptHandoff("handoff_123", { targetDeviceId: "dev_iphone_01" });

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.clientSecret, "pi_test_secret_xyz");
      assert.strictEqual(res.paymentIntentId, "pi_test_123");
      assert.strictEqual(capturedUrl, "https://api.example.com/api/payments/handoffs/handoff_123/accept");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("PaymentHandoffClient: pollHandoffStatus receives updates and stops polling on SUCCEEDED terminal state", async () => {
    let pollCount = 0;
    const states = ["ASSIGNED", "ACCEPTED", "PAYMENT_PROCESSING", "SUCCEEDED"];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      const currentStatus = states[Math.min(pollCount++, states.length - 1)];
      return {
        ok: true,
        json: async () => ({
          ok: true,
          handoff: {
            id: "handoff_poll",
            status: currentStatus,
            amount: 750,
          },
        }),
      } as any;
    }) as any;

    try {
      const client = new PaymentHandoffClient();
      const receivedStates: string[] = [];

      await new Promise<void>((resolve) => {
        const stop = client.pollHandoffStatus(
          "handoff_poll",
          (h) => {
            receivedStates.push(h.status);
            if (h.status === "SUCCEEDED") {
              resolve();
            }
          },
          10, // 10ms fast interval for test
          2000
        );
      });

      assert.strictEqual(receivedStates.includes("ASSIGNED"), true);
      assert.strictEqual(receivedStates.includes("SUCCEEDED"), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("PaymentHandoffClient: cancelHandoff sends cancellation to backend", async () => {
    let capturedUrl = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any) => {
      capturedUrl = String(url);
      return {
        ok: true,
        json: async () => ({
          ok: true,
          handoff: { id: "handoff_cancel", status: "CANCELED" },
        }),
      } as any;
    }) as any;

    try {
      const client = new PaymentHandoffClient();
      const res = await client.cancelHandoff("handoff_cancel", "Changed mind");

      assert.strictEqual(res.ok, true);
      assert.strictEqual(capturedUrl, "/api/payments/handoffs/handoff_cancel/cancel");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
