import test from "node:test";
import assert from "node:assert/strict";
import {
  CustomerApplicationService,
  normalizeWhatsappPhone,
  CheckoutApplicationService,
} from "../../../packages/application/src/index.ts";
import type { ProBuyerApiClient } from "../../../packages/api-client/src/index.ts";
import type { ICustomerListItem, BackendSaleCreatePayload } from "../../../packages/contracts/src/index.ts";

// ============================================================================
// PHASE 5B-2C: CANONICAL WHATSAPP NORMALIZATION TESTS (TEST 1 - 10 + REGRESSION)
// ============================================================================

test("TEST 1: 10-digit Mexican number resolves to +52XXXXXXXXXX", () => {
  const res = normalizeWhatsappPhone("5512345678");
  assert.equal(res.valid, true);
  assert.equal(res.normalized, "+525512345678");

  const sonoraRes = normalizeWhatsappPhone("6621234567");
  assert.equal(sonoraRes.valid, true);
  assert.equal(sonoraRes.normalized, "+526621234567");

  const obregonRes = normalizeWhatsappPhone("6441234567");
  assert.equal(obregonRes.valid, true);
  assert.equal(obregonRes.normalized, "+526441234567");
});

test("TEST 2: Mexican number already containing +52 is preserved as +52XXXXXXXXXX", () => {
  const res = normalizeWhatsappPhone("+525512345678");
  assert.equal(res.valid, true);
  assert.equal(res.normalized, "+525512345678");
});

test("TEST 3: Mexican number containing 52 without plus resolves to +52XXXXXXXXXX", () => {
  const res = normalizeWhatsappPhone("525512345678");
  assert.equal(res.valid, true);
  assert.equal(res.normalized, "+525512345678");
});

test("TEST 4: Mexican number with spaces resolves to +52XXXXXXXXXX", () => {
  const res = normalizeWhatsappPhone("55 1234 5678");
  assert.equal(res.valid, true);
  assert.equal(res.normalized, "+525512345678");

  const resWithCountry = normalizeWhatsappPhone("+52 55 1234 5678");
  assert.equal(resWithCountry.valid, true);
  assert.equal(resWithCountry.normalized, "+525512345678");
});

test("TEST 5: Mexican number with punctuation resolves to +52XXXXXXXXXX", () => {
  const res = normalizeWhatsappPhone("(55) 1234-5678");
  assert.equal(res.valid, true);
  assert.equal(res.normalized, "+525512345678");

  const hyphenated = normalizeWhatsappPhone("55-1234-5678");
  assert.equal(hyphenated.valid, true);
  assert.equal(hyphenated.normalized, "+525512345678");
});

test("TEST 6: US number with +1 is preserved as +1XXXXXXXXXX", () => {
  const res = normalizeWhatsappPhone("+14155551234");
  assert.equal(res.valid, true);
  assert.equal(res.normalized, "+14155551234");

  const formatted = normalizeWhatsappPhone("+1 (415) 555-2671");
  assert.equal(formatted.valid, true);
  assert.equal(formatted.normalized, "+14155552671");
});

test("TEST 7: US number without plus resolves to +1XXXXXXXXXX", () => {
  const res = normalizeWhatsappPhone("14155551234");
  assert.equal(res.valid, true);
  assert.equal(res.normalized, "+14155551234");
});

test("TEST 8: Invalid short number is rejected cleanly", () => {
  const short1 = normalizeWhatsappPhone("12345");
  assert.equal(short1.valid, false);
  assert.ok(short1.error);

  const short2 = normalizeWhatsappPhone("551234");
  assert.equal(short2.valid, false);

  const empty = normalizeWhatsappPhone("");
  assert.equal(empty.valid, false);
});

test("TEST 9: Invalid long number is rejected cleanly", () => {
  const long1 = normalizeWhatsappPhone("551234567890123");
  assert.equal(long1.valid, false);
  assert.ok(long1.error);

  const long2 = normalizeWhatsappPhone("+521234567890123");
  assert.equal(long2.valid, false);
});

test("TEST 10: Unsupported international prefix is NOT silently converted to +52", () => {
  // UK (+44)
  const uk = normalizeWhatsappPhone("+447911123456");
  assert.equal(uk.valid, false);
  assert.notEqual(uk.normalized.slice(0, 3), "+52");
  assert.equal(uk.error, "Ingresa un número de WhatsApp válido de México (+52) o Estados Unidos (+1).");

  // Brazil (+55)
  const brazil = normalizeWhatsappPhone("+5511987654321");
  assert.equal(brazil.valid, false);
  assert.notEqual(brazil.normalized.slice(0, 3), "+52");

  // Spain (+34)
  const spain = normalizeWhatsappPhone("+34612345678");
  assert.equal(spain.valid, false);
  assert.notEqual(spain.normalized.slice(0, 3), "+52");
});

test("MANDATORY REGRESSION TEST (Phase 5B-1 P0 defect): 5512345678 MUST NOT produce +5512345678", () => {
  const input = "5512345678";
  const result = normalizeWhatsappPhone(input);

  // CRITICAL: Must NEVER be +5512345678
  assert.notEqual(result.normalized, "+5512345678", "CRITICAL REGRESSION: 10-digit number was prefixed with + instead of +52");
  assert.equal(result.valid, true);
  assert.equal(result.normalized, "+525512345678");
});

test("TEST 11: Checkout payload contains the normalized +52 value", async () => {
  let submittedPayload: BackendSaleCreatePayload | null = null;

  const mockApiClient: Partial<ProBuyerApiClient> = {
    createSale: async (payload: BackendSaleCreatePayload) => {
      submittedPayload = payload;
      return {
        ok: true,
        data: {
          success: true,
          saleId: "sale-100",
          saleNumber: "S-100",
          total: 1000,
        },
      };
    },
  };

  const checkoutService = new CheckoutApplicationService(mockApiClient as ProBuyerApiClient);

  // Cashier enters raw 10-digit Mexican number in checkout
  const rawCashierPhone = "5512345678";
  const phoneNorm = normalizeWhatsappPhone(rawCashierPhone);
  assert.equal(phoneNorm.valid, true);
  assert.equal(phoneNorm.normalized, "+525512345678");

  const checkoutPayload: BackendSaleCreatePayload = {
    saleId: "chk-uuid-1234",
    customerName: "Juan Perez",
    customerWhatsapp: phoneNorm.normalized,
    paymentMethod: "Cash",
    items: [
      {
        inventoryItemId: "inv-1",
        imei: "356982101234567",
        salePrice: 1000,
      },
    ],
  };

  const res = await checkoutService.processBackendSale(checkoutPayload);
  assert.equal(res.ok, true);
  assert.ok(submittedPayload !== null);
  const received = submittedPayload as BackendSaleCreatePayload;
  assert.equal(received.customerWhatsapp, "+525512345678");
  assert.notEqual(received.customerWhatsapp, "+5512345678");
});

test("TEST 12: Customer creation payload contains the normalized +52 value", async () => {
  let addedCustomerPayload: any = null;

  const mockApiClient: Partial<ProBuyerApiClient> = {
    addCustomer: async (payload: Record<string, unknown>) => {
      addedCustomerPayload = payload;
      return {
        ok: true,
        data: {
          id: "c-200",
          name: payload.name as string,
          email: payload.email as string,
          whatsapp: payload.whatsapp as string,
          customerType: "retail",
          creditEnabled: false,
        } as ICustomerListItem,
      };
    },
  };

  const customerService = new CustomerApplicationService(mockApiClient as ProBuyerApiClient);

  // Cashier enters 10-digit number without country code
  const createResult = await customerService.createCustomer({
    name: "Juan Perez",
    whatsapp: "5512345678",
    email: "juan@example.com",
  });

  assert.equal(createResult.ok, true);
  assert.equal(createResult.customer?.id, "c-200");
  assert.ok(addedCustomerPayload !== null);
  const custRec = addedCustomerPayload as Record<string, unknown>;
  assert.equal(custRec.whatsapp, "+525512345678");
  assert.notEqual(custRec.whatsapp, "+5512345678");
});

// ============================================================================
// EXISTING CUSTOMER APPLICATION TESTS (PRESERVED)
// ============================================================================

test("CustomerApplicationService filters customers by name, email, or phone", () => {
  const service = new CustomerApplicationService({} as ProBuyerApiClient);

  const mockCustomers: ICustomerListItem[] = [
    {
      id: "c-1",
      name: "Maria Gonzalez",
      email: "maria@example.com",
      whatsapp: "+525512345678",
      customerType: "retail",
      creditEnabled: false,
    },
    {
      id: "c-2",
      name: "Carlos Slim",
      email: "carlos@wholesale.mx",
      whatsapp: "+525598765432",
      customerType: "wholesale",
      creditEnabled: true,
    },
  ];

  // Search by name
  const filtered1 = service.filterCustomers(mockCustomers, "maria");
  assert.equal(filtered1.length, 1);
  assert.equal(filtered1[0].id, "c-1");

  // Search by phone
  const filtered2 = service.filterCustomers(mockCustomers, "9876");
  assert.equal(filtered2.length, 1);
  assert.equal(filtered2[0].id, "c-2");

  // Search by email domain
  const filtered3 = service.filterCustomers(mockCustomers, "wholesale.mx");
  assert.equal(filtered3.length, 1);
  assert.equal(filtered3[0].id, "c-2");

  // Empty query returns all
  const filteredAll = service.filterCustomers(mockCustomers, "");
  assert.equal(filteredAll.length, 2);
});

test("CustomerApplicationService creates customers and validates input", async () => {
  let createdPayload: any = null;

  const mockApiClient: Partial<ProBuyerApiClient> = {
    addCustomer: async (payload: Record<string, unknown>) => {
      createdPayload = payload;
      return {
        ok: true,
        data: {
          id: "c-100",
          name: payload.name as string,
          email: payload.email as string,
          whatsapp: payload.whatsapp as string,
          customerType: "retail",
          creditEnabled: false,
        } as ICustomerListItem,
      };
    },
  };

  const service = new CustomerApplicationService(mockApiClient as ProBuyerApiClient);

  // Missing name
  const failRes1 = await service.createCustomer({
    name: "",
    whatsapp: "+525512345678",
  });
  assert.equal(failRes1.ok, false);
  assert.equal(failRes1.error, "Customer name is required.");

  // Invalid phone
  const failRes2 = await service.createCustomer({
    name: "Juan Perez",
    whatsapp: "123",
  });
  assert.equal(failRes2.ok, false);

  // Valid creation
  const successRes = await service.createCustomer({
    name: "Juan Perez",
    whatsapp: "+52 55 1234 5678",
    email: "juan@perez.com",
  });

  assert.equal(successRes.ok, true);
  assert.equal(successRes.customer?.id, "c-100");
  assert.equal(createdPayload?.whatsapp, "+525512345678");
});
