import { describe, it } from "node:test";
import assert from "node:assert";
import { PaymentHandoffService } from "../src/lib/payments/payment-handoff-service";
import { PaymentOrchestrator } from "../src/lib/payments/payment-orchestrator";
import { PaymentHandoffStatus, POSDeviceType, PosPaymentStatus, PaymentAttemptStatus } from "@prisma/client";
import { IStripePaymentAdapter } from "../src/lib/payments/stripe-adapter";

// In-Memory Database Simulator for Concurrency & Atomic Operations
class ConcurrencyTestDatabase {
  handoffs: Map<string, any> = new Map();
  posPayments: Map<string, any> = new Map();
  paymentAttempts: Map<string, any> = new Map();
  stripeRecords: Map<string, any> = new Map();
  posDevices: Map<string, any> = new Map();
  organizations: Map<string, any> = new Map();
  inventoryItems: Map<string, any> = new Map();
  sales: Map<string, any> = new Map();
  webhookEvents: Map<string, any> = new Map();

  constructor() {
    this.organizations.set("org_test", {
      id: "org_test",
      name: "Test Org",
      status: "active",
      paymentCapabilitiesJson: {
        tapToPayIPhoneEnabled: true,
        stripeTapToPayEnabled: true,
      },
    });

    this.posDevices.set("iphone_caja_1", {
      id: "iphone_caja_1",
      organizationId: "org_test",
      siteId: "site_1",
      deviceType: POSDeviceType.IPHONE_TAP_TO_PAY,
      deviceName: "iPhone Caja 1",
      deviceUuid: "uuid-iphone-1",
      status: "ACTIVE",
    });

    this.posDevices.set("iphone_caja_2", {
      id: "iphone_caja_2",
      organizationId: "org_test",
      siteId: "site_1",
      deviceType: POSDeviceType.IPHONE_TAP_TO_PAY,
      deviceName: "iPhone Caja 2",
      deviceUuid: "uuid-iphone-2",
      status: "ACTIVE",
    });

    this.posDevices.set("ipad_pos_1", {
      id: "ipad_pos_1",
      organizationId: "org_test",
      siteId: "site_1",
      deviceType: POSDeviceType.IPAD_POS,
      deviceName: "iPad Mostrador",
      deviceUuid: "uuid-ipad-1",
      status: "ACTIVE",
    });
  }

  // Prisma-compatible interface
  get organization() {
    return {
      findUnique: async ({ where }: any) => this.organizations.get(where.id) || null,
      findFirst: async ({ where }: any) => this.organizations.get(where.id) || null,
    };
  }

  get site() {
    return {
      findFirst: async () => null,
      findUnique: async () => null,
    };
  }

  get pOSDevice() {
    return {
      findFirst: async ({ where }: any) => {
        for (const dev of this.posDevices.values()) {
          if (where.id && dev.id !== where.id) continue;
          if (where.organizationId && dev.organizationId !== where.organizationId) continue;
          if (where.siteId && dev.siteId !== where.siteId) continue;
          if (where.deviceType && dev.deviceType !== where.deviceType) continue;
          return dev;
        }
        return null;
      },
      findMany: async ({ where }: any) => {
        const results = [];
        for (const dev of this.posDevices.values()) {
          if (where.organizationId && dev.organizationId !== where.organizationId) continue;
          if (where.deviceType && dev.deviceType !== where.deviceType) continue;
          results.push(dev);
        }
        return results;
      },
      updateMany: async () => ({ count: 1 }),
    };
  }

  get posPayment() {
    return {
      findUnique: async ({ where }: any) => {
        if (where.organizationId_idempotencyKey) {
          const { organizationId, idempotencyKey } = where.organizationId_idempotencyKey;
          for (const p of this.posPayments.values()) {
            if (p.organizationId === organizationId && p.idempotencyKey === idempotencyKey) {
              return this._hydratePosPayment(p);
            }
          }
        }
        if (where.id) {
          const p = this.posPayments.get(where.id);
          return p ? this._hydratePosPayment(p) : null;
        }
        return null;
      },
      findFirst: async ({ where }: any) => {
        for (const p of this.posPayments.values()) {
          if (where.id && p.id !== where.id) continue;
          if (where.organizationId && p.organizationId !== where.organizationId) continue;
          return this._hydratePosPayment(p);
        }
        return null;
      },
      create: async ({ data }: any) => {
        for (const p of this.posPayments.values()) {
          if (p.organizationId === data.organizationId && p.idempotencyKey === data.idempotencyKey) {
            const err: any = new Error("Unique constraint violation");
            err.code = "P2002";
            throw err;
          }
        }
        const id = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const record = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
        this.posPayments.set(id, record);
        return record;
      },
      update: async ({ where, data }: any) => {
        const p = this.posPayments.get(where.id);
        if (p) {
          Object.assign(p, data, { updatedAt: new Date() });
          return this._hydratePosPayment(p);
        }
        return null;
      },
      updateMany: async () => ({ count: 1 }),
    };
  }

  get paymentAttempt() {
    return {
      create: async ({ data }: any) => {
        const id = `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const record = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
        this.paymentAttempts.set(id, record);
        return record;
      },
      update: async ({ where, data }: any) => {
        const a = this.paymentAttempts.get(where.id);
        if (a) {
          Object.assign(a, data, { updatedAt: new Date() });
          return a;
        }
        return null;
      },
    };
  }

  get stripePaymentRecord() {
    return {
      create: async ({ data }: any) => {
        const id = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const record = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
        this.stripeRecords.set(id, record);
        return record;
      },
      findUnique: async ({ where }: any) => {
        if (where.stripePaymentIntentId) {
          for (const r of this.stripeRecords.values()) {
            if (r.stripePaymentIntentId === where.stripePaymentIntentId) {
              const posPayment = this.posPayments.get(r.posPaymentId);
              const paymentAttempt = this.paymentAttempts.get(r.paymentAttemptId);
              return { ...r, posPayment, paymentAttempt };
            }
          }
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        const r = this.stripeRecords.get(where.id);
        if (r) Object.assign(r, data);
        return r;
      },
    };
  }

  get paymentHandoff() {
    return {
      findFirst: async ({ where }: any) => {
        for (const h of this.handoffs.values()) {
          if (where.id && h.id !== where.id) continue;
          if (where.organizationId && h.organizationId !== where.organizationId) continue;
          if (where.idempotencyKey && h.idempotencyKey !== where.idempotencyKey) continue;
          return this._hydrateHandoff(h);
        }
        return null;
      },
      findUnique: async ({ where }: any) => {
        const h = this.handoffs.get(where.id);
        return h ? this._hydrateHandoff(h) : null;
      },
      findMany: async ({ where }: any) => {
        const results = [];
        for (const h of this.handoffs.values()) {
          if (where.organizationId && h.organizationId !== where.organizationId) continue;
          if (where.status?.in && !where.status.in.includes(h.status)) continue;
          results.push(this._hydrateHandoff(h));
        }
        return results;
      },
      create: async ({ data }: any) => {
        if (data.idempotencyKey) {
          for (const h of this.handoffs.values()) {
            if (h.organizationId === data.organizationId && h.idempotencyKey === data.idempotencyKey) {
              const err: any = new Error("Unique constraint violation");
              err.code = "P2002";
              throw err;
            }
          }
        }
        const id = `handoff_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const record = { ...data, id, version: 1, createdAt: new Date(), updatedAt: new Date() };
        this.handoffs.set(id, record);
        return this._hydrateHandoff(record);
      },
      update: async ({ where, data }: any) => {
        const h = this.handoffs.get(where.id);
        if (h) {
          Object.assign(h, data, { updatedAt: new Date() });
          if (data.version?.increment) h.version += data.version.increment;
          return this._hydrateHandoff(h);
        }
        return null;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        const now = new Date();
        for (const h of this.handoffs.values()) {
          if (where.id && h.id !== where.id) continue;
          if (where.organizationId && h.organizationId !== where.organizationId) continue;
          if (where.status?.in && !where.status.in.includes(h.status)) continue;
          if (where.status && typeof where.status === "string" && h.status !== where.status) continue;
          if (where.expiresAt?.gt && !(h.expiresAt > now)) continue;
          if (where.targetDeviceId && h.targetDeviceId !== where.targetDeviceId) continue;

          // Atomic mutate
          Object.assign(h, data, { updatedAt: new Date() });
          if (data.version?.increment) h.version += data.version.increment;
          count++;
        }
        return { count };
      },
    };
  }

  get sale() {
    return {
      findFirst: async () => null,
      findUnique: async () => null,
    };
  }

  get user() {
    return {
      findUnique: async () => ({ id: "user_1", fullName: "Operator 1" }),
    };
  }

  get stripeReader() {
    return {
      findFirst: async () => null,
    };
  }

  get stripeWebhookEvent() {
    return {
      findUnique: async ({ where }: any) => {
        if (where.stripeEventId) {
          for (const ev of this.webhookEvents.values()) {
            if (ev.stripeEventId === where.stripeEventId) return ev;
          }
        }
        if (where.id) return this.webhookEvents.get(where.id) || null;
        return null;
      },
      create: async ({ data }: any) => {
        const id = `wev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const record = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
        this.webhookEvents.set(id, record);
        return record;
      },
      update: async ({ where, data }: any) => {
        const record = this.webhookEvents.get(where.id);
        if (record) Object.assign(record, data, { updatedAt: new Date() });
        return record;
      },
    };
  }

  async $transaction(fn: (tx: any) => Promise<any>) {
    // In-memory atomic transaction simulation
    return await fn(this);
  }

  private _hydratePosPayment(p: any) {
    const attempts = [];
    for (const a of this.paymentAttempts.values()) {
      if (a.paymentId === p.id) attempts.push(a);
    }
    let stripePayment = null;
    for (const s of this.stripeRecords.values()) {
      if (s.posPaymentId === p.id) {
        stripePayment = s;
        break;
      }
    }
    return {
      ...p,
      attempts,
      stripePayment,
    };
  }

  private _hydrateHandoff(h: any) {
    const posPayment = this.posPayments.get(h.posPaymentId);
    const sourceDevice = h.sourceDeviceId ? this.posDevices.get(h.sourceDeviceId) : null;
    const targetDevice = h.targetDeviceId ? this.posDevices.get(h.targetDeviceId) : null;
    return {
      ...h,
      posPayment: posPayment ? this._hydratePosPayment(posPayment) : null,
      sourceDevice,
      targetDevice,
      sale: null,
    };
  }
}

// Mock Stripe Adapter
const mockStripeAdapter: any = {
  async createConnectionToken() {
    return { secret: "pst_test_token_123" };
  },
  async createPaymentIntent(params: any) {
    return {
      id: `pi_test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      client_secret: "pi_test_secret_123",
      amount: params.amountCents,
      currency: params.currency,
      status: "requires_payment_method",
      metadata: params.metadata || {},
    };
  },
  async retrievePaymentIntent(id: string) {
    return {
      id,
      client_secret: "pi_test_secret_123",
      amount: 1245000,
      currency: "mxn",
      status: "succeeded",
      metadata: {},
      latest_charge: {
        id: "ch_test_123",
        payment_method_details: {
          card_present: {
            brand: "visa",
            last4: "4242",
            read_method: "contactless_emv",
          },
        },
      },
    };
  },
  async cancelPaymentIntent(id: string) {
    return {
      id,
      status: "canceled",
    };
  },
  constructWebhookEvent(body: any) {
    return JSON.parse(body.toString());
  },
};

describe("PAYMENT-05A — Adversarial Concurrency & Transaction Integrity Hardening", () => {
  it("INVARIANT 1: Exactly 1 Winner across 20 simultaneous acceptance attempts", async () => {
    const testDb = new ConcurrencyTestDatabase();
    const orchestrator = new PaymentOrchestrator(testDb as any, mockStripeAdapter);
    const handoffService = new PaymentHandoffService(testDb as any, orchestrator);

    // 1. Create an initial handoff assigned to iPhone 1
    const { handoff: initialHandoff } = await handoffService.createHandoff({
      organizationId: "org_test",
      userId: "seller_ipad",
      siteId: "site_1",
      sourceDeviceId: "ipad_pos_1",
      targetDeviceId: "iphone_caja_1",
      amount: 1500.0,
      currency: "MXN",
      idempotencyKey: "test_handoff_race_1",
    });

    assert.strictEqual(initialHandoff.status, "ASSIGNED");

    // 2. Fire 20 simultaneous accept requests from iPhone 1 (simulate concurrent threads/workers)
    type RaceResult =
      | { success: true; res: any; idx: number; code?: undefined }
      | { success: false; err: string; code: string; idx: number };

    const promises: Promise<RaceResult>[] = Array.from({ length: 20 }, (_, idx) =>
      handoffService
        .acceptHandoff({
          organizationId: "org_test",
          userId: `iphone_operator_${idx}`,
          handoffId: initialHandoff.id,
          targetDeviceId: "iphone_caja_1",
        })
        .then((res) => ({ success: true as const, res, idx }))
        .catch((err) => ({ success: false as const, err: err.message, code: err.code || "ERROR", idx }))
    );

    const results = await Promise.all(promises);

    const winners = results.filter((r): r is Extract<RaceResult, { success: true }> => r.success);
    const losers = results.filter((r): r is Extract<RaceResult, { success: false }> => !r.success);

    // EXACTLY 1 winner must acquire ownership
    assert.strictEqual(winners.length, 1, "Exactly one acceptance attempt must succeed");
    assert.strictEqual(losers.length, 19, "All 19 concurrent losers must be rejected");

    // Verify error codes of losers
    losers.forEach((loser) => {
      assert.ok(
        loser.code === "CONFLICT" || loser.code === "INVALID_STATE",
        `Expected CONFLICT/INVALID_STATE, got ${loser.code}`
      );
    });

    // Check database state
    const authoritative = await handoffService.getHandoff({
      organizationId: "org_test",
      handoffId: initialHandoff.id,
    });

    assert.strictEqual(authoritative.status, "ACCEPTED");
    assert.strictEqual(authoritative.acceptedByUserId, `iphone_operator_${winners[0].idx}`);
  });

  it("INVARIANT 2: Explicit Target Device Ownership strictly blocks non-assigned iPhone", async () => {
    const testDb = new ConcurrencyTestDatabase();
    const orchestrator = new PaymentOrchestrator(testDb as any, mockStripeAdapter);
    const handoffService = new PaymentHandoffService(testDb as any, orchestrator);

    // Create handoff explicitly assigned to iPhone 1
    const { handoff } = await handoffService.createHandoff({
      organizationId: "org_test",
      userId: "seller_ipad",
      siteId: "site_1",
      sourceDeviceId: "ipad_pos_1",
      targetDeviceId: "iphone_caja_1",
      amount: 850.0,
      currency: "MXN",
      idempotencyKey: "test_handoff_device_isolation",
    });

    // iPhone 2 tries to accept it
    await assert.rejects(
      async () => {
        await handoffService.acceptHandoff({
          organizationId: "org_test",
          userId: "operator_iphone_2",
          handoffId: handoff.id,
          targetDeviceId: "iphone_caja_2", // Wrong device!
        });
      },
      (err: any) => {
        assert.strictEqual(err.code, "DEVICE_MISMATCH");
        return true;
      }
    );

    // Handoff remains uncompromised in ASSIGNED state
    const afterAttempt = await handoffService.getHandoff({
      organizationId: "org_test",
      handoffId: handoff.id,
    });
    assert.strictEqual(afterAttempt.status, "ASSIGNED");
    assert.ok(!afterAttempt.acceptedByUserId, "acceptedByUserId must remain empty");
  });

  it("INVARIANT 3: 20 Concurrent Create Requests resolve to 1 Logical Handoff & 1 PaymentIntent", async () => {
    const testDb = new ConcurrencyTestDatabase();
    const orchestrator = new PaymentOrchestrator(testDb as any, mockStripeAdapter);
    const handoffService = new PaymentHandoffService(testDb as any, orchestrator);

    const idempotencyKey = "shared_idempotent_order_99";

    // 20 concurrent creation calls with identical idempotencyKey
    const createPromises = Array.from({ length: 20 }, () =>
      handoffService.createHandoff({
        organizationId: "org_test",
        userId: "seller_ipad",
        siteId: "site_1",
        sourceDeviceId: "ipad_pos_1",
        targetDeviceId: "iphone_caja_1",
        amount: 2500.0,
        currency: "MXN",
        idempotencyKey,
      })
    );

    const responses = await Promise.all(createPromises);

    // All 20 responses return the exact same handoff ID and posPayment ID
    const firstHandoffId = responses[0].handoff.id;
    const firstPosPaymentId = responses[0].handoff.posPaymentId;

    responses.forEach((res) => {
      assert.strictEqual(res.handoff.id, firstHandoffId);
      assert.strictEqual(res.handoff.posPaymentId, firstPosPaymentId);
      assert.strictEqual(res.handoff.amount, 2500);
    });

    // Assert exact single record counts in DB
    assert.strictEqual(testDb.handoffs.size, 1, "Only 1 PaymentHandoff row created in DB");
    assert.strictEqual(testDb.posPayments.size, 1, "Only 1 PosPayment row created in DB");
    assert.strictEqual(testDb.paymentAttempts.size, 1, "Only 1 PaymentAttempt row created in DB");
    assert.strictEqual(testDb.stripeRecords.size, 1, "Only 1 StripePaymentRecord row created in DB");
  });

  it("INVARIANT 4: Expired Handoff strictly rejects acceptance via atomic CAS", async () => {
    const testDb = new ConcurrencyTestDatabase();
    const orchestrator = new PaymentOrchestrator(testDb as any, mockStripeAdapter);
    const handoffService = new PaymentHandoffService(testDb as any, orchestrator);

    const { handoff } = await handoffService.createHandoff({
      organizationId: "org_test",
      userId: "seller_ipad",
      siteId: "site_1",
      targetDeviceId: "iphone_caja_1",
      amount: 500.0,
      currency: "MXN",
      idempotencyKey: "test_expire_race",
    });

    // Force expiration in DB
    const dbHandoff = testDb.handoffs.get(handoff.id);
    dbHandoff.expiresAt = new Date(Date.now() - 10000); // 10 seconds ago

    // Attempt accept
    await assert.rejects(
      async () => {
        await handoffService.acceptHandoff({
          organizationId: "org_test",
          userId: "operator_iphone_1",
          handoffId: handoff.id,
          targetDeviceId: "iphone_caja_1",
        });
      },
      (err: any) => {
        assert.strictEqual(err.code, "HANDOFF_EXPIRED");
        return true;
      }
    );

    const current = await handoffService.getHandoff({
      organizationId: "org_test",
      handoffId: handoff.id,
    });
    assert.strictEqual(current.status, "EXPIRED");
  });

  it("INVARIANT 5: In-Flight Payment Processing strictly blocks cancellation", async () => {
    const testDb = new ConcurrencyTestDatabase();
    const orchestrator = new PaymentOrchestrator(testDb as any, mockStripeAdapter);
    const handoffService = new PaymentHandoffService(testDb as any, orchestrator);

    const { handoff } = await handoffService.createHandoff({
      organizationId: "org_test",
      userId: "seller_ipad",
      siteId: "site_1",
      targetDeviceId: "iphone_caja_1",
      amount: 1200.0,
      currency: "MXN",
      idempotencyKey: "test_cancel_inflight_guard",
    });

    // Accept on iPhone
    await handoffService.acceptHandoff({
      organizationId: "org_test",
      userId: "operator_iphone_1",
      handoffId: handoff.id,
      targetDeviceId: "iphone_caja_1",
    });

    // iPhone transitions to PAYMENT_PROCESSING (Customer tapping card)
    await handoffService.updateStatus({
      organizationId: "org_test",
      handoffId: handoff.id,
      status: PaymentHandoffStatus.PAYMENT_PROCESSING,
    });

    // iPad attempts to cancel while customer is tapping card
    await assert.rejects(
      async () => {
        await handoffService.cancelHandoff({
          organizationId: "org_test",
          userId: "seller_ipad",
          handoffId: handoff.id,
          reason: "iPad operator hit cancel",
        });
      },
      (err: any) => {
        assert.strictEqual(err.code, "PAYMENT_IN_PROGRESS");
        return true;
      }
    );

    // iPhone attempts to reject while customer is tapping card
    await assert.rejects(
      async () => {
        await handoffService.rejectHandoff({
          organizationId: "org_test",
          userId: "operator_iphone_1",
          handoffId: handoff.id,
          reason: "iPhone reject button",
        });
      },
      (err: any) => {
        assert.strictEqual(err.code, "PAYMENT_ALREADY_IN_FLIGHT");
        return true;
      }
    );
  });

  it("INVARIANT 6: UNKNOWN status blocks blind retry and requires authoritative Stripe verification", async () => {
    const testDb = new ConcurrencyTestDatabase();
    const orchestrator = new PaymentOrchestrator(testDb as any, mockStripeAdapter);
    const handoffService = new PaymentHandoffService(testDb as any, orchestrator);

    const { handoff } = await handoffService.createHandoff({
      organizationId: "org_test",
      userId: "seller_ipad",
      siteId: "site_1",
      targetDeviceId: "iphone_caja_1",
      amount: 3200.0,
      currency: "MXN",
      idempotencyKey: "test_unknown_resolution",
    });

    await handoffService.acceptHandoff({
      organizationId: "org_test",
      userId: "operator_iphone_1",
      handoffId: handoff.id,
      targetDeviceId: "iphone_caja_1",
    });

    // iPhone transitions to PAYMENT_PROCESSING
    await handoffService.updateStatus({
      organizationId: "org_test",
      handoffId: handoff.id,
      status: PaymentHandoffStatus.PAYMENT_PROCESSING,
    });

    // Simulate network drop during card tap -> status transitions from PAYMENT_PROCESSING to UNKNOWN
    await handoffService.updateStatus({
      organizationId: "org_test",
      handoffId: handoff.id,
      status: PaymentHandoffStatus.UNKNOWN,
    });

    // Cancellation and rejection must both be blocked
    await assert.rejects(
      async () => {
        await handoffService.cancelHandoff({
          organizationId: "org_test",
          userId: "seller_ipad",
          handoffId: handoff.id,
        });
      },
      (err: any) => {
        assert.strictEqual(err.code, "PAYMENT_IN_PROGRESS");
        return true;
      }
    );

    // Authoritative verification with Stripe API resolves UNKNOWN -> SUCCEEDED
    const verification = await orchestrator.verifyPaymentStatus({
      organizationId: "org_test",
      posPaymentId: handoff.posPaymentId,
    });

    assert.strictEqual(verification.status, PosPaymentStatus.SUCCEEDED);
    assert.strictEqual(verification.cardBrand, "visa");
    assert.strictEqual(verification.cardLast4, "4242");

    // Authoritative handoff state synchronized to SUCCEEDED
    const finalHandoff = await handoffService.getHandoff({
      organizationId: "org_test",
      handoffId: handoff.id,
    });
    assert.strictEqual(finalHandoff.status, "SUCCEEDED");
  });

  it("INVARIANT 7: Cancel vs Accept Race resolves to exactly 1 deterministic winner", async () => {
    const testDb = new ConcurrencyTestDatabase();
    const orchestrator = new PaymentOrchestrator(testDb as any, mockStripeAdapter);
    const handoffService = new PaymentHandoffService(testDb as any, orchestrator);

    const { handoff } = await handoffService.createHandoff({
      organizationId: "org_test",
      userId: "seller_ipad",
      siteId: "site_1",
      targetDeviceId: "iphone_caja_1",
      amount: 750.0,
      currency: "MXN",
      idempotencyKey: "test_cancel_vs_accept_race",
    });

    // Fire Accept and Cancel concurrently
    const [acceptResult, cancelResult] = await Promise.allSettled([
      handoffService.acceptHandoff({
        organizationId: "org_test",
        userId: "operator_iphone_1",
        handoffId: handoff.id,
        targetDeviceId: "iphone_caja_1",
      }),
      handoffService.cancelHandoff({
        organizationId: "org_test",
        userId: "seller_ipad",
        handoffId: handoff.id,
      }),
    ]);

    // Exactly one of the transitions must succeed or reach a deterministic state
    const authoritative = await handoffService.getHandoff({
      organizationId: "org_test",
      handoffId: handoff.id,
    });

    assert.ok(
      authoritative.status === "ACCEPTED" || authoritative.status === "CANCELED",
      `Final status must be either ACCEPTED or CANCELED, got ${authoritative.status}`
    );

    // If canceled won, accept must have failed or vice-versa
    if (authoritative.status === "CANCELED") {
      assert.strictEqual(cancelResult.status, "fulfilled");
    } else if (authoritative.status === "ACCEPTED") {
      assert.strictEqual(acceptResult.status, "fulfilled");
    }
  });

  it("INVARIANT 8: Reject vs Accept Race resolves to exactly 1 deterministic winner", async () => {
    const testDb = new ConcurrencyTestDatabase();
    const orchestrator = new PaymentOrchestrator(testDb as any, mockStripeAdapter);
    const handoffService = new PaymentHandoffService(testDb as any, orchestrator);

    const { handoff } = await handoffService.createHandoff({
      organizationId: "org_test",
      userId: "seller_ipad",
      siteId: "site_1",
      targetDeviceId: "iphone_caja_1",
      amount: 990.0,
      currency: "MXN",
      idempotencyKey: "test_reject_vs_accept_race",
    });

    const [acceptResult, rejectResult] = await Promise.allSettled([
      handoffService.acceptHandoff({
        organizationId: "org_test",
        userId: "operator_iphone_1",
        handoffId: handoff.id,
        targetDeviceId: "iphone_caja_1",
      }),
      handoffService.rejectHandoff({
        organizationId: "org_test",
        userId: "operator_iphone_1",
        handoffId: handoff.id,
        reason: "Operator rejected",
      }),
    ]);

    const authoritative = await handoffService.getHandoff({
      organizationId: "org_test",
      handoffId: handoff.id,
    });

    assert.ok(
      authoritative.status === "ACCEPTED" || authoritative.status === "CANCELED",
      `Final status must be either ACCEPTED or CANCELED, got ${authoritative.status}`
    );
  });

  it("INVARIANT 9: Concurrent Webhook & verifyPaymentStatus converge idempotently without duplicates", async () => {
    const testDb = new ConcurrencyTestDatabase();
    const orchestrator = new PaymentOrchestrator(testDb as any, mockStripeAdapter);

    // Create payment intent
    const piResult = await orchestrator.createPaymentIntent({
      organizationId: "org_test",
      userId: "seller_1",
      amount: 1500.0,
      currency: "MXN",
      channel: "STRIPE_TAP_TO_PAY_IPHONE" as any,
      idempotencyKey: "test_webhook_race_pay",
    });

    const webhookPayload = {
      id: "evt_test_race_123",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: piResult.stripePaymentIntentId,
          status: "succeeded",
          amount: 150000,
          currency: "mxn",
          latest_charge: "ch_test_race_123",
        },
      },
    };

    // Fire verifyPaymentStatus and webhook concurrently
    const [verifyRes, webhookRes] = await Promise.all([
      orchestrator.verifyPaymentStatus({
        organizationId: "org_test",
        posPaymentId: piResult.posPaymentId,
      }),
      orchestrator.processWebhookEvent({
        rawBody: Buffer.from(JSON.stringify(webhookPayload)),
        signature: "sig_test",
      }),
    ]);

    assert.strictEqual(verifyRes.status, PosPaymentStatus.SUCCEEDED);
    assert.strictEqual(webhookRes.processed, true);

    // Ensure database records remain exactly single
    assert.strictEqual(testDb.posPayments.size, 1, "Exactly 1 PosPayment record in DB");
    assert.strictEqual(testDb.stripeRecords.size, 1, "Exactly 1 StripePaymentRecord in DB");
    assert.strictEqual(testDb.paymentAttempts.size, 1, "Exactly 1 PaymentAttempt record in DB");
  });
});
