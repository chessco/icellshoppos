import test from "node:test";
import assert from "node:assert/strict";
import { CheckoutApplicationService } from "../../../packages/application/src/CheckoutApplicationService.ts";
import type { ProBuyerApiClient } from "../../../packages/api-client/src/index.ts";
import type { BackendSaleCreatePayload, BackendSaleCreatedResponse } from "../../../packages/contracts/src/index.ts";

test("CheckoutApplicationService handles valid sale processing and maps response", async () => {
  let submittedPayload: BackendSaleCreatePayload | null = null;

  const mockApiClient: Partial<ProBuyerApiClient> = {
    createSale: async (payload: BackendSaleCreatePayload) => {
      submittedPayload = payload;
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        data: {
          success: true,
          saleId: "SALE-2026-001",
          saleNumber: "PB-9821",
          total: 18500,
        } as BackendSaleCreatedResponse,
      };
    },
  };

  const service = new CheckoutApplicationService(mockApiClient as ProBuyerApiClient);

  const testPayload: BackendSaleCreatePayload = {
    customerName: "Juan Perez",
    customerWhatsapp: "+525512345678",
    paymentMethod: "Cash",
    paymentBreakdown: { Cash: 18500 },
    soldBy: "pos-operator@icellshop.com",
    items: [
      {
        inventoryItemId: "inv-101",
        imei: "356982101234567",
        salePrice: 18500,
      },
    ],
  };

  const result = await service.processBackendSale(testPayload);

  assert.equal(result.ok, true);
  assert.equal(result.data?.saleId, "SALE-2026-001");
  assert.equal(result.data?.saleNumber, "PB-9821");
  assert.equal(result.data?.total, 18500);

  // Validate passed payload
  assert.equal((submittedPayload as any)?.customerName, "Juan Perez");
  assert.equal((submittedPayload as any)?.items[0].imei, "356982101234567");
});

test("CheckoutApplicationService normalizes server errors cleanly", async () => {
  const mockFailingApiClient: Partial<ProBuyerApiClient> = {
    createSale: async () => {
      return {
        ok: false,
        status: 409,
        headers: new Headers(),
        error: "Item already sold by another terminal",
      };
    },
  };

  const service = new CheckoutApplicationService(mockFailingApiClient as ProBuyerApiClient);

  const result = await service.processBackendSale({
    customerName: "Valid Customer",
    customerWhatsapp: "+525500000000",
    paymentMethod: "Cash",
    items: [{ imei: "356982101234567", salePrice: 9000 }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "Item already sold by another terminal");
});

test("CheckoutApplicationService preserves saleId across retries and handles idempotent replay", async () => {
  const capturedSaleIds: string[] = [];
  const fixedIdempotencyKey = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

  let callCount = 0;
  const mockApiClient: Partial<ProBuyerApiClient> = {
    createSale: async (payload: BackendSaleCreatePayload) => {
      capturedSaleIds.push(payload.saleId || "");
      callCount++;

      // First call simulates network drop or retry after commit
      if (callCount === 1) {
        return {
          ok: false,
          status: 0,
          headers: new Headers(),
          error: "Network request timed out",
        };
      }

      // Second call (retry) returns idempotent replay from backend
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        data: {
          success: true,
          saleId: fixedIdempotencyKey,
          saleNumber: fixedIdempotencyKey,
          total: 15000,
          idempotentReplay: true,
        } as BackendSaleCreatedResponse,
      };
    },
  };

  const service = new CheckoutApplicationService(mockApiClient as ProBuyerApiClient);

  const checkoutPayload: BackendSaleCreatePayload = {
    saleId: fixedIdempotencyKey,
    customerName: "Maria Garcia",
    customerWhatsapp: "+525511223344",
    paymentMethod: "Cash",
    items: [{ imei: "356982101234567", salePrice: 15000 }],
  };

  // Attempt 1: fails with network timeout
  const res1 = await service.processBackendSale(checkoutPayload);
  assert.equal(res1.ok, false);
  assert.equal(res1.error, "Network request timed out");

  // Attempt 2: cashier retries with the SAME payload (same saleId)
  const res2 = await service.processBackendSale(checkoutPayload);
  assert.equal(res2.ok, true);
  assert.equal(res2.data?.idempotentReplay, true);
  assert.equal(res2.data?.saleId, fixedIdempotencyKey);
  assert.equal(res2.data?.total, 15000);

  // Assert both attempts used the exact same saleId
  assert.equal(capturedSaleIds.length, 2);
  assert.equal(capturedSaleIds[0], fixedIdempotencyKey);
  assert.equal(capturedSaleIds[1], fixedIdempotencyKey);
});

