import test from "node:test";
import assert from "node:assert/strict";
import {
  groupInventoryByAppleModel,
  detectAppleSeries,
  extractAppleBaseModel,
} from "../src/utils/appleCatalogGrouping.ts";
import type { IInventoryListItem } from "../../../packages/contracts/src/index.ts";

test("Anti-saturation: Top Ventas filter strictly limits the default screen to <= 6 flagship models", () => {
  const mockPhones: IInventoryListItem[] = [
    { id: "1", model: "iPhone 16 Pro 128GB Black Titanium", price: 21999, status: "Available" },
    { id: "2", model: "iPhone 16 128GB Ultramarine", price: 17499, status: "Available" },
    { id: "3", model: "iPhone 16e 128GB Black", price: 14499, status: "Available" },
    { id: "4", model: "iPhone 15 Pro Max 256GB Black Titanium", price: 21999, status: "Available" },
    { id: "5", model: "iPhone 15 Pro 128GB Gray", price: 18499, status: "Available" },
    { id: "6", model: "iPhone 15 128GB Blue", price: 15499, status: "Available" },
    { id: "7", model: "iPhone 15+ (Plus) 512GB Black", price: 18999, status: "Available" },
    { id: "8", model: "iPhone 14 Pro 128GB Space Black", price: 16999, status: "Available" },
    { id: "9", model: "iPhone 14 Pro Max 256GB Deep Purple", price: 18999, status: "Available" },
    { id: "10", model: "iPhone 14 128GB Blue", price: 12999, status: "Available" },
    { id: "11", model: "iPhone 13 128GB New Green", price: 10999, status: "Available" },
    { id: "12", model: "iPhone 12 Pro Max 256GB Pacific Blue", price: 11999, status: "Available" },
    { id: "13", model: "iPhone 17 Pro 256GB Cosmic Orange", price: 24999, status: "Available" },
    { id: "14", model: "iPhone 17 Pro Max 256GB Cosmic Orange", price: 28999, status: "Available" },
    { id: "15", model: "iPhone SE 3 64GB Starlight", price: 4999, status: "Available" },
  ];

  const groups = groupInventoryByAppleModel(mockPhones);
  const bestsellers = groups.filter((g) => g.deviceType === "iphone" && g.isBestseller);

  // El filtro de Top Ventas debe garantizar un POS ultra-ligero y no saturado (máximo 6 modelos)
  assert.ok(bestsellers.length <= 6, `Bestsellers count should be <= 6, but got ${bestsellers.length}`);
  assert.ok(bestsellers.length > 0, "Should have at least one bestseller model");

  // Verificar que modelos antiguos o no-bestseller no se muestren en Top Ventas
  const bestsellerNames = bestsellers.map((b) => b.modelName);
  assert.ok(!bestsellerNames.includes("iPhone 12 Pro Max"), "iPhone 12 Pro Max should not be in Top Ventas");
  assert.ok(!bestsellerNames.includes("iPhone 13"), "iPhone 13 should not be in Top Ventas");
  assert.ok(!bestsellerNames.includes("iPhone SE 3"), "iPhone SE 3 should not be in Top Ventas");
});

test("Anti-saturation: Each series filter partitions models into small, manageable subsets", () => {
  const models = [
    "iPhone 17 Pro Max",
    "iPhone 17 Pro",
    "iPhone 16 Pro",
    "iPhone 16e",
    "iPhone 16",
    "iPhone 15 Pro Max",
    "iPhone 15 Pro",
    "iPhone 15 Plus",
    "iPhone 15",
    "iPhone 14 Pro Max",
    "iPhone 14 Pro",
    "iPhone 14",
    "iPhone 13 Pro",
    "iPhone 12 Pro Max",
    "iPhone SE 3",
    "iPhone SE 2",
  ];

  const seriesCounts: Record<string, number> = {};
  for (const m of models) {
    const series = detectAppleSeries(m);
    seriesCounts[series] = (seriesCounts[series] || 0) + 1;
  }

  // Ninguna serie debe tener más de 6-7 modelos
  assert.ok((seriesCounts["series_17_16"] || 0) <= 6, "Series 16 & 17 should have <= 6 models");
  assert.ok((seriesCounts["series_15"] || 0) <= 4, "Series 15 should have <= 4 models");
  assert.ok((seriesCounts["series_14"] || 0) <= 3, "Series 14 should have <= 3 models");
  assert.ok((seriesCounts["series_se_older"] || 0) <= 3, "Series SE should have <= 3 models");
});

test("Model name normalization consolidates variants cleanly without duplicate dangling groups", () => {
  assert.equal(extractAppleBaseModel("iPhone 15+ (Plus) 512GB Black"), "iPhone 15 Plus");
  assert.equal(extractAppleBaseModel("iPhone 15+ 256GB Blue"), "iPhone 15 Plus");
  assert.equal(extractAppleBaseModel("iPhone SE 3 64GB Starlight"), "iPhone SE 3");
  assert.equal(extractAppleBaseModel("iPhone SE (3rd gen) 128GB Midnight"), "iPhone SE 3");
  assert.equal(extractAppleBaseModel("iPhone SE 2 64GB Red"), "iPhone SE 2");
  assert.equal(extractAppleBaseModel("iPhone 16e 128GB Black"), "iPhone 16e");
  assert.equal(extractAppleBaseModel("iPhone 17 Pro 256GB Cosmic Orange"), "iPhone 17 Pro");
  assert.equal(extractAppleBaseModel("iPhone 17 Pro Max 256GB Cosmic Orange"), "iPhone 17 Pro Max");
});
