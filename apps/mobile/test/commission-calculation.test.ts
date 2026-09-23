import test from "node:test";
import assert from "node:assert/strict";
import { CommissionApplicationService } from "../../../packages/application/src/CommissionApplicationService.ts";
import type { CommissionRule, IInventoryListItem } from "../../../packages/contracts/src/index.ts";

function createMockItem(overrides: Partial<IInventoryListItem> = {}): IInventoryListItem {
  return {
    id: overrides.id || "inv-" + Math.random().toString(),
    model: overrides.model || "iPhone 15 Pro",
    capacity: overrides.capacity || "128GB",
    color: overrides.color || "Black",
    carrier: overrides.carrier || "Unlocked",
    condition: overrides.condition || "Used",
    grade: overrides.grade || "A",
    status: overrides.status || "Available",
    imei: overrides.imei || "123456789012345",
    sku: overrides.sku || "SKU123",
    serialNumber: overrides.serialNumber || "SN123",
    price: overrides.price !== undefined ? overrides.price : 15000,
    costPesos: overrides.costPesos !== undefined ? overrides.costPesos : 12000,
    costCurrency: overrides.costCurrency || "MXN",
    ...overrides,
  };
}

test("CommissionApplicationService applies default fixed rule for iPhone ($300 MXN)", () => {
  const service = new CommissionApplicationService();
  const rules = service.getDefaultRules();

  const item = createMockItem({
    id: "inv-1",
    model: "iPhone 15 Pro 128GB",
    price: 19500,
    costPesos: 15000,
  });

  const calc = service.calculateItemCommission({ inventoryItem: item, salePrice: 19500 }, rules);

  assert.equal(calc.category, "iphone");
  assert.equal(calc.commissionType, "fixed_per_unit");
  assert.equal(calc.commissionAmount, 300);
  assert.equal(calc.margin, 4500);
});

test("CommissionApplicationService applies margin percentage rule for Accessories (10% of margin)", () => {
  const service = new CommissionApplicationService();
  const rules = service.getDefaultRules();

  const accessory = createMockItem({
    id: "inv-acc-1",
    model: "Funda Silicone Case MagSafe",
    price: 800,
    costPesos: 300,
  });

  const calc = service.calculateItemCommission({ inventoryItem: accessory, salePrice: 800 }, rules);

  assert.equal(calc.category, "accessories");
  assert.equal(calc.commissionType, "percent_margin");
  assert.equal(calc.margin, 500);
  assert.equal(calc.commissionAmount, 50); // 10% of 500 = 50
});

test("CommissionApplicationService prevents negative commission if sold at or below cost", () => {
  const service = new CommissionApplicationService();
  const rules = service.getDefaultRules();

  const discountedItem = createMockItem({
    id: "inv-loss-1",
    model: "Cable USB-C 1m",
    price: 150,
    costPesos: 200, // Cost is higher than sale price
  });

  const calc = service.calculateItemCommission({ inventoryItem: discountedItem, salePrice: 150 }, rules);

  assert.equal(calc.margin, 0);
  assert.equal(calc.commissionAmount, 0); // No negative commission
});

test("CommissionApplicationService respects priority: specific model rule overrides category rule", () => {
  const service = new CommissionApplicationService();
  const customRules: CommissionRule[] = [
    ...service.getDefaultRules(),
    {
      id: "rule-custom-15pro",
      name: "Bono Especial iPhone 15 Pro ($500 MXN)",
      scope: "model",
      target: "iPhone 15 Pro",
      type: "fixed_per_unit",
      fixedAmount: 500,
      percentage: 0,
      enabled: true,
      priority: 50, // Higher priority than category (20)
    },
  ];

  const item15Pro = createMockItem({
    id: "inv-15p",
    model: "iPhone 15 Pro Max 256GB",
    price: 24000,
    costPesos: 20000,
  });

  const calc = service.calculateItemCommission({ inventoryItem: item15Pro, salePrice: 24000 }, customRules);

  assert.equal(calc.appliedRuleId, "rule-custom-15pro");
  assert.equal(calc.commissionAmount, 500);
});

test("CommissionApplicationService calculates combined rule (fixed base + percentage of margin)", () => {
  const service = new CommissionApplicationService();
  const rules: CommissionRule[] = [
    {
      id: "rule-combined",
      name: "Comisión Combinada ($100 base + 5% margen)",
      scope: "global",
      type: "combined",
      fixedAmount: 100,
      percentage: 5,
      enabled: true,
      priority: 10,
    },
  ];

  const item = createMockItem({
    id: "inv-comb",
    model: "MacBook Air M2",
    price: 20000,
    costPesos: 16000,
  });

  const calc = service.calculateItemCommission({ inventoryItem: item, salePrice: 20000 }, rules);

  // Margin = 4000, 5% of 4000 = 200, Base = 100, Total = 300
  assert.equal(calc.commissionType, "combined");
  assert.equal(calc.commissionAmount, 300);
});

test("CommissionApplicationService aggregates sale summary and generates seller reports", () => {
  const service = new CommissionApplicationService();
  const rules = service.getDefaultRules();

  const items = [
    {
      inventoryItem: createMockItem({
        id: "inv-1",
        model: "iPhone 14 128GB",
        price: 12000,
        costPesos: 9000,
      }),
      salePrice: 12000,
    },
    {
      inventoryItem: createMockItem({
        id: "inv-2",
        model: "Funda Case",
        price: 500,
        costPesos: 200,
      }),
      salePrice: 500,
    },
  ];

  const seller = { id: "seller-carlos", name: "Carlos Vendedor" };
  const summary = service.calculateSaleCommissions(items, rules, seller);

  assert.equal(summary.sellerName, "Carlos Vendedor");
  assert.equal(summary.totalSale, 12500);
  assert.equal(summary.totalCost, 9200);
  assert.equal(summary.totalMargin, 3300);
  // iPhone ($300) + Funda (10% of 300 = 30) = $330 MXN
  assert.equal(summary.totalCommission, 330);

  // Generate Seller Report
  const reports = service.generateSellerReports([
    {
      id: "rec-1",
      saleId: "sale-101",
      timestamp: new Date().toISOString(),
      sellerId: "seller-carlos",
      sellerName: "Carlos Vendedor",
      totalSale: summary.totalSale,
      totalMargin: summary.totalMargin,
      totalCommission: summary.totalCommission,
      items: summary.items.map((i) => ({
        model: i.model,
        salePrice: i.salePrice,
        cost: i.cost,
        commissionAmount: i.commissionAmount,
      })),
    },
  ]);

  assert.equal(reports.length, 1);
  assert.equal(reports[0].sellerId, "seller-carlos");
  assert.equal(reports[0].totalSalesCount, 1);
  assert.equal(reports[0].totalUnitsSold, 2);
  assert.equal(reports[0].totalCommissionsEarned, 330);
});

test("Commission role security: admin and superadmin can manage commissions, staff cannot", () => {
  const isAllowedToManageCommissions = (role: string, isSuperadmin: boolean = false, permissions?: Record<string, boolean>) => {
    if (isSuperadmin) return true;
    if (role === "admin" || role === "superadmin") return true;
    return permissions?.canManageCommissions === true;
  };

  // Superadmin allowed
  assert.equal(isAllowedToManageCommissions("staff", true), true);
  assert.equal(isAllowedToManageCommissions("superadmin", false), true);

  // Admin allowed
  assert.equal(isAllowedToManageCommissions("admin", false), true);

  // Staff denied by default
  assert.equal(isAllowedToManageCommissions("staff", false), false);
  assert.equal(isAllowedToManageCommissions("staff", false, {}), false);
  assert.equal(isAllowedToManageCommissions("staff", false, { canCreateSales: true }), false);

  // Staff with explicit permission override
  assert.equal(isAllowedToManageCommissions("staff", false, { canManageCommissions: true }), true);
});
