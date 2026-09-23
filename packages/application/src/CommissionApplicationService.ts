import type {
  CommissionRule,
  CommissionType,
  ItemCommissionCalculation,
  SaleCommissionSummary,
  SellerProfile,
  CommissionSaleRecord,
  SellerCommissionReport,
  IInventoryListItem,
} from "@ireader/contracts";

export interface CommissionCartItemInput {
  inventoryItem?: Partial<IInventoryListItem>;
  id?: string;
  model?: string;
  category?: string;
  salePrice: number;
  costPrice?: number;
  costPesos?: number | string;
  quantity?: number;
}

export class CommissionApplicationService {
  /**
   * Returns default out-of-the-box commission rules:
   * - iPhone: $300 MXN fixed per unit
   * - iPad: $200 MXN fixed per unit
   * - Mac: $400 MXN fixed per unit
   * - Apple Watch: $150 MXN fixed per unit
   * - Accessories: 10% on gross margin
   * - Global fallback: 5% on gross margin
   */
  getDefaultRules(): CommissionRule[] {
    return [
      {
        id: "rule-cat-iphone",
        name: "iPhone ($300 MXN por equipo)",
        scope: "category",
        target: "iphone",
        type: "fixed_per_unit",
        fixedAmount: 300,
        percentage: 0,
        enabled: true,
        priority: 20,
      },
      {
        id: "rule-cat-ipad",
        name: "iPad ($200 MXN por equipo)",
        scope: "category",
        target: "ipad",
        type: "fixed_per_unit",
        fixedAmount: 200,
        percentage: 0,
        enabled: true,
        priority: 20,
      },
      {
        id: "rule-cat-mac",
        name: "MacBook / iMac ($400 MXN por equipo)",
        scope: "category",
        target: "mac",
        type: "fixed_per_unit",
        fixedAmount: 400,
        percentage: 0,
        enabled: true,
        priority: 20,
      },
      {
        id: "rule-cat-watch",
        name: "Apple Watch ($150 MXN por equipo)",
        scope: "category",
        target: "watch",
        type: "fixed_per_unit",
        fixedAmount: 150,
        percentage: 0,
        enabled: true,
        priority: 20,
      },
      {
        id: "rule-cat-accessories",
        name: "Accesorios (10% del margen)",
        scope: "category",
        target: "accessories",
        type: "percent_margin",
        fixedAmount: 0,
        percentage: 10,
        enabled: true,
        priority: 15,
      },
      {
        id: "rule-global-default",
        name: "Regla General Base (5% margen)",
        scope: "global",
        type: "percent_margin",
        fixedAmount: 0,
        percentage: 5,
        enabled: true,
        priority: 1,
      },
    ];
  }

  /**
   * Helper to detect device category from inventory model name or category field
   */
  detectCategory(modelName: string): string {
    const m = (modelName || "").toLowerCase();
    if (m.includes("iphone")) return "iphone";
    if (m.includes("ipad")) return "ipad";
    if (m.includes("mac") || m.includes("imac") || m.includes("book")) return "mac";
    if (m.includes("watch")) return "watch";
    if (
      m.includes("case") ||
      m.includes("funda") ||
      m.includes("cable") ||
      m.includes("cargador") ||
      m.includes("mica") ||
      m.includes("airpod") ||
      m.includes("adaptador")
    ) {
      return "accessories";
    }
    return "other";
  }

  /**
   * Evaluates and calculates the commission for an individual cart item
   */
  calculateItemCommission(
    item: CommissionCartItemInput,
    rules: CommissionRule[]
  ): ItemCommissionCalculation {
    const inv = item.inventoryItem || {};
    const model = (item.model || inv.model || "").trim() || "Dispositivo";
    const category = item.category || this.detectCategory(model);
    const salePrice = Number(item.salePrice) || 0;

    // Resolve cost safely (item.costPrice > item.costPesos > inv.costPesos > inv.cost > 0)
    const cost =
      Number(item.costPrice) ||
      Number(item.costPesos) ||
      Number(inv.costPesos) ||
      Number((inv as unknown as { cost?: number })?.cost) ||
      0;
    const margin = Math.max(0, salePrice - cost);
    const itemId = item.id || inv.id || "";

    // Filter enabled rules and sort by priority descending
    const activeRules = (rules || [])
      .filter((r) => r.enabled)
      .sort((a, b) => b.priority - a.priority);

    let matchingRule: CommissionRule | undefined;

    for (const rule of activeRules) {
      if (rule.scope === "product") {
        const target = (rule.target || "").toLowerCase();
        if (
          target &&
          (target === itemId.toLowerCase() ||
            target === (inv.sku || "").toLowerCase() ||
            target === (inv.imei || "").toLowerCase())
        ) {
          matchingRule = rule;
          break;
        }
      } else if (rule.scope === "model") {
        if (
          rule.target &&
          model.toLowerCase().includes(rule.target.trim().toLowerCase())
        ) {
          matchingRule = rule;
          break;
        }
      } else if (rule.scope === "category") {
        if (
          rule.target &&
          (rule.target.toLowerCase() === category.toLowerCase() ||
            (rule.target.toLowerCase() === "accessories" && category.toLowerCase() === "other"))
        ) {
          matchingRule = rule;
          break;
        }
      } else if (rule.scope === "global") {
        matchingRule = rule;
        break;
      }
    }

    if (!matchingRule) {
      return {
        inventoryItemId: itemId || undefined,
        model,
        category,
        salePrice,
        cost,
        margin,
        commissionType: "fixed_per_unit",
        commissionAmount: 0,
      };
    }

    let commissionAmount = 0;
    const fixed = Number(matchingRule.fixedAmount) || 0;
    const pct = Number(matchingRule.percentage) || 0;

    switch (matchingRule.type) {
      case "fixed_per_unit":
        commissionAmount = fixed;
        break;
      case "percent_margin":
        commissionAmount = margin * (pct / 100);
        break;
      case "percent_price":
        commissionAmount = salePrice * (pct / 100);
        break;
      case "combined":
        commissionAmount = fixed + margin * (pct / 100);
        break;
    }

    // Comisiones no pueden ser negativas y se redondean a 2 decimales
    commissionAmount = Math.max(0, Math.round(commissionAmount * 100) / 100);

    return {
      inventoryItemId: itemId || undefined,
      model,
      category,
      salePrice,
      cost,
      margin,
      appliedRuleId: matchingRule.id,
      appliedRuleName: matchingRule.name,
      commissionType: matchingRule.type,
      commissionAmount,
    };
  }

  /**
   * Calculates total commission breakdown for the entire sale
   */
  calculateSaleCommissions(
    items: CommissionCartItemInput[],
    rules: CommissionRule[],
    seller?: SellerProfile
  ): SaleCommissionSummary {
    const itemCalcs: ItemCommissionCalculation[] = (items || []).map((it) =>
      this.calculateItemCommission(it, rules)
    );

    const totalSale = itemCalcs.reduce((acc, it) => acc + it.salePrice, 0);
    const totalCost = itemCalcs.reduce((acc, it) => acc + it.cost, 0);
    const totalMargin = itemCalcs.reduce((acc, it) => acc + it.margin, 0);
    const totalCommission = itemCalcs.reduce((acc, it) => acc + it.commissionAmount, 0);

    return {
      sellerId: seller?.id || "seller-pos",
      sellerName: seller?.name || "Vendedor Mostrador",
      totalSale,
      totalCost,
      totalMargin,
      totalCommission: Math.round(totalCommission * 100) / 100,
      items: itemCalcs,
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Alias for calculateSaleCommissions
   */
  calculateSaleCommission(
    items: CommissionCartItemInput[],
    rules: CommissionRule[],
    seller?: SellerProfile
  ): SaleCommissionSummary {
    return this.calculateSaleCommissions(items, rules, seller);
  }

  /**
   * Generates aggregated commission reports grouped by seller from local transaction history
   */
  generateSellerReports(records: CommissionSaleRecord[]): SellerCommissionReport[] {
    const map = new Map<string, SellerCommissionReport>();

    for (const rec of records || []) {
      const existing = map.get(rec.sellerId) || {
        sellerId: rec.sellerId,
        sellerName: rec.sellerName || "Vendedor",
        totalSalesCount: 0,
        totalUnitsSold: 0,
        grossSalesAmount: 0,
        totalMarginAmount: 0,
        totalCommissionsEarned: 0,
      };

      existing.totalSalesCount += 1;
      existing.totalUnitsSold += (rec.items || []).length;
      existing.grossSalesAmount += Number(rec.totalSale) || 0;
      existing.totalMarginAmount += Number(rec.totalMargin) || 0;
      existing.totalCommissionsEarned += Number(rec.totalCommission) || 0;

      map.set(rec.sellerId, existing);
    }

    return Array.from(map.values()).sort(
      (a, b) => b.totalCommissionsEarned - a.totalCommissionsEarned
    );
  }
}
