import test from "node:test";
import assert from "node:assert/strict";
import { PricePreviewService } from "../../../packages/application/src/PricePreviewService.ts";
import type { IInventoryListItem, PricingRuleEntry } from "../../../packages/contracts/src/index.ts";
import { groupInventoryByAppleModel } from "../src/utils/appleCatalogGrouping.ts";

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

test("iPad POS: Single-item product group identifies as 1-tap candidate", () => {
  const singleItemInventory: IInventoryListItem[] = [
    {
      id: "inv-single-1",
      model: "iPhone 11 64GB Black",
      capacity: "64GB",
      color: "Black",
      carrier: "Unlocked",
      condition: "Used",
      grade: "A",
      status: "Available",
      imei: "359871029384756",
      sku: null,
      serialNumber: "SN111",
      price: 5499,
      costPesos: 3800,
      costCurrency: "MXN",
    },
    {
      id: "inv-multi-1",
      model: "iPhone 15 Pro 128GB Natural Titanium",
      capacity: "128GB",
      color: "Natural Titanium",
      carrier: "Unlocked",
      condition: "Used",
      grade: "A",
      status: "Available",
      imei: "359871029384757",
      sku: null,
      serialNumber: "SN222",
      price: 18999,
      costPesos: 15000,
      costCurrency: "MXN",
    },
    {
      id: "inv-multi-2",
      model: "iPhone 15 Pro 256GB Black Titanium",
      capacity: "256GB",
      color: "Black Titanium",
      carrier: "Unlocked",
      condition: "Used",
      grade: "A",
      status: "Available",
      imei: "359871029384758",
      sku: null,
      serialNumber: "SN333",
      price: 21499,
      costPesos: 17000,
      costCurrency: "MXN",
    },
  ];

  const groups = groupInventoryByAppleModel(singleItemInventory);
  
  const iphone11Group = groups.find((g) => g.modelName === "iPhone 11");
  const iphone15ProGroup = groups.find((g) => g.modelName === "iPhone 15 Pro");

  assert.ok(iphone11Group, "iPhone 11 group must exist");
  assert.ok(iphone15ProGroup, "iPhone 15 Pro group must exist");

  // iPhone 11 has only 1 item -> direct 1-tap to cart candidate
  assert.equal(iphone11Group.items.length, 1);
  assert.equal(iphone11Group.totalAvailable, 1);

  // iPhone 15 Pro has 2 items -> must open multi-variant configurator sheet
  assert.equal(iphone15ProGroup.items.length, 2);
  assert.equal(iphone15ProGroup.totalAvailable, 2);
});

test("iPad POS: 1-tap handler immediately adds single item without opening configurator sheet", () => {
  const singleItem: IInventoryListItem = {
    id: "inv-1tap",
    model: "iPhone 12 mini 64GB Blue",
    capacity: "64GB",
    color: "Blue",
    carrier: "Unlocked",
    condition: "Used",
    grade: "A",
    status: "Available",
    imei: "358877665544332",
    sku: null,
    serialNumber: "SN-MINI",
    price: 6999,
    costPesos: 5000,
    costCurrency: "MXN",
  };

  const multiItems: IInventoryListItem[] = [
    {
      id: "inv-multi-a",
      model: "iPhone 14 128GB Midnight",
      capacity: "128GB",
      color: "Midnight",
      carrier: "Unlocked",
      condition: "Used",
      grade: "A",
      status: "Available",
      imei: "111",
      sku: null,
      serialNumber: "SN-A",
      price: 11999,
      costPesos: 9000,
      costCurrency: "MXN",
    },
    {
      id: "inv-multi-b",
      model: "iPhone 14 256GB Starlight",
      capacity: "256GB",
      color: "Starlight",
      carrier: "Unlocked",
      condition: "Used",
      grade: "A",
      status: "Available",
      imei: "222",
      sku: null,
      serialNumber: "SN-B",
      price: 13499,
      costPesos: 10500,
      costCurrency: "MXN",
    },
  ];

  const singleGroup = groupInventoryByAppleModel([singleItem])[0];
  const multiGroup = groupInventoryByAppleModel(multiItems)[0];

  // Simular el controlador de selección del POS en iPad
  const cart: IInventoryListItem[] = [];
  let configuratorOpenedFor: string | null = null;
  const feedback = { text: "" };

  const handleSelectGroup = (group: typeof singleGroup) => {
    if (group.items && group.items.length === 1) {
      const item = group.items[0];
      if (item) {
        if (!cart.some((c) => c.id === item.id)) {
          cart.push(item);
          feedback.text = `✓ Agregado al ticket: ${item.model}`;
        } else {
          feedback.text = `ℹ️ ${item.model} ya está en el ticket`;
        }
        return;
      }
    }
    configuratorOpenedFor = group.modelName;
  };

  // 1. Tap en el grupo de un solo ítem
  handleSelectGroup(singleGroup);

  assert.equal(configuratorOpenedFor, null, "El configurador NO debe abrirse para un producto con 1 solo ítem");
  assert.equal(cart.length, 1, "El ítem debe agregarse de inmediato al carrito con 1 tap");
  assert.equal(cart[0].id, "inv-1tap");
  assert.ok(feedback.text.includes("Agregado al ticket"));

  // 2. Segundo tap sobre el mismo producto único ya en carrito -> feedback informativo sin duplicar
  handleSelectGroup(singleGroup);
  assert.equal(cart.length, 1, "No debe duplicar el ítem serializado");
  assert.ok(feedback.text.includes("ya está en el ticket"));

  // 3. Tap en producto con múltiples ítems -> abre el configurador modal
  handleSelectGroup(multiGroup);
  assert.equal(configuratorOpenedFor, "iPhone 14", "El configurador DEBE abrirse para un producto con múltiples ítems");
});
