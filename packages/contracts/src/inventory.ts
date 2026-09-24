/**
 * iReader Multiplatform Architecture v2.0 - Core Inventory & Intake Contracts
 *
 * Canonical domain & API contracts for inventory management, duplicate checking,
 * model catalogs, and pricing rules.
 *
 * Designed to be consumed by:
 *  - iReader Windows (Electron)
 *  - iReader iPad POS (React Native + Expo)
 */

export interface InventoryCheckRequest {
  baseUrl?: string;
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

export interface IInventoryListItem {
  id: string;
  imei: string | null;
  sku: string | null;
  serialNumber: string | null;
  model: string;
  capacity: string | null;
  color: string | null;
  carrier: string | null;
  condition: string | null;
  grade: string | null;
  status: string;
  costPesos: number | string;
  costCurrency: string;
  price: number | string;
  price2?: number | string | null;
  price3?: number | string | null;
  batteryHealth?: string | null;
  cycleCount?: number | null;
  iosVersion?: string | null;
  comments?: string | null;
  site?: { id: string; name: string } | null;
  deviceType?: { id: string; name: string } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryListResponse {
  inventoryItems: IInventoryListItem[];
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

// ─── Smart Scanner (Barcode + QR + OCR) Contracts ──────────────────────────

export interface SmartScanParsedIdentifiers {
  imei?: string | null;
  serial?: string | null;
  sku?: string | null;
  model?: string | null;
  partNumber?: string | null;
  brand?: string | null;
}

export interface SmartScanSearchRequest {
  scanType: "BARCODE" | "QR" | "OCR_TEXT";
  rawText: string;
  parsedIdentifiers?: SmartScanParsedIdentifiers;
}

export interface SmartScanCandidateItem {
  id: string;
  model: string;
  capacity?: string | null;
  color?: string | null;
  sku?: string | null;
  price: number;
  confidence: number;
  matchReason?: string;
  rawItem?: IInventoryListItem;
}

export interface SmartScanSearchResponse {
  scanType: "BARCODE" | "QR" | "OCR_TEXT";
  matchType: "EXACT" | "CANDIDATE" | "AMBIGUOUS" | "NOT_FOUND";
  resolvedItem?: IInventoryListItem;
  candidates: SmartScanCandidateItem[];
  rawText?: string;
}
