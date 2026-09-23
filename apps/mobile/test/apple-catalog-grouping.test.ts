import test from "node:test";
import assert from "node:assert/strict";
import {
  groupInventoryByAppleModel,
  extractAppleBaseModel,
  resolveAppleColorHex,
} from "../src/utils/appleCatalogGrouping.ts";
import type { IInventoryListItem } from "../../../packages/contracts/src/index.ts";

test("extractAppleBaseModel cleans up concatenated capacities, colors, and carriers", () => {
  assert.equal(extractAppleBaseModel("iPhone 15 Pro 128GB Natural Titanium"), "iPhone 15 Pro");
  assert.equal(extractAppleBaseModel("iPhone 14 256GB Midnight Telcel"), "iPhone 14");
  assert.equal(extractAppleBaseModel("iPhone 13 mini 128GB Green Unlocked"), "iPhone 13 mini");
  assert.equal(extractAppleBaseModel("iPad Air 5 64GB Space Gray"), "iPad Air 5");
});

test("groupInventoryByAppleModel consolidates multiple units with dirty concatenated names into 1 canonical group", () => {
  const mockItems: IInventoryListItem[] = [
    {
      id: "1",
      model: "iPhone 15 Pro 128GB Natural Titanium",
      capacity: "128GB",
      color: "Natural Titanium",
      carrier: "Unlocked",
      condition: "Used",
      grade: "A",
      status: "Available",
      imei: "111",
      sku: "SKU1",
      serialNumber: "SN1",
      price: 18500,
      costPesos: 14000,
      costCurrency: "MXN",
    },
    {
      id: "2",
      model: "iPhone 15 Pro 256GB Blue Titanium",
      capacity: "256GB",
      color: "Blue Titanium",
      carrier: "Unlocked",
      condition: "Used",
      grade: "A",
      status: "Available",
      imei: "222",
      sku: "SKU2",
      serialNumber: "SN2",
      price: 21000,
      costPesos: 16000,
      costCurrency: "MXN",
    },
    {
      id: "3",
      model: "iPhone 14 128GB Blue Telcel",
      capacity: "128GB",
      color: "Blue",
      carrier: "Unlocked",
      condition: "Used",
      grade: "B",
      status: "Available",
      imei: "333",
      sku: "SKU3",
      serialNumber: "SN3",
      price: 12500,
      costPesos: 9500,
      costCurrency: "MXN",
    },
  ];

  const groups = groupInventoryByAppleModel(mockItems);

  // Aunque los strings de modelo eran distintos, deben consolidarse en 2 grupos canónicos
  assert.equal(groups.length, 2);

  // iPhone 15 Pro debe tener 2 unidades y ser Bestseller
  assert.equal(groups[0].modelName, "iPhone 15 Pro");
  assert.equal(groups[0].totalAvailable, 2);
  assert.equal(groups[0].isBestseller, true);
  assert.equal(groups[0].series, "series_15");

  // iPhone 14
  assert.equal(groups[1].modelName, "iPhone 14");
  assert.equal(groups[1].totalAvailable, 1);
  assert.equal(groups[1].series, "series_14");
});

test("resolveAppleColorHex maps official Apple colors correctly", () => {
  assert.equal(resolveAppleColorHex("Titanio Natural"), "#9e988d");
  assert.equal(resolveAppleColorHex("Black Titanium"), "#2b2a29");
  assert.equal(resolveAppleColorHex("Blue"), "#3b536b");
  assert.equal(resolveAppleColorHex("Rojo"), "#ba0c2e");
  assert.equal(resolveAppleColorHex(null), "#64748b");
  assert.equal(resolveAppleColorHex(undefined), "#64748b");
});

test("groupInventoryByAppleModel safely handles null, undefined, and malformed items", () => {
  // @ts-expect-error test undefined/null edge case
  assert.deepEqual(groupInventoryByAppleModel(null), []);
  // @ts-expect-error test undefined/null edge case
  assert.deepEqual(groupInventoryByAppleModel(undefined), []);
  assert.deepEqual(groupInventoryByAppleModel([]), []);

  const messyItems = [
    null,
    undefined,
    {
      id: "99",
      model: "",
      capacity: "",
      color: "",
      carrier: "",
      condition: "Used",
      grade: "A",
      status: "Available",
      imei: "",
      sku: "",
      serialNumber: "",
      price: 1000,
      costPesos: 800,
      costCurrency: "MXN",
    },
  ] as unknown as IInventoryListItem[];

  const result = groupInventoryByAppleModel(messyItems);
  assert.equal(result.length, 1);
  assert.ok(result[0].modelKey.length > 0);
  assert.ok(result[0].modelName.length > 0);
});
