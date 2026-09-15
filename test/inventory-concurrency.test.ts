import test from "node:test";
import assert from "node:assert/strict";
import {
  InventoryUnavailableError,
  buildInventoryUnavailableResponse,
  isInventoryUnavailableError,
  validateNoDuplicateItemsInPayload,
} from "../src/lib/inventory-concurrency.ts";

test("InventoryConcurrency: validateNoDuplicateItemsInPayload detects duplicate IDs and IMEIs", () => {
  // Unique items
  const uniqueItems = [
    { inventoryItemId: "inv-1", imei: "356982101234567" },
    { inventoryItemId: "inv-2", imei: "356982109876543" },
  ];
  assert.equal(validateNoDuplicateItemsInPayload(uniqueItems).valid, true);

  // Duplicate ID
  const duplicateId = [
    { inventoryItemId: "inv-1", imei: "356982101234567" },
    { inventoryItemId: "inv-1", imei: "356982109876543" },
  ];
  const dupIdRes = validateNoDuplicateItemsInPayload(duplicateId);
  assert.equal(dupIdRes.valid, false);
  assert.match(dupIdRes.error || "", /Duplicate inventory items/);

  // Duplicate IMEI
  const duplicateImei = [
    { inventoryItemId: "inv-1", imei: "356982101234567" },
    { inventoryItemId: "inv-2", imei: "356982101234567" },
  ];
  const dupImeiRes = validateNoDuplicateItemsInPayload(duplicateImei);
  assert.equal(dupImeiRes.valid, false);
  assert.match(dupImeiRes.error || "", /Duplicate device IMEIs/);
});

test("InventoryConcurrency: isInventoryUnavailableError identifies error type correctly", () => {
  const err = new InventoryUnavailableError(["inv-1", "inv-2"]);
  assert.equal(isInventoryUnavailableError(err), true);
  assert.deepEqual(err.unavailableItemIds, ["inv-1", "inv-2"]);

  const genericErr = new Error("Some other error");
  assert.equal(isInventoryUnavailableError(genericErr), false);
  assert.equal(isInventoryUnavailableError(null), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Transactional Test Suite simulating the exact POST /api/sales pipeline
// ─────────────────────────────────────────────────────────────────────────────

interface InventoryRow {
  id: string;
  organizationId: string;
  imei: string;
  model: string;
  status: "Available" | "Sold";
}

interface SaleRow {
  id: string;
  organizationId: string;
  saleNumber: string;
}

interface SaleItemRow {
  id: string;
  saleId: string;
  inventoryItemId: string;
}

function createSimulationEnvironment() {
  const inventoryDb: InventoryRow[] = [];
  const salesDb: SaleRow[] = [];
  const saleItemsDb: SaleItemRow[] = [];

  const simulateCheckout = async (
    orgId: string,
    payload: {
      saleId?: string;
      items: Array<{ inventoryItemId?: string; imei?: string; salePrice: number }>;
    },
    delayMs = 0
  ) => {
    // 1. Idempotency fast-path
    if (payload.saleId) {
      const existing = salesDb.find(
        (s) => s.organizationId === orgId && s.saleNumber === payload.saleId
      );
      if (existing) {
        return {
          status: 200,
          body: { success: true, saleId: existing.saleNumber, idempotentReplay: true },
        };
      }
    }

    // 2. Duplicate item check
    const dupCheck = validateNoDuplicateItemsInPayload(payload.items);
    if (!dupCheck.valid) {
      return {
        status: 400,
        body: { success: false, error: "DUPLICATE_INVENTORY_ITEM", message: dupCheck.error },
      };
    }

    // 3. Pre-flight check
    const unavailableBeforeTx: string[] = [];
    for (const item of payload.items) {
      const match = inventoryDb.find(
        (inv) =>
          inv.organizationId === orgId &&
          (inv.id === item.inventoryItemId || inv.imei === item.imei)
      );
      if (!match || match.status !== "Available") {
        unavailableBeforeTx.push(item.inventoryItemId || item.imei || "UNKNOWN_ITEM");
      }
    }

    if (unavailableBeforeTx.length > 0) {
      return {
        status: 409,
        body: buildInventoryUnavailableResponse(unavailableBeforeTx),
      };
    }

    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }

    // 4. Atomic Transaction with Rollback Support
    const transactionSnapshots: Array<{ item: InventoryRow; previousStatus: "Available" | "Sold" }> = [];
    const pendingSales: SaleRow[] = [];
    const pendingSaleItems: SaleItemRow[] = [];

    try {
      // Step A: Atomic conditional transition (status: Available -> Sold)
      for (const item of payload.items) {
        const inv = inventoryDb.find(
          (i) =>
            i.organizationId === orgId &&
            (i.id === item.inventoryItemId || i.imei === item.imei)
        );

        if (!inv || inv.status !== "Available") {
          throw new InventoryUnavailableError(item.inventoryItemId || item.imei || "UNKNOWN");
        }

        // Apply update & record snapshot for potential rollback
        transactionSnapshots.push({ item: inv, previousStatus: inv.status });
        inv.status = "Sold";
      }

      // Step B: Create Sale & SaleItems
      const saleId = `sale-${Date.now()}-${Math.random()}`;
      const saleNumber = payload.saleId || `S-${Date.now()}`;
      const newSale: SaleRow = { id: saleId, organizationId: orgId, saleNumber };
      pendingSales.push(newSale);

      for (const item of payload.items) {
        pendingSaleItems.push({
          id: `item-${Date.now()}-${Math.random()}`,
          saleId,
          inventoryItemId: item.inventoryItemId || "inv-fallback",
        });
      }

      // Commit transaction
      salesDb.push(...pendingSales);
      saleItemsDb.push(...pendingSaleItems);

      return {
        status: 200,
        body: { success: true, saleId: newSale.saleNumber },
      };
    } catch (err) {
      // ROLLBACK: Revert all items modified in this transaction
      for (const snap of transactionSnapshots) {
        snap.item.status = snap.previousStatus;
      }

      if (isInventoryUnavailableError(err)) {
        return {
          status: 409,
          body: buildInventoryUnavailableResponse(err.unavailableItemIds),
        };
      }

      return { status: 500, body: { error: "Internal server error" } };
    }
  };

  return { inventoryDb, salesDb, saleItemsDb, simulateCheckout };
}

test("TEST 1: Available inventory item can be sold successfully", async () => {
  const env = createSimulationEnvironment();
  env.inventoryDb.push({
    id: "device-1",
    organizationId: "org-1",
    imei: "356982101234567",
    model: "iPhone 13",
    status: "Available",
  });

  const res = await env.simulateCheckout("org-1", {
    items: [{ inventoryItemId: "device-1", salePrice: 12000 }],
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(env.inventoryDb[0].status, "Sold");
  assert.equal(env.salesDb.length, 1);
  assert.equal(env.saleItemsDb.length, 1);
});

test("TEST 2: Already Sold inventory item returns HTTP 409", async () => {
  const env = createSimulationEnvironment();
  env.inventoryDb.push({
    id: "device-sold",
    organizationId: "org-1",
    imei: "356982101234567",
    model: "iPhone 13",
    status: "Sold",
  });

  const res = await env.simulateCheckout("org-1", {
    items: [{ inventoryItemId: "device-sold", salePrice: 12000 }],
  });

  assert.equal(res.status, 409);
  assert.equal(res.body.error, "INVENTORY_UNAVAILABLE");
  assert.deepEqual((res.body as any).unavailableItemIds, ["device-sold"]);
  assert.equal(env.salesDb.length, 0);
  assert.equal(env.saleItemsDb.length, 0);
});

test("TEST 3 & 4: Two concurrent sales targeting the same item result in exactly ONE sale and NO extra SaleItems", async () => {
  const env = createSimulationEnvironment();
  env.inventoryDb.push({
    id: "device-concurrent",
    organizationId: "org-1",
    imei: "356982109999999",
    model: "iPhone 14",
    status: "Available",
  });

  // Cashier A and Cashier B attempt to check out the same device simultaneously
  const [resA, resB] = await Promise.all([
    env.simulateCheckout("org-1", {
      saleId: "checkout-cashier-A",
      items: [{ inventoryItemId: "device-concurrent", salePrice: 15000 }],
    }, 0),
    env.simulateCheckout("org-1", {
      saleId: "checkout-cashier-B",
      items: [{ inventoryItemId: "device-concurrent", salePrice: 15000 }],
    }, 1),
  ]);

  // One must be 200 and the other must be 409
  const statuses = [resA.status, resB.status].sort();
  assert.deepEqual(statuses, [200, 409]);

  // Exactly one sale exists
  assert.equal(env.salesDb.length, 1);

  // TEST 4: The failed request created NO SaleItems
  assert.equal(env.saleItemsDb.length, 1);
  assert.equal(env.inventoryDb[0].status, "Sold");
});

test("TEST 5: Multi-item transaction rolls back completely if one item is unavailable", async () => {
  const env = createSimulationEnvironment();
  env.inventoryDb.push(
    {
      id: "item-A",
      organizationId: "org-1",
      imei: "111111111111111",
      model: "iPhone 13",
      status: "Available",
    },
    {
      id: "item-B",
      organizationId: "org-1",
      imei: "222222222222222",
      model: "iPad Pro",
      status: "Sold", // already sold!
    }
  );

  const res = await env.simulateCheckout("org-1", {
    items: [
      { inventoryItemId: "item-A", salePrice: 10000 },
      { inventoryItemId: "item-B", salePrice: 18000 },
    ],
  });

  assert.equal(res.status, 409);
  assert.equal(res.body.error, "INVENTORY_UNAVAILABLE");

  // ATOMICITY: No sale or sale item created
  assert.equal(env.salesDb.length, 0);
  assert.equal(env.saleItemsDb.length, 0);

  // item-A must remain Available (not partially sold!)
  const itemA = env.inventoryDb.find((i) => i.id === "item-A");
  assert.equal(itemA?.status, "Available");

  // item-B remains Sold
  const itemB = env.inventoryDb.find((i) => i.id === "item-B");
  assert.equal(itemB?.status, "Sold");
});

test("TEST 6: Duplicate inventoryItemId in the same request is rejected with HTTP 400", async () => {
  const env = createSimulationEnvironment();
  env.inventoryDb.push({
    id: "item-dup",
    organizationId: "org-1",
    imei: "356982101234567",
    model: "iPhone 13",
    status: "Available",
  });

  const res = await env.simulateCheckout("org-1", {
    items: [
      { inventoryItemId: "item-dup", salePrice: 10000 },
      { inventoryItemId: "item-dup", salePrice: 10000 },
    ],
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, "DUPLICATE_INVENTORY_ITEM");
  assert.equal(env.salesDb.length, 0);
  assert.equal(env.inventoryDb[0].status, "Available");
});

test("TEST 7: Inventory from another organization cannot be sold", async () => {
  const env = createSimulationEnvironment();
  // Device belongs to org-competitor
  env.inventoryDb.push({
    id: "device-competitor",
    organizationId: "org-competitor",
    imei: "999999999999999",
    model: "iPhone 15 Pro",
    status: "Available",
  });

  // org-my-store attempts to sell org-competitor's device
  const res = await env.simulateCheckout("org-my-store", {
    items: [{ inventoryItemId: "device-competitor", salePrice: 22000 }],
  });

  assert.equal(res.status, 409);
  assert.equal(res.body.error, "INVENTORY_UNAVAILABLE");
  assert.equal(env.salesDb.length, 0);

  // Device remains in org-competitor untouched
  assert.equal(env.inventoryDb[0].organizationId, "org-competitor");
  assert.equal(env.inventoryDb[0].status, "Available");
});

test("TEST 8: Idempotent replay of an already completed sale returns original sale successfully", async () => {
  const env = createSimulationEnvironment();
  env.inventoryDb.push({
    id: "device-idempotent",
    organizationId: "org-1",
    imei: "356982107777777",
    model: "iPhone 14",
    status: "Available",
  });

  const idempotencyKey = "client-uuid-checkout-001";

  // 1. Initial checkout
  const firstRes = await env.simulateCheckout("org-1", {
    saleId: idempotencyKey,
    items: [{ inventoryItemId: "device-idempotent", salePrice: 14000 }],
  });

  assert.equal(firstRes.status, 200);
  assert.equal((firstRes.body as any).saleId, idempotencyKey);
  assert.equal(env.inventoryDb[0].status, "Sold");
  assert.equal(env.salesDb.length, 1);

  // 2. Idempotent retry: The device is now "Sold", but the same saleId is retried
  const retryRes = await env.simulateCheckout("org-1", {
    saleId: idempotencyKey,
    items: [{ inventoryItemId: "device-idempotent", salePrice: 14000 }],
  });

  // MUST return 200 with idempotentReplay, NOT 409!
  assert.equal(retryRes.status, 200);
  assert.equal((retryRes.body as any).idempotentReplay, true);
  assert.equal((retryRes.body as any).saleId, idempotencyKey);

  // Total sales and items must still be 1
  assert.equal(env.salesDb.length, 1);
  assert.equal(env.saleItemsDb.length, 1);
});
