import test from "node:test";
import assert from "node:assert/strict";
import {
  findSaleByIdempotencyKey,
  isUniqueConstraintError,
  buildIdempotentReplayResponse,
  type ExistingSaleRecord,
} from "../src/lib/sales-idempotency.ts";
import {
  InventoryUnavailableError,
  buildInventoryUnavailableResponse,
  isInventoryUnavailableError,
  validateNoDuplicateItemsInPayload,
} from "../src/lib/inventory-concurrency.ts";
import type { BackendSaleCreatedResponse, SaleResponseItem } from "../packages/contracts/src/checkout.ts";

interface InventoryRow {
  id: string;
  organizationId: string;
  imei: string;
  model: string;
  capacity: string;
  color: string;
  costPesos: number;
  status: "Available" | "Sold";
}

interface SaleRow {
  id: string;
  organizationId: string;
  customerId: string | null;
  saleNumber: string;
  subtotal: number;
  total: number;
  paymentMethod: string | null;
  soldBy: string | null;
  createdAt: Date;
}

interface SaleItemRow {
  id: string;
  saleId: string;
  inventoryItemId: string | null;
  imei: string;
  model: string;
  capacity: string;
  color: string;
  salePrice: number;
  cost: number;
}

function createAuthoritativeTestEnv() {
  const inventoryDb: InventoryRow[] = [];
  const salesDb: SaleRow[] = [];
  const saleItemsDb: SaleItemRow[] = [];

  const mockDb = {
    sale: {
      findUnique: async ({
        where,
      }: {
        where: {
          organizationId_saleNumber: {
            organizationId: string;
            saleNumber: string;
          };
        };
      }) => {
        const found = salesDb.find(
          (s) =>
            s.organizationId === where.organizationId_saleNumber.organizationId &&
            s.saleNumber === where.organizationId_saleNumber.saleNumber
        );
        if (!found) return null;

        const items = saleItemsDb.filter((si) => si.saleId === found.id);
        return {
          id: found.id,
          saleNumber: found.saleNumber,
          total: found.total,
          paymentMethod: found.paymentMethod,
          createdAt: found.createdAt,
          customer: {
            id: "cust-1",
            name: "Juan Perez",
            email: "juan@example.com",
            whatsapp: "+525512345678",
          },
          items: items.map((it) => ({
            id: it.id,
            inventoryItemId: it.inventoryItemId,
            imei: it.imei,
            model: it.model,
            capacity: it.capacity,
            color: it.color,
            salePrice: it.salePrice,
            // Notice: cost is NOT selected in findSaleByIdempotencyKey query!
          })),
        };
      },
    },
  };

  const simulateAuthoritativeCheckout = async (
    orgId: string,
    payload: {
      saleId?: string;
      customerName?: string;
      paymentMethod?: string;
      items: Array<{
        inventoryItemId?: string;
        imei: string;
        salePrice: number;
      }>;
    }
  ): Promise<{ status: number; body: any }> => {
    const requestedSaleId = payload.saleId?.trim();

    // 1. Fast-path Idempotency check
    if (requestedSaleId && orgId) {
      const existingSale = await findSaleByIdempotencyKey(orgId, requestedSaleId, mockDb as any);
      if (existingSale) {
        return { status: 200, body: buildIdempotentReplayResponse(existingSale) };
      }
    }

    // 2. Pre-flight duplicate check
    const dupCheck = validateNoDuplicateItemsInPayload(payload.items);
    if (!dupCheck.valid) {
      return {
        status: 400,
        body: { success: false, error: "DUPLICATE_INVENTORY_ITEM", message: dupCheck.error },
      };
    }

    // 3. Pre-flight inventory availability check
    const unavailable: string[] = [];
    for (const item of payload.items) {
      const inv = inventoryDb.find(
        (i) =>
          i.organizationId === orgId &&
          (i.id === item.inventoryItemId || i.imei === item.imei)
      );
      if (!inv || inv.status !== "Available") {
        unavailable.push(item.inventoryItemId || item.imei);
      }
    }

    if (unavailable.length > 0) {
      return {
        status: 409,
        body: buildInventoryUnavailableResponse(unavailable),
      };
    }

    // 4. Transaction simulation
    try {
      // Check for concurrent duplicate creation (P2002)
      if (
        requestedSaleId &&
        salesDb.some((s) => s.organizationId === orgId && s.saleNumber === requestedSaleId)
      ) {
        const p2002 = new Error("Unique constraint failed on (organizationId, saleNumber)");
        (p2002 as any).code = "P2002";
        throw p2002;
      }

      // Mark inventory as Sold
      for (const item of payload.items) {
        const inv = inventoryDb.find(
          (i) =>
            i.organizationId === orgId &&
            (i.id === item.inventoryItemId || i.imei === item.imei) &&
            i.status === "Available"
        );
        if (!inv) {
          throw new InventoryUnavailableError([item.inventoryItemId || item.imei]);
        }
        inv.status = "Sold";
      }

      // Backend authoritatively calculates total
      const totalAmount = payload.items.reduce((sum, it) => sum + Number(it.salePrice), 0);
      const saleId = requestedSaleId || `S-${Date.now()}`;
      const newSaleId = `sale-${salesDb.length + 1}`;

      const saleRecord: SaleRow = {
        id: newSaleId,
        organizationId: orgId,
        customerId: "cust-1",
        saleNumber: saleId,
        subtotal: totalAmount,
        total: totalAmount,
        paymentMethod: payload.paymentMethod || "Cash",
        soldBy: "pos@icellshop.com",
        createdAt: new Date(),
      };
      salesDb.push(saleRecord);

      // Create SaleItems
      const createdItems: SaleItemRow[] = payload.items.map((item, idx) => {
        const inv = inventoryDb.find(
          (i) => i.id === item.inventoryItemId || i.imei === item.imei
        );
        const row: SaleItemRow = {
          id: `item-${saleItemsDb.length + idx + 1}`,
          saleId: newSaleId,
          inventoryItemId: inv?.id || null,
          imei: item.imei,
          model: inv?.model || "iPhone 13",
          capacity: inv?.capacity || "128GB",
          color: inv?.color || "Midnight",
          salePrice: Number(item.salePrice),
          cost: inv?.costPesos || 8000,
        };
        saleItemsDb.push(row);
        return row;
      });

      // Authoritative response mapped from created records (NO cost leakage)
      const responseItems: SaleResponseItem[] = createdItems.map((item) => ({
        id: item.id,
        inventoryItemId: item.inventoryItemId ?? undefined,
        imei: item.imei,
        model: item.model,
        capacity: item.capacity,
        color: item.color,
        salePrice: Number(item.salePrice),
      }));

      const response: BackendSaleCreatedResponse = {
        success: true,
        saleId: saleRecord.saleNumber,
        saleNumber: saleRecord.saleNumber,
        total: Number(saleRecord.total),
        paymentMethod: saleRecord.paymentMethod ?? undefined,
        createdAt: saleRecord.createdAt.toISOString(),
        items: responseItems,
        customer: {
          id: "cust-1",
          name: payload.customerName || "Customer",
        },
      };

      return { status: 200, body: response };
    } catch (err) {
      if (isInventoryUnavailableError(err)) {
        return {
          status: 409,
          body: buildInventoryUnavailableResponse(err.unavailableItemIds),
        };
      }
      if (isUniqueConstraintError(err) && requestedSaleId) {
        const existingSale = await findSaleByIdempotencyKey(orgId, requestedSaleId, mockDb as any);
        if (existingSale) {
          return { status: 200, body: buildIdempotentReplayResponse(existingSale) };
        }
      }
      return { status: 500, body: { error: "Internal server error" } };
    }
  };

  return { inventoryDb, salesDb, saleItemsDb, simulateAuthoritativeCheckout };
}

test("TEST 1: Successful sale returns success, saleId, total, and items", async () => {
  const env = createAuthoritativeTestEnv();
  env.inventoryDb.push({
    id: "inv-001",
    organizationId: "org-1",
    imei: "356982101234567",
    model: "iPhone 13",
    capacity: "128GB",
    color: "Midnight",
    costPesos: 9500,
    status: "Available",
  });

  const res = await env.simulateAuthoritativeCheckout("org-1", {
    customerName: "Juan Perez",
    paymentMethod: "Cash",
    items: [
      {
        inventoryItemId: "inv-001",
        imei: "356982101234567",
        salePrice: 14500,
      },
    ],
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(typeof res.body.saleId === "string" && res.body.saleId.length > 0);
  assert.equal(typeof res.body.total, "number");
  assert.ok(Array.isArray(res.body.items));
  assert.equal(res.body.items.length, 1);
  assert.equal(res.body.items[0].inventoryItemId, "inv-001");
  assert.equal(res.body.items[0].imei, "356982101234567");
  assert.equal(res.body.items[0].salePrice, 14500);
});

test("TEST 2: Returned total matches authoritative backend Sale total", async () => {
  const env = createAuthoritativeTestEnv();
  env.inventoryDb.push(
    {
      id: "inv-101",
      organizationId: "org-1",
      imei: "356982101000001",
      model: "iPhone 14",
      capacity: "128GB",
      color: "Blue",
      costPesos: 12000,
      status: "Available",
    },
    {
      id: "inv-102",
      organizationId: "org-1",
      imei: "356982101000002",
      model: "iPhone 13",
      capacity: "256GB",
      color: "Starlight",
      costPesos: 10000,
      status: "Available",
    }
  );

  const res = await env.simulateAuthoritativeCheckout("org-1", {
    customerName: "Ana Lopez",
    paymentMethod: "Card",
    items: [
      { inventoryItemId: "inv-101", imei: "356982101000001", salePrice: 16500 },
      { inventoryItemId: "inv-102", imei: "356982101000002", salePrice: 14000 },
    ],
  });

  assert.equal(res.status, 200);
  // Authoritative total is 16500 + 14000 = 30500
  assert.equal(res.body.total, 30500);

  // Cross check against persisted record in salesDb
  assert.equal(env.salesDb.length, 1);
  assert.equal(env.salesDb[0].total, res.body.total);
});

test("TEST 3: Returned item prices match persisted SaleItem values", async () => {
  const env = createAuthoritativeTestEnv();
  env.inventoryDb.push({
    id: "inv-301",
    organizationId: "org-1",
    imei: "356982109999999",
    model: "iPhone 15 Pro",
    capacity: "256GB",
    color: "Natural Titanium",
    costPesos: 18000,
    status: "Available",
  });

  const res = await env.simulateAuthoritativeCheckout("org-1", {
    customerName: "Carlos Slim",
    paymentMethod: "Transfer",
    items: [
      { inventoryItemId: "inv-301", imei: "356982109999999", salePrice: 23999 },
    ],
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.items.length, 1);
  assert.equal(res.body.items[0].salePrice, 23999);

  // Verify against persisted SaleItem in saleItemsDb
  const persistedSaleItem = env.saleItemsDb.find((si) => si.imei === "356982109999999");
  assert.ok(persistedSaleItem);
  assert.equal(persistedSaleItem.salePrice, res.body.items[0].salePrice);
});

test("TEST 4: Idempotent replay returns the same saleId, total, items and sets idempotentReplay = true", async () => {
  const env = createAuthoritativeTestEnv();
  env.inventoryDb.push({
    id: "inv-401",
    organizationId: "org-1",
    imei: "356982104444444",
    model: "iPhone 12",
    capacity: "64GB",
    color: "Black",
    costPesos: 6000,
    status: "Available",
  });

  const fixedSaleId = "IDEMPOTENT-CHECKOUT-TEST-4";

  // First checkout
  const firstRes = await env.simulateAuthoritativeCheckout("org-1", {
    saleId: fixedSaleId,
    customerName: "Maria Garcia",
    paymentMethod: "Cash",
    items: [
      { inventoryItemId: "inv-401", imei: "356982104444444", salePrice: 9500 },
    ],
  });

  assert.equal(firstRes.status, 200);
  assert.equal(firstRes.body.saleId, fixedSaleId);
  assert.equal(firstRes.body.total, 9500);
  assert.equal(firstRes.body.items.length, 1);
  assert.equal(firstRes.body.idempotentReplay, undefined);

  // Second checkout with the same saleId
  const replayRes = await env.simulateAuthoritativeCheckout("org-1", {
    saleId: fixedSaleId,
    customerName: "Maria Garcia",
    paymentMethod: "Cash",
    items: [
      { inventoryItemId: "inv-401", imei: "356982104444444", salePrice: 9500 },
    ],
  });

  assert.equal(replayRes.status, 200);
  assert.equal(replayRes.body.saleId, fixedSaleId);
  assert.equal(replayRes.body.total, 9500);
  assert.equal(replayRes.body.items.length, 1);
  assert.equal(replayRes.body.items[0].imei, "356982104444444");
  assert.equal(replayRes.body.items[0].salePrice, 9500);
  assert.equal(replayRes.body.idempotentReplay, true);
});

test("TEST 5: Idempotent replay does NOT create another Sale", async () => {
  const env = createAuthoritativeTestEnv();
  env.inventoryDb.push({
    id: "inv-501",
    organizationId: "org-1",
    imei: "356982105555555",
    model: "iPhone 11",
    capacity: "64GB",
    color: "Purple",
    costPesos: 4500,
    status: "Available",
  });

  const replayId = "NO-DUPLICATE-SALE-TEST-5";

  // Initial call
  await env.simulateAuthoritativeCheckout("org-1", {
    saleId: replayId,
    items: [{ inventoryItemId: "inv-501", imei: "356982105555555", salePrice: 7000 }],
  });

  assert.equal(env.salesDb.length, 1);
  assert.equal(env.saleItemsDb.length, 1);

  // Replay calls
  await env.simulateAuthoritativeCheckout("org-1", {
    saleId: replayId,
    items: [{ inventoryItemId: "inv-501", imei: "356982105555555", salePrice: 7000 }],
  });
  await env.simulateAuthoritativeCheckout("org-1", {
    saleId: replayId,
    items: [{ inventoryItemId: "inv-501", imei: "356982105555555", salePrice: 7000 }],
  });

  // MUST still be exactly 1 sale and 1 saleItem
  assert.equal(env.salesDb.length, 1);
  assert.equal(env.saleItemsDb.length, 1);
});

test("TEST 6: Inventory conflict remains HTTP 409", async () => {
  const env = createAuthoritativeTestEnv();
  env.inventoryDb.push({
    id: "inv-601",
    organizationId: "org-1",
    imei: "356982106666666",
    model: "iPhone 14 Pro",
    capacity: "128GB",
    color: "Deep Purple",
    costPesos: 15000,
    status: "Sold", // ALREADY SOLD
  });

  const res = await env.simulateAuthoritativeCheckout("org-1", {
    items: [{ inventoryItemId: "inv-601", imei: "356982106666666", salePrice: 20000 }],
  });

  assert.equal(res.status, 409);
  assert.equal(res.body.error, "INVENTORY_UNAVAILABLE");
  assert.deepEqual(res.body.unavailableItemIds, ["inv-601"]);
});

test("TEST 7: No internal cost price or sensitive data leaks through the response", async () => {
  const env = createAuthoritativeTestEnv();
  env.inventoryDb.push({
    id: "inv-701",
    organizationId: "org-1",
    imei: "356982107777777",
    model: "iPhone 15",
    capacity: "128GB",
    color: "Pink",
    costPesos: 13500, // HIGHLY SENSITIVE ACQUISITION COST
    status: "Available",
  });

  const res = await env.simulateAuthoritativeCheckout("org-1", {
    customerName: "Diana Prince",
    paymentMethod: "Cash",
    items: [
      { inventoryItemId: "inv-701", imei: "356982107777777", salePrice: 19500 },
    ],
  });

  assert.equal(res.status, 200);

  // Convert response to JSON string and examine payload
  const jsonString = JSON.stringify(res.body);

  // 1. Assert cost/costPesos/sourceCostPesos is NOT anywhere in the response
  assert.equal(jsonString.includes("costPesos"), false, "Must not leak costPesos");
  assert.equal(jsonString.includes("sourceCostPesos"), false, "Must not leak sourceCostPesos");
  assert.equal(jsonString.includes("13500"), false, "Must not leak the acquisition price value 13500");

  // 2. Assert no item contains cost
  for (const item of res.body.items) {
    assert.equal("cost" in item, false, "Item must not have 'cost' property");
    assert.equal("costPesos" in item, false, "Item must not have 'costPesos' property");
    assert.equal("marginPesos" in item, false, "Item must not have 'marginPesos' property");
  }

  // 3. Assert no sensitive tokens, passwords, secrets
  assert.equal("password" in res.body, false);
  assert.equal("token" in res.body, false);
  assert.equal("secret" in res.body, false);
});
