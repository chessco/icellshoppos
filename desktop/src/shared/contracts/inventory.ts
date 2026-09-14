/**
 * iReader Multiplatform Architecture v2.0 - Core Inventory & POS Contracts
 *
 * Canonical domain & API contracts for inventory management, duplicate checking,
 * POS checkout, and thermal label design.
 *
 * Designed to be consumed by:
 *  - iReader Windows (Electron)
 *  - iReader iPad POS (React Native + Expo)
 */

export interface InventoryCheckRequest {
  baseUrl: string;
  imei?: string;
  serialNumber?: string;
  sku?: string;
  id?: string;
  excludeId?: string;
}

export interface InventoryCheckResponse {
  exists: boolean;
  item?: {
    id: string;
    imei?: string;
    serialNumber?: string;
    model?: string;
    status?: string;
  };
}

export interface InventoryItemPayload {
  deviceTypeId?: string;
  imei: string;
  serialNumber: string;
  model: string;
  capacity: string;
  color: string;
  batteryHealth?: string;
  cycleCount?: string;
  iosVersion?: string;
  dateOfPurchase?: string;
  siteId?: string;
  locationSiteId?: string;
  carrier?: string;
  condition?: string;
  grade?: string;
  supplier?: string;
  cost?: string | number;
  currency?: string;
  price?: string | number;
  price2?: string | number;
  price3?: string | number;
  status?: string;
  comments?: string;
}

export interface NamedOption {
  id: string;
  name: string;
  status?: string;
}

export interface ModelCatalogEntry {
  capacities: string[];
  colors: string[];
  deviceTypeId?: string;
}

export interface PricingRuleEntry {
  model: string;
  capacity: string;
  price: string;
  price2: string;
  price3: string;
}

export interface InventoryOptionsResponse {
  deviceTypes: NamedOption[];
  sites: NamedOption[];
  suppliers: NamedOption[];
  carriers: string[];
  conditions: string[];
  grades: string[];
  statuses: string[];
  currencies: string[];
  modelCatalog: Record<string, ModelCatalogEntry>;
  pricingRules: PricingRuleEntry[];
}
