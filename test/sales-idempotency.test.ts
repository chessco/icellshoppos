import test from "node:test";
import assert from "node:assert/strict";
import {
  findSaleByIdempotencyKey,
  isUniqueConstraintError,
  buildIdempotentReplayResponse,
  type ExistingSaleRecord,
} from "../src/lib/sales-idempotency.ts";

test("Idempotency: isUniqueConstraintError correctly identifies Prisma P2002", () => {
  // Prisma P2002 error shape
  const p2002Error = { code: "P2002", message: "Unique constraint failed" };
  assert.equal(isUniqueConstraintError(p2002Error), true);

  // Other Prisma error
  const p2025Error = { code: "P2025", message: "Record not found" };
  assert.equal(isUniqueConstraintError(p2025Error), false);

  // Generic errors
  assert.equal(isUniqueConstraintError(new Error("Unauthorized")), false);
  assert.equal(isUniqueConstraintError(null), false);
  assert.equal(isUniqueConstraintError(undefined), false);
});

test("Idempotency: buildIdempotentReplayResponse formats response correctly", () => {
  const saleRecord: ExistingSaleRecord = {
    id: "sale-uuid-123",
    saleNumber: "SALE-REPLAY-001",
    total: 15400,
    items: [
      {
        id: "item-1",
        inventoryItemId: "inv-1",
        imei: "354928110293847",
        model: "iPhone 13",
        capacity: "128GB",
        color: "Blue",
        salePrice: 15400,
      },
    ],
  };

  const response = buildIdempotentReplayResponse(saleRecord);
  assert.equal(response.success, true);
  assert.equal(response.saleId, "SALE-REPLAY-001");
  assert.equal(response.saleNumber, "SALE-REPLAY-001");
  assert.equal(response.total, 15400);
  assert.equal(response.idempotentReplay, true);
  assert.equal(response.items.length, 1);
  assert.equal(response.items[0].imei, "354928110293847");
  assert.equal(response.items[0].salePrice, 15400);
});

test("TEST 1 & 2: First checkout creates sale; second identical checkout returns existing sale without creating another", async () => {
  // In-memory simulation of database with unique [organizationId, saleNumber] constraint
  const salesTable: Array<{ id: string; organizationId: string; saleNumber: string; total: number }> = [];

  const mockDb = {
    sale: {
      findUnique: async ({ where }: { where: { organizationId_saleNumber: { organizationId: string; saleNumber: string } } }) => {
        const found = salesTable.find(
          (s) =>
            s.organizationId === where.organizationId_saleNumber.organizationId &&
            s.saleNumber === where.organizationId_saleNumber.saleNumber
        );
        return found || null;
      },
      create: async ({ data }: { data: { organizationId: string; saleNumber: string; total: number } }) => {
        const exists = salesTable.some(
          (s) => s.organizationId === data.organizationId && s.saleNumber === data.saleNumber
        );
        if (exists) {
          const err = new Error("Unique constraint failed");
          (err as any).code = "P2002";
          throw err;
        }
        const created = { id: `id-${Date.now()}`, ...data };
        salesTable.push(created);
        return created;
      },
    },
  };

  // Mock checkout handler matching POST /api/sales idempotency pipeline
  const processCheckout = async (orgId: string, saleId: string, amount: number) => {
    // 1. Initial Idempotency check
    const existing = await findSaleByIdempotencyKey(orgId, saleId, mockDb as any);
    if (existing) {
      return { status: 200, body: buildIdempotentReplayResponse(existing) };
    }

    // 2. Transaction create
    try {
      const created = await mockDb.sale.create({
        data: { organizationId: orgId, saleNumber: saleId, total: amount },
      });
      return { status: 200, body: { success: true, saleId: created.saleNumber, total: created.total } };
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        const recheck = await findSaleByIdempotencyKey(orgId, saleId, mockDb as any);
        if (recheck) {
          return { status: 200, body: buildIdempotentReplayResponse(recheck) };
        }
      }
      return { status: 500, error: "Internal server error", body: undefined };
    }
  };

  const saleId = "e3b0c442-98fc-1c14-9afb-4c72e043ae19";
  const orgId = "org-main-store";

  // TEST 1: First checkout
  const firstRes = await processCheckout(orgId, saleId, 8500);
  assert.equal(firstRes.status, 200);
  assert.ok(firstRes.body);
  assert.equal(firstRes.body.saleId, saleId);
  assert.equal(firstRes.body.total, 8500);
  assert.equal((firstRes.body as any).idempotentReplay, undefined);
  assert.equal(salesTable.length, 1);

  // TEST 2: Second identical checkout with same saleId
  const secondRes = await processCheckout(orgId, saleId, 8500);
  assert.equal(secondRes.status, 200);
  assert.ok(secondRes.body);
  assert.equal(secondRes.body.saleId, saleId);
  assert.equal(secondRes.body.total, 8500);
  assert.equal((secondRes.body as any).idempotentReplay, true);
  // Ensure NO second sale was created
  assert.equal(salesTable.length, 1);
});

test("TEST 3: Same saleId from a different organization does NOT resolve the first organization's sale", async () => {
  const salesTable: Array<{ id: string; organizationId: string; saleNumber: string; total: number }> = [
    { id: "sale-1", organizationId: "org-alpha", saleNumber: "SHARED-UUID-1234", total: 5000 },
  ];

  const mockDb = {
    sale: {
      findUnique: async ({ where }: { where: { organizationId_saleNumber: { organizationId: string; saleNumber: string } } }) => {
        const found = salesTable.find(
          (s) =>
            s.organizationId === where.organizationId_saleNumber.organizationId &&
            s.saleNumber === where.organizationId_saleNumber.saleNumber
        );
        return found || null;
      },
    },
  };

  // Check from org-beta with the same saleId
  const resultForOrgBeta = await findSaleByIdempotencyKey("org-beta", "SHARED-UUID-1234", mockDb as any);

  // MUST be null because org-alpha's sale does NOT belong to org-beta
  assert.equal(resultForOrgBeta, null);

  // Check from org-alpha with the same saleId MUST find it
  const resultForOrgAlpha = await findSaleByIdempotencyKey("org-alpha", "SHARED-UUID-1234", mockDb as any);
  assert.ok(resultForOrgAlpha);
  assert.equal(resultForOrgAlpha.saleNumber, "SHARED-UUID-1234");
});

test("TEST 4 & 5: Concurrent duplicate requests do not create duplicate sales and do NOT return HTTP 500", async () => {
  const salesTable: Array<{ id: string; organizationId: string; saleNumber: string; total: number }> = [];

  const mockDb = {
    sale: {
      findUnique: async ({ where }: { where: { organizationId_saleNumber: { organizationId: string; saleNumber: string } } }) => {
        return (
          salesTable.find(
            (s) =>
              s.organizationId === where.organizationId_saleNumber.organizationId &&
              s.saleNumber === where.organizationId_saleNumber.saleNumber
          ) || null
        );
      },
      create: async ({ data }: { data: { organizationId: string; saleNumber: string; total: number } }) => {
        // Simulate concurrent race: if already committed, throw Prisma P2002
        if (salesTable.some((s) => s.organizationId === data.organizationId && s.saleNumber === data.saleNumber)) {
          const p2002 = new Error("Unique constraint failed on the fields: (`organizationId`,`saleNumber`)");
          (p2002 as any).code = "P2002";
          throw p2002;
        }
        const created = { id: `id-${Math.random()}`, ...data };
        salesTable.push(created);
        return created;
      },
    },
  };

  const processConcurrentCheckout = async (orgId: string, saleId: string, delayMs: number) => {
    // Both concurrent requests start at the same time and find no existing sale
    await new Promise((r) => setTimeout(r, delayMs));

    // Try transaction creation
    try {
      const created = await mockDb.sale.create({
        data: { organizationId: orgId, saleNumber: saleId, total: 12000 },
      });
      return { status: 200, body: { success: true, saleId: created.saleNumber, total: created.total } };
    } catch (err) {
      // P2002 handler
      if (isUniqueConstraintError(err)) {
        const recheck = await findSaleByIdempotencyKey(orgId, saleId, mockDb as any);
        if (recheck) {
          return { status: 200, body: buildIdempotentReplayResponse(recheck) };
        }
      }
      return { status: 500, error: "Internal server error" };
    }
  };

  const concurrentSaleId = "concurrent-uuid-999";
  const orgId = "org-concurrency-test";

  // Fire two concurrent requests
  const [req1, req2] = await Promise.all([
    processConcurrentCheckout(orgId, concurrentSaleId, 5),
    processConcurrentCheckout(orgId, concurrentSaleId, 10),
  ]);

  // Both requests MUST return status 200, NOT 500
  assert.equal(req1.status, 200);
  assert.equal(req2.status, 200);

  // Exactly one sale exists in database
  assert.equal(salesTable.length, 1);
  assert.equal(salesTable[0].saleNumber, concurrentSaleId);

  // One of them is fresh and the other is an idempotent replay
  const hasReplay = (req1.body as any).idempotentReplay === true || (req2.body as any).idempotentReplay === true;
  assert.equal(hasReplay, true);
});
