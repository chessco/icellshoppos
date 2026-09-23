import test from "node:test";
import assert from "node:assert/strict";
import type { IInventoryListItem } from "../../../packages/contracts/src/index.ts";

const mockInventory: IInventoryListItem[] = [
  {
    id: "item-1",
    model: "iPhone 15 Pro",
    capacity: "128GB",
    color: "Natural Titanium",
    carrier: "Unlocked",
    condition: "Used",
    grade: "A",
    status: "Available",
    imei: "351111111111111",
    sku: "IP15P-128-NAT",
    serialNumber: "SN111",
    price: 18500,
    costPesos: 14000,
    costCurrency: "MXN",
  },
  {
    id: "item-2",
    model: "iPhone 14",
    capacity: "128GB",
    color: "Blue",
    carrier: "Unlocked",
    condition: "Used",
    grade: "B",
    status: "Sold",
    imei: "352222222222222",
    sku: "IP14-128-BLU",
    serialNumber: "SN222",
    price: 12500,
    costPesos: 9500,
    costCurrency: "MXN",
  },
  {
    id: "item-3",
    model: "iPad Pro 11 M2",
    capacity: "256GB",
    color: "Space Gray",
    carrier: "Unlocked",
    condition: "Used",
    grade: "A",
    status: "Available",
    imei: "353333333333333",
    sku: "IPADP-256-GRY",
    serialNumber: "SN333",
    price: 16000,
    costPesos: 12000,
    costCurrency: "MXN",
  },
  {
    id: "item-4",
    model: "iPhone 13 mini",
    capacity: "128GB",
    color: "Green",
    carrier: "Unlocked",
    condition: "Used",
    grade: "A",
    status: "Sold",
    imei: "354444444444444",
    sku: "IP13M-128-GRN",
    serialNumber: "SN444",
    price: 9000,
    costPesos: 6800,
    costCurrency: "MXN",
  },
];

function filterInventory(
  items: IInventoryListItem[],
  statusFilter: "Available" | "All" | "Sold",
  searchQuery: string = ""
): IInventoryListItem[] {
  let result = items;

  if (statusFilter === "Available") {
    result = result.filter(
      (i) => (i.status || "Available").toLowerCase() === "available"
    );
  } else if (statusFilter === "Sold") {
    result = result.filter(
      (i) => (i.status || "").toLowerCase() === "sold"
    );
  }

  const q = searchQuery.toLowerCase().trim();
  if (q) {
    result = result.filter((i) => {
      const model = i.model?.toLowerCase() || "";
      const imei = i.imei || "";
      const serial = i.serialNumber?.toLowerCase() || "";
      const sku = i.sku?.toLowerCase() || "";
      return model.includes(q) || imei.includes(q) || serial.includes(q) || sku.includes(q);
    });
  }

  return result;
}

test("iPad default filter only returns Available items", () => {
  const defaultFilter = "Available";
  const result = filterInventory(mockInventory, defaultFilter);

  assert.equal(result.length, 2);
  assert.ok(result.every((item) => item.status === "Available"));
  assert.deepEqual(
    result.map((i) => i.id),
    ["item-1", "item-3"]
  );
});

test("iPad filter switches to Sold items when requested", () => {
  const result = filterInventory(mockInventory, "Sold");

  assert.equal(result.length, 2);
  assert.ok(result.every((item) => item.status === "Sold"));
  assert.deepEqual(
    result.map((i) => i.id),
    ["item-2", "item-4"]
  );
});

test("iPad filter switches to All items when requested", () => {
  const result = filterInventory(mockInventory, "All");

  assert.equal(result.length, 4);
});

test("iPad search works within the active status filter", () => {
  // Search for "iPhone" when Available is active -> only item-1
  const availableIphones = filterInventory(mockInventory, "Available", "iPhone");
  assert.equal(availableIphones.length, 1);
  assert.equal(availableIphones[0].id, "item-1");

  // Search for "iPhone" when Sold is active -> item-2 and item-4
  const soldIphones = filterInventory(mockInventory, "Sold", "iPhone");
  assert.equal(soldIphones.length, 2);
});
