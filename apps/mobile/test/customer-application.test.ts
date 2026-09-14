import test from "node:test";
import assert from "node:assert/strict";
import {
  CustomerApplicationService,
  normalizeWhatsappPhone,
} from "../../../packages/application/src/CustomerApplicationService.ts";
import type { ProBuyerApiClient } from "../../../packages/api-client/src/index.ts";
import type { ICustomerListItem } from "../../../packages/contracts/src/index.ts";

test("normalizeWhatsappPhone correctly formats numbers with country codes", () => {
  // Clean valid numbers
  const res1 = normalizeWhatsappPhone("+52 55 1234 5678");
  assert.equal(res1.valid, true);
  assert.equal(res1.normalized, "+525512345678");

  const res2 = normalizeWhatsappPhone("525512345678");
  assert.equal(res2.valid, true);
  assert.equal(res2.normalized, "+525512345678");

  const res3 = normalizeWhatsappPhone("+1 (415) 555-2671");
  assert.equal(res3.valid, true);
  assert.equal(res3.normalized, "+14155552671");

  // Invalid short numbers
  const invalid1 = normalizeWhatsappPhone("12345");
  assert.equal(invalid1.valid, false);

  const empty = normalizeWhatsappPhone("");
  assert.equal(empty.valid, false);
});

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
