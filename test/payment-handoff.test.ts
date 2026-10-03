import { test, describe } from "node:test";
import assert from "node:assert";
import {
  PaymentHandoffStatus,
  POSDeviceType,
  PaymentChannel,
  PosPaymentStatus,
  PaymentAttemptStatus,
} from "@prisma/client";
import {
  isValidHandoffTransition,
  assertValidHandoffTransition,
  InvalidStateTransitionError,
} from "../src/lib/payments/state-machine";
import { PaymentHandoffService } from "../src/lib/payments/payment-handoff-service";
import { PaymentValidationError } from "../src/lib/payments/validation";

describe("PHASE PAYMENT-05: Payment Handoff State Machine & Invariants", () => {
  test("State Machine: Valid PaymentHandoff forward lifecycle transitions", () => {
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.CREATED, PaymentHandoffStatus.ASSIGNED), true);
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.CREATED, PaymentHandoffStatus.WAITING_FOR_DEVICE), true);
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.CREATED, PaymentHandoffStatus.CANCELED), true);
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.CREATED, PaymentHandoffStatus.EXPIRED), true);

    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.ASSIGNED, PaymentHandoffStatus.ACCEPTED), true);
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.ASSIGNED, PaymentHandoffStatus.CANCELED), true);
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.ASSIGNED, PaymentHandoffStatus.EXPIRED), true);
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.ASSIGNED, PaymentHandoffStatus.FAILED), true);

    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.ACCEPTED, PaymentHandoffStatus.PAYMENT_PROCESSING), true);
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.ACCEPTED, PaymentHandoffStatus.CANCELED), true);
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.ACCEPTED, PaymentHandoffStatus.FAILED), true);

    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.PAYMENT_PROCESSING, PaymentHandoffStatus.VERIFYING), true);
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.PAYMENT_PROCESSING, PaymentHandoffStatus.UNKNOWN), true);
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.PAYMENT_PROCESSING, PaymentHandoffStatus.FAILED), true);

    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.VERIFYING, PaymentHandoffStatus.SUCCEEDED), true);
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.VERIFYING, PaymentHandoffStatus.FAILED), true);
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.VERIFYING, PaymentHandoffStatus.UNKNOWN), true);

    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.UNKNOWN, PaymentHandoffStatus.SUCCEEDED), true);
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.UNKNOWN, PaymentHandoffStatus.FAILED), true);
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.UNKNOWN, PaymentHandoffStatus.CANCELED), true);
  });

  test("State Machine: Terminal state protections (SUCCEEDED, EXPIRED, CANCELED cannot transition)", () => {
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.SUCCEEDED, PaymentHandoffStatus.CREATED), false);
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.SUCCEEDED, PaymentHandoffStatus.CANCELED), false);
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.SUCCEEDED, PaymentHandoffStatus.FAILED), false);

    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.EXPIRED, PaymentHandoffStatus.ACCEPTED), false);
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.EXPIRED, PaymentHandoffStatus.SUCCEEDED), false);

    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.CANCELED, PaymentHandoffStatus.ACCEPTED), false);
    assert.strictEqual(isValidHandoffTransition(PaymentHandoffStatus.CANCELED, PaymentHandoffStatus.SUCCEEDED), false);
  });

  test("State Machine: assertValidHandoffTransition throws InvalidStateTransitionError on invalid jumps", () => {
    assert.throws(
      () => assertValidHandoffTransition(PaymentHandoffStatus.EXPIRED, PaymentHandoffStatus.ACCEPTED),
      (err: any) => err instanceof InvalidStateTransitionError && err.entity === "PaymentHandoff"
    );
    assert.throws(
      () => assertValidHandoffTransition(PaymentHandoffStatus.SUCCEEDED, PaymentHandoffStatus.CANCELED),
      (err: any) => err instanceof InvalidStateTransitionError && err.entity === "PaymentHandoff"
    );
  });
});

describe("PHASE PAYMENT-05: Payment Handoff Service & Orchestration Mock Tests", () => {
  function createMockDb() {
    const orgs = new Map<string, any>();
    const sites = new Map<string, any>();
    const posDevices = new Map<string, any>();
    const posPayments = new Map<string, any>();
    const paymentAttempts = new Map<string, any>();
    const stripeRecords = new Map<string, any>();
    const handoffs = new Map<string, any>();

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
          return Array.from(posDevices.values()).filter((d) => {
            if (where.organizationId && d.organizationId !== where.organizationId) return false;
            if (where.siteId && d.siteId !== where.siteId) return false;
            if (where.deviceType && d.deviceType !== where.deviceType) return false;
            return true;
          });
        },
      },
      paymentHandoff: {
        findFirst: async ({ where }: any) => {
          for (const h of handoffs.values()) {
            if (where.id && h.id !== where.id) continue;
            if (where.organizationId && h.organizationId !== where.organizationId) continue;
            if (where.idempotencyKey && h.idempotencyKey !== where.idempotencyKey) continue;
            return h;
          }
          return null;
        },
        findMany: async ({ where }: any) => {
          return Array.from(handoffs.values()).filter((h) => {
            if (where.organizationId && h.organizationId !== where.organizationId) return false;
            if (where.siteId && h.siteId !== where.siteId) return false;
            if (where.targetDeviceId && h.targetDeviceId !== where.targetDeviceId && h.targetDeviceId !== null) return false;
            if (where.status?.in && !where.status.in.includes(h.status)) return false;
            return true;
          });
        },
        create: async ({ data, include }: any) => {
          const id = data.id || `handoff_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const record = {
            id,
            ...data,
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            sourceDevice: data.sourceDeviceId ? posDevices.get(data.sourceDeviceId) : null,
            targetDevice: data.targetDeviceId ? posDevices.get(data.targetDeviceId) : null,
            posPayment: posPayments.get(data.posPaymentId) || {
              id: data.posPaymentId,
              stripePayment: null,
              attempts: [],
            },
          };
          handoffs.set(id, record);
          return record;
        },
        findUnique: async ({ where }: any) => {
          return handoffs.get(where.id) || null;
        },
        update: async ({ where, data }: any) => {
          const existing = handoffs.get(where.id);
          if (!existing) throw new Error("Not found");
          const updated = {
            ...existing,
            ...data,
            version: data.version?.increment ? existing.version + 1 : data.version || existing.version,
            updatedAt: new Date(),
          };
          handoffs.set(where.id, updated);
          return updated;
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const h of handoffs.values()) {
            if (where.id && h.id !== where.id) continue;
            if (where.organizationId && h.organizationId !== where.organizationId) continue;
            if (where.status?.in && !where.status.in.includes(h.status)) continue;
            if (where.status && typeof where.status === "string" && h.status !== where.status) continue;
            if (where.expiresAt?.gt && !(h.expiresAt > new Date())) continue;
            if (where.targetDeviceId && h.targetDeviceId !== where.targetDeviceId) continue;

            Object.assign(h, data, { updatedAt: new Date() });
            if (data.version?.increment) h.version = (h.version || 1) + data.version.increment;
            count++;
          }
          return { count };
        },
      },
      posPayment: {
        findFirst: async () => null,
        create: async ({ data }: any) => {
          const id = `pos_pay_${Date.now()}`;
          const record = { id, ...data, attempts: [], stripePayment: null };
          posPayments.set(id, record);
          return record;
        },
        update: async ({ where, data }: any) => {
          const ex = posPayments.get(where.id) || { id: where.id };
          const up = { ...ex, ...data };
          posPayments.set(where.id, up);
          return up;
        },
      },
      paymentAttempt: {
        create: async ({ data }: any) => {
          const id = `att_${Date.now()}`;
          const record = { id, ...data };
          paymentAttempts.set(id, record);
          const pay = posPayments.get(data.paymentId);
          if (pay) pay.attempts.push(record);
          return record;
        },
        update: async ({ where, data }: any) => {
          const ex = paymentAttempts.get(where.id) || { id: where.id };
          const up = { ...ex, ...data };
          paymentAttempts.set(where.id, up);
          return up;
        },
      },
      stripePaymentRecord: {
        create: async ({ data }: any) => {
          const id = `rec_${Date.now()}`;
          const record = { id, ...data };
          stripeRecords.set(id, record);
          const pay = posPayments.get(data.posPaymentId);
          if (pay) pay.stripePayment = record;
          return record;
        },
        update: async () => ({}),
      },
      $transaction: async (fn: any) => {
        return fn(mockDb);
      },
    };

    return {
      mockDb,
      orgs,
      sites,
      posDevices,
      posPayments,
      paymentAttempts,
      handoffs,
    };
  }

  test("Handoff creation: rejects when stripeTapToPayEnabled capability is disabled", async () => {
    const { mockDb, orgs } = createMockDb();
    orgs.set("org_01", {
      id: "org_01",
      name: "Distributor A",
      paymentCapabilitiesJson: { stripeTapToPayEnabled: false },
    });

    const mockOrchestrator: any = {};
    const service = new PaymentHandoffService(mockDb, mockOrchestrator);

    await assert.rejects(
      () =>
        service.createHandoff({
          organizationId: "org_01",
          userId: "user_01",
          amount: 500,
        }),
      (err: any) => err instanceof PaymentValidationError && err.code === "CAPABILITY_DISABLED"
    );
  });

  test("Handoff creation: rejects target device that does not belong to same organization or is not IPHONE_TAP_TO_PAY", async () => {
    const { mockDb, orgs, posDevices } = createMockDb();
    orgs.set("org_01", {
      id: "org_01",
      paymentCapabilitiesJson: { stripeTapToPayEnabled: true },
    });
    posDevices.set("dev_ipad", {
      id: "dev_ipad",
      organizationId: "org_01",
      deviceType: POSDeviceType.IPAD_POS,
      status: "ACTIVE",
    });

    const mockOrchestrator: any = {};
    const service = new PaymentHandoffService(mockDb, mockOrchestrator);

    // Reject target device with IPAD_POS type
    await assert.rejects(
      () =>
        service.createHandoff({
          organizationId: "org_01",
          userId: "user_01",
          targetDeviceId: "dev_ipad",
          amount: 500,
        }),
      (err: any) => err instanceof PaymentValidationError && err.code === "INVALID_TARGET_DEVICE_TYPE"
    );
  });

  test("Handoff creation & acceptance: creates ASSIGNED handoff and accepts atomically", async () => {
    const { mockDb, orgs, posDevices } = createMockDb();
    orgs.set("org_01", {
      id: "org_01",
      paymentCapabilitiesJson: { stripeTapToPayEnabled: true },
    });
    posDevices.set("dev_iphone_01", {
      id: "dev_iphone_01",
      organizationId: "org_01",
      deviceName: "iPhone Caja 1",
      deviceType: POSDeviceType.IPHONE_TAP_TO_PAY,
      status: "ACTIVE",
    });

    const mockOrchestrator: any = {
      createPaymentIntent: async () => ({
        posPaymentId: "pos_pay_01",
        paymentAttemptId: "att_01",
        stripePaymentIntentId: "pi_test_12345",
        clientSecret: "pi_test_12345_secret_abc",
        amount: 1200,
        currency: "MXN",
      }),
    };

    const service = new PaymentHandoffService(mockDb, mockOrchestrator);

    const created = await service.createHandoff({
      organizationId: "org_01",
      userId: "user_ipad",
      targetDeviceId: "dev_iphone_01",
      amount: 1200,
      currency: "mxn",
    });

    assert.strictEqual(created.handoff.status, PaymentHandoffStatus.ASSIGNED);
    assert.strictEqual(created.handoff.amount, 1200);
    assert.strictEqual(created.handoff.targetDeviceId, "dev_iphone_01");

    // Target iPhone accepts handoff
    const accepted = await service.acceptHandoff({
      organizationId: "org_01",
      userId: "user_iphone",
      handoffId: created.handoff.id,
      targetDeviceId: "dev_iphone_01",
    });

    assert.strictEqual(accepted.handoff.status, PaymentHandoffStatus.ACCEPTED);
    assert.strictEqual(accepted.handoff.acceptedByUserId, "user_iphone");
  });

  test("Concurrency protection: second iPhone cannot accept already assigned/accepted handoff", async () => {
    const { mockDb, orgs, posDevices } = createMockDb();
    orgs.set("org_01", {
      id: "org_01",
      paymentCapabilitiesJson: { stripeTapToPayEnabled: true },
    });
    posDevices.set("dev_iphone_01", {
      id: "dev_iphone_01",
      organizationId: "org_01",
      deviceName: "iPhone Caja 1",
      deviceType: POSDeviceType.IPHONE_TAP_TO_PAY,
      status: "ACTIVE",
    });
    posDevices.set("dev_iphone_02", {
      id: "dev_iphone_02",
      organizationId: "org_01",
      deviceName: "iPhone Caja 2",
      deviceType: POSDeviceType.IPHONE_TAP_TO_PAY,
      status: "ACTIVE",
    });

    const mockOrchestrator: any = {
      createPaymentIntent: async () => ({
        posPaymentId: "pos_pay_01",
        paymentAttemptId: "att_01",
        stripePaymentIntentId: "pi_test_concurrency",
        clientSecret: "pi_test_secret",
        amount: 850,
      }),
    };

    const service = new PaymentHandoffService(mockDb, mockOrchestrator);

    const created = await service.createHandoff({
      organizationId: "org_01",
      userId: "user_ipad",
      targetDeviceId: "dev_iphone_01",
      amount: 850,
    });

    // iPhone 1 accepts
    await service.acceptHandoff({
      organizationId: "org_01",
      userId: "user_iphone_1",
      handoffId: created.handoff.id,
      targetDeviceId: "dev_iphone_01",
    });

    // iPhone 2 attempts to accept same handoff -> must fail
    await assert.rejects(
      () =>
        service.acceptHandoff({
          organizationId: "org_01",
          userId: "user_iphone_2",
          handoffId: created.handoff.id,
          targetDeviceId: "dev_iphone_02",
        }),
      (err: any) => err instanceof PaymentValidationError
    );
  });

  test("Expiration TTL: expired handoff cannot be accepted", async () => {
    const { mockDb, orgs, posDevices, handoffs } = createMockDb();
    orgs.set("org_01", {
      id: "org_01",
      paymentCapabilitiesJson: { stripeTapToPayEnabled: true },
    });
    posDevices.set("dev_iphone_01", {
      id: "dev_iphone_01",
      organizationId: "org_01",
      deviceType: POSDeviceType.IPHONE_TAP_TO_PAY,
      status: "ACTIVE",
    });

    const mockOrchestrator: any = {
      createPaymentIntent: async () => ({
        posPaymentId: "pos_01",
        paymentAttemptId: "att_01",
        stripePaymentIntentId: "pi_expired",
        clientSecret: "sec",
        amount: 300,
      }),
    };

    const service = new PaymentHandoffService(mockDb, mockOrchestrator);

    const created = await service.createHandoff({
      organizationId: "org_01",
      userId: "user_01",
      targetDeviceId: "dev_iphone_01",
      amount: 300,
    });

    // Artificially expire the record in mock DB
    const record = handoffs.get(created.handoff.id);
    record.expiresAt = new Date(Date.now() - 10000); // 10s in past

    await assert.rejects(
      () =>
        service.acceptHandoff({
          organizationId: "org_01",
          userId: "user_iphone",
          handoffId: created.handoff.id,
          targetDeviceId: "dev_iphone_01",
        }),
      (err: any) => err instanceof PaymentValidationError && err.code === "HANDOFF_EXPIRED"
    );
  });

  test("Safe cancellation: iPad can cancel before payment processing begins", async () => {
    const { mockDb, orgs, posDevices } = createMockDb();
    orgs.set("org_01", {
      id: "org_01",
      paymentCapabilitiesJson: { stripeTapToPayEnabled: true },
    });
    posDevices.set("dev_iphone_01", {
      id: "dev_iphone_01",
      organizationId: "org_01",
      deviceType: POSDeviceType.IPHONE_TAP_TO_PAY,
      status: "ACTIVE",
    });

    const mockOrchestrator: any = {
      createPaymentIntent: async () => ({
        posPaymentId: "pos_01",
        paymentAttemptId: "att_01",
        stripePaymentIntentId: "pi_cancel",
        clientSecret: "sec",
        amount: 400,
      }),
      cancelPaymentIntent: async () => ({ success: true }),
    };

    const service = new PaymentHandoffService(mockDb, mockOrchestrator);

    const created = await service.createHandoff({
      organizationId: "org_01",
      userId: "user_ipad",
      targetDeviceId: "dev_iphone_01",
      amount: 400,
    });

    const canceled = await service.cancelHandoff({
      organizationId: "org_01",
      userId: "user_ipad",
      handoffId: created.handoff.id,
      reason: "Customer changed mind",
    });

    assert.strictEqual(canceled.status, PaymentHandoffStatus.CANCELED);
  });
});
