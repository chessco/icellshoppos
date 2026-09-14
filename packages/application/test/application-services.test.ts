import test from "node:test";
import assert from "node:assert/strict";
import {
  DeviceNormalizationService,
  IntakeValidationService,
  PricePreviewService,
  CheckoutApplicationService,
} from "../src/index.js";

test("DeviceNormalizationService normalizes serials, imei and capacities", () => {
  const normalizer = new DeviceNormalizationService();
  
  assert.equal(normalizer.normalizeImei(" 3569-8210 1234 567 "), "356982101234567");
  assert.equal(normalizer.normalizeSerialNumber("  c39z1234abcd  "), "C39Z1234ABCD");
  assert.equal(normalizer.normalizeCapacity("64 gb"), "64GB");
  assert.equal(normalizer.normalizeCapacity("128GB"), "128GB");
});

test("IntakeValidationService correctly flags missing required fields", () => {
  const validator = new IntakeValidationService();

  const invalid = validator.validateRequired(
    {
      imei: "",
      model: "",
      capacity: "",
      color: "",
    },
    ["model", "capacity", "color"]
  );
  assert.equal(invalid.valid, false);
  assert.ok(invalid.missingFields.includes("model"));

  const valid = validator.validateRequired(
    {
      imei: "356982101234567",
      model: "iPhone 13",
      capacity: "128GB",
      color: "Midnight",
    },
    ["model", "capacity", "color"]
  );
  assert.equal(valid.valid, true);
  assert.equal(valid.missingFields.length, 0);
});

test("PricePreviewService calculates preview prices from catalog rules", () => {
  const preview = new PricePreviewService();
  const rules = [
    {
      model: "iPhone 13",
      capacity: "128GB",
      price: "8500",
      price2: "8200",
      price3: "8000",
    },
  ];

  const match = preview.estimatePricing("iPhone 13", "128GB", rules);
  assert.ok(match);
  assert.equal(match.price, "$8,500");
  assert.equal(match.price2, "$8,200");
  assert.equal(match.price3, "$8,000");

  const noMatch = preview.estimatePricing("iPhone 12", "512GB", rules);
  assert.equal(noMatch.price, undefined);
});

test("CheckoutApplicationService validates sale payloads before submission", () => {
  const mockApiClient: any = {};
  const checkout = new CheckoutApplicationService(mockApiClient);

  const invalidSale = checkout.validateBackendSale({
    customerName: "",
    customerWhatsapp: "",
    paymentMethod: "",
    items: [],
  });
  assert.equal(invalidSale.valid, false);

  const validSale = checkout.validateBackendSale({
    customerName: "Jane Doe",
    customerWhatsapp: "+525512345678",
    paymentMethod: "Cash",
    items: [
      {
        imei: "356982101234567",
        salePrice: 8500,
      },
    ],
  });
  assert.equal(validSale.valid, true);
});
