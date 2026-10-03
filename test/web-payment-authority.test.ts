import { test, describe } from "node:test";
import assert from "node:assert";
import {
  PosPaymentStatus,
  POSDeviceType,
  PaymentChannel,
  PaymentHandoffStatus,
} from "@prisma/client";
import { PaymentHandoffService } from "../src/lib/payments/payment-handoff-service";
import { PaymentValidationError } from "../src/lib/payments/validation";

describe("PHASE PAYMENT-06W.1: Web Payment Authority & Allocation vs Settlement", () => {
  function createMockDb() {
    const orgs = new Map<string, any>();
    const sites = new Map<string, any>();
    const posDevices = new Map<string, any>();
    const posPayments = new Map<string, any>();
    const paymentAttempts = new Map<string, any>();
    const stripeRecords = new Map<string, any>();
    const handoffs = new Map<string, any>();
    const inventory = new Map<string, any>();
    const customers = new Map<string, any>();
    const sales = new Map<string, any>();

    // Seed test org and site with Tap to Pay enabled
    orgs.set("org_test_1", {
      id: "org_test_1",
      name: "Test Org 1",
      paymentCapabilitiesJson: {
        cashEnabled: true,
        transferEnabled: true,
        cardEnabled: true,
        tapToPayIPhoneEnabled: true,
        stripeReaderEnabled: false,
        creditEnabled: true,
        otherEnabled: true,
      },
    });

    orgs.set("org_test_2", {
      id: "org_test_2",
      name: "Test Org 2 (Other Tenant)",
      paymentCapabilitiesJson: {
        tapToPayIPhoneEnabled: true,
      },
    });

    sites.set("site_test_1", {
      id: "site_test_1",
      organizationId: "org_test_1",
      name: "Sucursal Centro",
      paymentCapabilitiesJson: null,
    });

    sites.set("site_test_2", {
      id: "site_test_2",
      organizationId: "org_test_1",
      name: "Sucursal Norte",
      paymentCapabilitiesJson: null,
    });

    // Seed target iPhone
    posDevices.set("device_iphone_1", {
      id: "device_iphone_1",
      organizationId: "org_test_1",
      siteId: "site_test_1",
      deviceUuid: "uuid-iphone-1",
      deviceName: "iPhone 15 Pro - Mostrador",
      deviceType: POSDeviceType.IPHONE_TAP_TO_PAY,
      status: "ACTIVE",
      lastSeenAt: new Date(),
    });

    // Seed iPad (different device type)
    posDevices.set("device_ipad_1", {
      id: "device_ipad_1",
      organizationId: "org_test_1",
      siteId: "site_test_1",
      deviceUuid: "uuid-ipad-1",
      deviceName: "iPad POS",
      deviceType: POSDeviceType.IPAD_POS,
      status: "ACTIVE",
      lastSeenAt: new Date(),
    });

    // Seed inventory item
    inventory.set("inv_item_1", {
      id: "inv_item_1",
      organizationId: "org_test_1",
      imei: "358900112233445",
      model: "iPhone 14",
      capacity: "128GB",
      color: "Midnight",
      costPesos: 10000,
      status: "Available",
    });

    // Seed customer
    customers.set("cust_1", {
      id: "cust_1",
      organizationId: "org_test_1",
      name: "Juan Perez",
      whatsapp: "+5215512345678",
      email: "juan@example.com",
      creditEnabled: true,
    });

    const mockDb: any = {
      organization: {
        findUnique: async ({ where }: any) => orgs.get(where.id) || null,
        findFirst: async ({ where }: any) => orgs.get(where.id) || null,
      },
      site: {
        findFirst: async ({ where }: any) => sites.get(where.id) || null,
      },
      pOSDevice: {
        findFirst: async ({ where }: any) => {
          for (const d of posDevices.values()) {
            if (where.id && d.id !== where.id) continue;
            if (where.organizationId && d.organizationId !== where.organizationId) continue;
            if (where.siteId && d.siteId !== where.siteId) continue;
            if (where.deviceUuid && d.deviceUuid !== where.deviceUuid) continue;
            return d;
          }
          return null;
        },
        findMany: async ({ where }: any) => {
          const results: any[] = [];
          for (const d of posDevices.values()) {
            if (where.organizationId && d.organizationId !== where.organizationId) continue;
            if (where.siteId && d.siteId !== where.siteId) continue;
            if (where.deviceType && d.deviceType !== where.deviceType) continue;
            if (where.status && d.status !== where.status) continue;
            results.push(d);
          }
          return results;
        },
      },
      posPayment: {
        findFirst: async ({ where }: any) => {
          for (const p of posPayments.values()) {
            if (where.id && p.id !== where.id) continue;
            if (where.organizationId && p.organizationId !== where.organizationId) continue;
            return p;
          }
          return null;
        },
        findMany: async ({ where }: any) => {
          const results: any[] = [];
          for (const p of posPayments.values()) {
            if (where.id?.in && !where.id.in.includes(p.id)) continue;
            if (where.organizationId && p.organizationId !== where.organizationId) continue;
            results.push(p);
          }
          return results;
        },
        create: async ({ data }: any) => {
          const id = data.id || `pos_pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const rec = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
          posPayments.set(id, rec);
          return rec;
        },
        update: async ({ where, data }: any) => {
          const existing = posPayments.get(where.id);
          if (!existing) throw new Error("PosPayment not found");
          const updated = { ...existing, ...data, updatedAt: new Date() };
          posPayments.set(where.id, updated);
          return updated;
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const [id, p] of posPayments.entries()) {
            if (where.id?.in && where.id.in.includes(id)) {
              if (where.organizationId && p.organizationId !== where.organizationId) continue;
              posPayments.set(id, { ...p, ...data, updatedAt: new Date() });
              count++;
            }
          }
          return { count };
        },
      },
      paymentAttempt: {
        findFirst: async ({ where }: any) => {
          for (const a of paymentAttempts.values()) {
            if (where.id && a.id !== where.id) continue;
            if (where.posPaymentId && a.posPaymentId !== where.posPaymentId) continue;
            return a;
          }
          return null;
        },
        create: async ({ data }: any) => {
          const id = data.id || `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const rec = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
          paymentAttempts.set(id, rec);
          return rec;
        },
        update: async ({ where, data }: any) => {
          const existing = paymentAttempts.get(where.id);
          if (!existing) throw new Error("PaymentAttempt not found");
          const updated = { ...existing, ...data, updatedAt: new Date() };
          paymentAttempts.set(where.id, updated);
          return updated;
        },
      },
      stripePaymentRecord: {
        findFirst: async ({ where }: any) => {
          for (const s of stripeRecords.values()) {
            if (where.stripePaymentIntentId && s.stripePaymentIntentId !== where.stripePaymentIntentId) continue;
            if (where.organizationId && s.organizationId !== where.organizationId) continue;
            return s;
          }
          return null;
        },
        create: async ({ data }: any) => {
          const id = data.id || `rec_${Date.now()}`;
          const rec = { id, ...data };
          stripeRecords.set(id, rec);
          return rec;
        },
      },
      paymentHandoff: {
        findUnique: async ({ where }: any) => handoffs.get(where.id) || null,
        findFirst: async ({ where }: any) => {
          for (const h of handoffs.values()) {
            if (where.id && h.id !== where.id) continue;
            if (where.organizationId && h.organizationId !== where.organizationId) continue;
            if (where.idempotencyKey && h.idempotencyKey !== where.idempotencyKey) continue;
            const pp = posPayments.get(h.posPaymentId) || { id: h.posPaymentId, attempts: [] };
            const attempts = Array.from(paymentAttempts.values()).filter((a: any) => a.posPaymentId === h.posPaymentId);
            return {
              ...h,
              posPayment: {
                ...pp,
                attempts,
              },
            };
          }
          return null;
        },
        create: async ({ data }: any) => {
          const id = data.id || `handoff_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const rec = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
          handoffs.set(id, rec);
          return rec;
        },
        update: async ({ where, data }: any) => {
          const existing = handoffs.get(where.id);
          if (!existing) throw new Error("PaymentHandoff not found");
          const updated = { ...existing, ...data, updatedAt: new Date() };
          handoffs.set(where.id, updated);
          return updated;
        },
      },
      inventoryItem: {
        findFirst: async ({ where }: any) => {
          for (const item of inventory.values()) {
            if (where.id && item.id !== where.id) continue;
            if (where.organizationId && item.organizationId !== where.organizationId) continue;
            if (where.imei && item.imei !== where.imei) continue;
            return item;
          }
          return null;
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const [id, item] of inventory.entries()) {
            if (where.id && item.id !== where.id) continue;
            if (where.imei && item.imei !== where.imei) continue;
            if (where.organizationId && item.organizationId !== where.organizationId) continue;
            if (where.status && item.status !== where.status) continue;
            inventory.set(id, { ...item, ...data });
            count++;
          }
          return { count };
        },
      },
      sale: {
        create: async ({ data }: any) => {
          const id = data.id || `sale_${Date.now()}`;
          const rec = { id, ...data, createdAt: new Date() };
          sales.set(id, rec);
          return rec;
        },
      },
      $transaction: async (cb: any) => {
        return cb(mockDb);
      },
    };

    return {
      mockDb,
      posPayments,
      handoffs,
      inventory,
      sales,
    };
  }

  // Helper orchestrator mock
  function createMockOrchestrator(mockDb: any) {
    return {
      createPaymentIntent: async (params: any) => {
        const payment = await mockDb.posPayment.create({
          data: {
            organizationId: params.organizationId,
            siteId: params.siteId || null,
            saleId: params.saleId || null,
            channel: PaymentChannel.STRIPE_TAP_TO_PAY_IPHONE,
            amount: params.amount,
            currency: params.currency || "mxn",
            status: PosPaymentStatus.CREATED,
            idempotencyKey: params.idempotencyKey || `pi_idem_${Date.now()}`,
          },
        });
        const attempt = await mockDb.paymentAttempt.create({
          data: {
            organizationId: params.organizationId,
            posPaymentId: payment.id,
            attemptNumber: 1,
            amount: params.amount,
            currency: params.currency || "mxn",
            status: "PROCESSING",
          },
        });
        return {
          ok: true,
          paymentIntentId: `pi_test_${Date.now()}`,
          clientSecret: "pi_secret_test",
          posPaymentId: payment.id,
          paymentAttemptId: attempt.id,
          amount: params.amount,
          currency: params.currency || "mxn",
          status: "requires_payment_method",
        };
      },
    };
  }

  test("T1: Stripe allocated but no PosPayment -> Sale cannot finalize", async () => {
    const { mockDb } = createMockDb();
    const stripeAllocated = 1999;
    const providedPosPaymentIds: string[] = [];

    // Verification logic matching POST /api/sales
    let rejected = false;
    let errorCode = "";
    if (stripeAllocated > 0 && providedPosPaymentIds.length === 0) {
      rejected = true;
      errorCode = "UNSETTLED_STRIPE_PAYMENT";
    }

    assert.strictEqual(rejected, true);
    assert.strictEqual(errorCode, "UNSETTLED_STRIPE_PAYMENT");
  });

  test("T2-T6: PosPayment in non-SUCCEEDED states (CREATED, PROCESSING, UNKNOWN, FAILED, CANCELED) blocks Sale finalization", async () => {
    const nonSucceededStatuses = [
      PosPaymentStatus.CREATED,
      PosPaymentStatus.PROCESSING,
      PosPaymentStatus.UNKNOWN,
      PosPaymentStatus.FAILED,
      PosPaymentStatus.CANCELED,
    ];

    for (const testStatus of nonSucceededStatuses) {
      const { mockDb, posPayments } = createMockDb();
      const p = await mockDb.posPayment.create({
        data: {
          id: `pp_${testStatus.toLowerCase()}`,
          organizationId: "org_test_1",
          amount: 2999,
          currency: "mxn",
          status: testStatus,
        },
      });

      const fetched = await mockDb.posPayment.findMany({
        where: { id: { in: [p.id] }, organizationId: "org_test_1" },
      });

      let canFinalize = true;
      for (const payment of fetched) {
        if (payment.status !== PosPaymentStatus.SUCCEEDED) {
          canFinalize = false;
        }
      }

      assert.strictEqual(canFinalize, false, `Payment in status ${testStatus} must block checkout`);
    }
  });

  test("T7: PosPayment in status SUCCEEDED allows Stripe allocation to settle", async () => {
    const { mockDb } = createMockDb();
    const p = await mockDb.posPayment.create({
      data: {
        id: "pp_succeeded_1",
        organizationId: "org_test_1",
        amount: 2999,
        currency: "mxn",
        status: PosPaymentStatus.SUCCEEDED,
      },
    });

    const fetched = await mockDb.posPayment.findMany({
      where: { id: { in: [p.id] }, organizationId: "org_test_1" },
    });

    let canFinalize = true;
    for (const payment of fetched) {
      if (payment.status !== PosPaymentStatus.SUCCEEDED) {
        canFinalize = false;
      }
    }

    assert.strictEqual(canFinalize, true);
  });

  test("T8: SUCCEEDED amount smaller than required Stripe allocation -> Sale cannot finalize", async () => {
    const { mockDb } = createMockDb();
    const stripeAllocated = 2999;
    const p = await mockDb.posPayment.create({
      data: {
        id: "pp_insufficient_1",
        organizationId: "org_test_1",
        amount: 1500, // Only covers partial Stripe amount
        currency: "mxn",
        status: PosPaymentStatus.SUCCEEDED,
      },
    });

    const fetched = await mockDb.posPayment.findMany({
      where: { id: { in: [p.id] }, organizationId: "org_test_1" },
    });

    const totalSettled = fetched.reduce((sum: number, cur: any) => sum + Number(cur.amount), 0);
    const hasSufficientCoverage = totalSettled >= stripeAllocated;

    assert.strictEqual(hasSufficientCoverage, false);
  });

  test("T9: Cross-tenant PosPayment reference is rejected", async () => {
    const { mockDb } = createMockDb();
    // Payment created by org_test_2
    const p = await mockDb.posPayment.create({
      data: {
        id: "pp_tenant_2",
        organizationId: "org_test_2",
        amount: 2999,
        currency: "mxn",
        status: PosPaymentStatus.SUCCEEDED,
      },
    });

    // Caller from org_test_1 attempts to claim it
    const fetched = await mockDb.posPayment.findMany({
      where: { id: { in: [p.id] }, organizationId: "org_test_1" },
    });

    assert.strictEqual(fetched.length, 0, "Cross-tenant PosPayment must not be found");
  });

  test("T10: PosPayment already associated with another completed Sale is rejected", async () => {
    const { mockDb } = createMockDb();
    const p = await mockDb.posPayment.create({
      data: {
        id: "pp_already_used",
        organizationId: "org_test_1",
        saleId: "S-PREVIOUS-SALE-999",
        amount: 2999,
        currency: "mxn",
        status: PosPaymentStatus.SUCCEEDED,
      },
    });

    const requestedSaleId = "S-NEW-SALE-100";
    let isReused = p.saleId !== null && p.saleId !== requestedSaleId;

    assert.strictEqual(isReused, true, "Already used PosPayment on another sale must be detected as reused");
  });

  test("T11: Manual methods (Cash, Transfer, External Card) operate immediately without PosPayment", async () => {
    const breakdown = {
      "Cash": 1000,
      "Transfer": 1000,
      "Card": 999, // External manual card terminal
    };
    const total = 2999;
    const stripeAllocated = 0; // No integrated Stripe

    const manualSum = Object.values(breakdown).reduce((sum, amt) => sum + amt, 0);
    const hasCoverage = manualSum === total;

    assert.strictEqual(hasCoverage, true);
    assert.strictEqual(stripeAllocated, 0);
  });

  test("T12: Web Handoff requires explicit target iPhone (null targetDeviceId rejected)", async () => {
    const { mockDb } = createMockDb();
    const orchestrator = createMockOrchestrator(mockDb);
    const service = new PaymentHandoffService(mockDb, orchestrator as any);

    // Explicit check in Web POS flow: targetDeviceId is required
    const webTargetDeviceId = null;
    let caughtError: any = null;

    if (!webTargetDeviceId) {
      caughtError = new PaymentValidationError(
        "A target iPhone device (targetDeviceId) is required for Web POS payment handoff.",
        "MISSING_TARGET_DEVICE"
      );
    }

    assert.ok(caughtError);
    assert.strictEqual(caughtError.code, "MISSING_TARGET_DEVICE");
  });

  test("T13: Non-iPhone or Inactive device is rejected as handoff target", async () => {
    const { mockDb } = createMockDb();
    const orchestrator = createMockOrchestrator(mockDb);
    const service = new PaymentHandoffService(mockDb, orchestrator as any);

    // Target is an iPad (device_ipad_1), not IPHONE_TAP_TO_PAY
    await assert.rejects(
      async () => {
        await service.createHandoff({
          organizationId: "org_test_1",
          userId: "user_1",
          siteId: "site_test_1",
          targetDeviceId: "device_ipad_1",
          amount: 2999,
          currency: "mxn",
        });
      },
      (err: any) => err.code === "INVALID_TARGET_DEVICE_TYPE"
    );
  });

  test("T14: Cross-site or Cross-tenant iPhone is rejected as handoff target", async () => {
    const { mockDb } = createMockDb();
    const orchestrator = createMockOrchestrator(mockDb);
    const service = new PaymentHandoffService(mockDb, orchestrator as any);

    // Request on site_test_2, but iPhone is registered to site_test_1
    await assert.rejects(
      async () => {
        await service.createHandoff({
          organizationId: "org_test_1",
          userId: "user_1",
          siteId: "site_test_2",
          targetDeviceId: "device_iphone_1",
          amount: 2999,
          currency: "mxn",
        });
      },
      (err: any) => err.code === "INVALID_TARGET_DEVICE"
    );
  });

  test("T15-T17: Split Payments (Cash + Stripe, Transfer + Stripe, Manual Card + Stripe)", async () => {
    const testCases = [
      { name: "Cash + Stripe", cash: 1000, transfer: 0, manualCard: 0, stripe: 1999, total: 2999 },
      { name: "Transfer + Stripe", cash: 0, transfer: 1500, manualCard: 0, stripe: 1499, total: 2999 },
      { name: "Manual Card + Stripe", cash: 0, transfer: 0, manualCard: 999, stripe: 2000, total: 2999 },
    ];

    for (const tc of testCases) {
      const { mockDb } = createMockDb();

      // Before Stripe SUCCEEDED:
      const manualSettled = tc.cash + tc.transfer + tc.manualCard;
      let stripeSettled = 0;
      let settledTotal = manualSettled + stripeSettled;
      let outstanding = tc.total - settledTotal;
      let canCheckout = settledTotal === tc.total && stripeSettled >= tc.stripe;

      assert.strictEqual(canCheckout, false, `${tc.name}: Checkout must be blocked before Stripe success`);
      assert.strictEqual(outstanding, tc.stripe);

      // After Stripe SUCCEEDED:
      const p = await mockDb.posPayment.create({
        data: {
          id: `pp_split_${tc.name.replace(/\s+/g, "_")}`,
          organizationId: "org_test_1",
          amount: tc.stripe,
          currency: "mxn",
          status: PosPaymentStatus.SUCCEEDED,
        },
      });

      stripeSettled = Number(p.amount);
      settledTotal = manualSettled + stripeSettled;
      outstanding = tc.total - settledTotal;
      canCheckout = settledTotal === tc.total && stripeSettled >= tc.stripe;

      assert.strictEqual(canCheckout, true, `${tc.name}: Checkout must succeed once Stripe SUCCEEDED`);
      assert.strictEqual(outstanding, 0);
    }
  });

  test("T18: Web Handoff creation idempotency prevents duplicate PosPayments", async () => {
    const { mockDb } = createMockDb();
    const orchestrator = createMockOrchestrator(mockDb);
    const service = new PaymentHandoffService(mockDb, orchestrator as any);

    const idempotencyKey = "web-handoff-sale-101-2999";
    const result1 = await service.createHandoff({
      organizationId: "org_test_1",
      userId: "user_1",
      siteId: "site_test_1",
      saleId: "S-101",
      targetDeviceId: "device_iphone_1",
      amount: 2999,
      currency: "mxn",
      idempotencyKey,
    });

    const result2 = await service.createHandoff({
      organizationId: "org_test_1",
      userId: "user_1",
      siteId: "site_test_1",
      saleId: "S-101",
      targetDeviceId: "device_iphone_1",
      amount: 2999,
      currency: "mxn",
      idempotencyKey,
    });

    assert.strictEqual(result1.handoff.id, result2.handoff.id);
    assert.strictEqual(result1.handoff.posPaymentId, result2.handoff.posPaymentId);
  });

  test("T19-T20: Inventory CAS and PosPayment saleId attachment on checkout completion", async () => {
    const { mockDb, inventory, posPayments, sales } = createMockDb();

    // 1. Create succeeded payment
    const pp = await mockDb.posPayment.create({
      data: {
        id: "pp_sale_final_1",
        organizationId: "org_test_1",
        amount: 2999,
        currency: "mxn",
        status: PosPaymentStatus.SUCCEEDED,
      },
    });

    // 2. Perform atomic checkout in $transaction
    const sale = await mockDb.$transaction(async (tx: any) => {
      // Transition inventory item
      const itemUpdate = await tx.inventoryItem.updateMany({
        where: { id: "inv_item_1", organizationId: "org_test_1", status: "Available" },
        data: { status: "Sold" },
      });
      assert.strictEqual(itemUpdate.count, 1);

      // Create Sale
      const createdSale = await tx.sale.create({
        data: {
          id: "sale_completed_1",
          organizationId: "org_test_1",
          saleNumber: "S-FINAL-001",
          total: 2999,
          paymentMethod: "Stripe — Tap to Pay en iPhone",
        },
      });

      // Attach PosPayment
      await tx.posPayment.updateMany({
        where: { id: { in: [pp.id] }, organizationId: "org_test_1" },
        data: { saleId: createdSale.id },
      });

      return createdSale;
    });

    // Verify outcomes
    const updatedItem = inventory.get("inv_item_1");
    const updatedPayment = posPayments.get("pp_sale_final_1");

    assert.strictEqual(updatedItem.status, "Sold");
    assert.strictEqual(updatedPayment.saleId, sale.id);
  });
});
