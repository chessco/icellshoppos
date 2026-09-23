/**
 * iReader Multiplatform Architecture v2.0 - Core Commission Contracts
 *
 * Canonical contracts for sales commissions, configurable calculation schemes,
 * seller attributions, and commission shift reporting.
 *
 * Supported schemes:
 *  - Fixed amount per unit (e.g. $300 MXN per iPhone)
 *  - Percentage of gross margin (salePrice - cost) (e.g. 10% on accessories)
 *  - Percentage of sale price (e.g. 3% on sale total)
 *  - Combined (fixed base + % of margin)
 */

export type CommissionType =
  | "fixed_per_unit"
  | "percent_margin"
  | "percent_price"
  | "combined";

export type CommissionScope =
  | "global"
  | "category"
  | "model"
  | "product";

export interface CommissionRule {
  id: string;
  name: string;
  scope: CommissionScope;
  /**
   * Target identifier matching category ('iphone', 'ipad', etc.),
   * model pattern ('iPhone 15 Pro'), or specific SKU/ID.
   */
  target?: string;
  type: CommissionType;
  /** Fixed amount in currency (e.g. 300 for $300 MXN) */
  fixedAmount?: number;
  /** Percentage (e.g. 10 for 10%) */
  percentage?: number;
  enabled: boolean;
  /** Evaluation priority. Higher priorities evaluate first (product > model > category > global) */
  priority: number;
}

export interface ItemCommissionCalculation {
  inventoryItemId?: string;
  model: string;
  category: string;
  salePrice: number;
  cost: number;
  margin: number;
  appliedRuleId?: string;
  appliedRuleName?: string;
  commissionType: CommissionType;
  commissionAmount: number;
}

export interface SellerProfile {
  id: string;
  name: string;
  email?: string;
  role?: string;
  avatarColor?: string;
}

export interface SaleCommissionSummary {
  sellerId: string;
  sellerName: string;
  totalSale: number;
  totalCost: number;
  totalMargin: number;
  totalCommission: number;
  items: ItemCommissionCalculation[];
  calculatedAt?: string;
}

export interface CommissionSaleRecord {
  id: string;
  saleId: string;
  saleNumber?: string;
  timestamp: string;
  sellerId: string;
  sellerName: string;
  totalSale: number;
  totalMargin: number;
  totalCommission: number;
  items: Array<{
    inventoryItemId?: string;
    model: string;
    salePrice: number;
    cost: number;
    commissionAmount: number;
    appliedRuleName?: string;
  }>;
}

export interface SellerCommissionReport {
  sellerId: string;
  sellerName: string;
  totalSalesCount: number;
  totalUnitsSold: number;
  grossSalesAmount: number;
  totalMarginAmount: number;
  totalCommissionsEarned: number;
}
