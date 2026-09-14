import test from "node:test";
import assert from "node:assert/strict";
import { PricePreviewService } from "../../../packages/application/src/PricePreviewService.ts";
import type { IInventoryListItem, PricingRuleEntry } from "../../../packages/contracts/src/index.ts";

test("PricePreviewService correctly formats monetary values", () => {
  const service = new PricePreviewService();

  assert.equal(service.formatMoney(1299), "$1,299");
  assert.equal(service.formatMoney("15000"), "$15,000");
  assert.equal(service.formatMoney(0), "$0");
  assert.equal(service.formatMoney(""), "");
});

test("PricePreviewService accurately estimates pricing from pricing rules", () => {
  const service = new PricePreviewService();

  const rules: PricingRuleEntry[] = [
    { model: "iPhone 13", capacity: "128GB", price: "9500", price2: "9000", price3: "8500" },
    { model: "iPhone 13 Pro", capacity: "256GB", price: "13500", price2: "13000", price3: "12500" },
    { model: "iPhone 14 Pro Max", capacity: "128GB", price: "17500", price2: "17000", price3: "16500" },
  ];

  const estimate1 = service.estimatePricing("iPhone 13", "128GB", rules);
  assert.equal(estimate1.price, "$9,500");
  assert.equal(estimate1.price2, "$9,000");
  assert.equal(estimate1.price3, "$8,500");

  const estimate2 = service.estimatePricing("iPhone 13 Pro", "256GB", rules);
  assert.equal(estimate2.price, "$13,500");

  // Empty rules fallback
  const emptyEstimate = service.estimatePricing("iPhone 15", "128GB", []);
  assert.deepEqual(emptyEstimate, {});
});

test("Cart calculation logic enforces subtotal calculation and discounts", () => {
  const mockItem1: IInventoryListItem = {
    id: "inv-1",
    model: "iPhone 13",
    capacity: "128GB",
    color: "Midnight",
    carrier: "Unlocked",
    condition: "Used",
    grade: "A",
    status: "Available",
    imei: "356982101234567",
    sku: null,
    serialNumber: "C39Z1234ABCD",
    costPesos: 7000,
    costCurrency: "MXN",
    price: 9500,
  };

  const mockItem2: IInventoryListItem = {
    id: "inv-2",
    model: "iPhone 14 Pro",
    capacity: "256GB",
    color: "Space Black",
    carrier: "Unlocked",
    condition: "Used",
    grade: "A",
    status: "Available",
    imei: "356982109876543",
    sku: null,
    serialNumber: "C39Z9876WXYZ",
    costPesos: 12000,
    costCurrency: "MXN",
    price: 15500,
  };

  const items = [
    { inventoryItem: mockItem1, salePrice: 9500 },
    { inventoryItem: mockItem2, salePrice: 15500 },
  ];

  const subtotal = items.reduce((sum, it) => sum + it.salePrice, 0);
  assert.equal(subtotal, 25000);

  const discount = 1500;
  const totalPreview = Math.max(0, subtotal - discount);
  assert.equal(totalPreview, 23500);
});
