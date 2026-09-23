/**
 * iReader Multiplatform Architecture v2.0 - Core Checkout & Sales Contracts
 *
 * Canonical contracts for POS checkout, split payment methods, sales history,
 * and thermal receipt generation.
 *
 * Designed to be consumed by:
 *  - iReader Windows (Electron)
 *  - iReader iPad POS (React Native + Expo)
 */

export interface CheckoutPaymentEntry {
  method: "Cash" | "Transfer" | "Card" | "Trade-in" | "Credit" | "Other";
  amount: number;
  reference?: string;
}

export interface CheckoutItemPayload {
  inventoryItemId?: string;
  imei?: string;
  model: string;
  capacity?: string;
  color?: string;
  salePrice: number;
  cost?: number;
}

export interface CompleteSaleRequestPayload {
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  items: CheckoutItemPayload[];
  payments: CheckoutPaymentEntry[];
  totalPrice: number;
  discountAmount?: number;
  comments?: string;
}

export interface CompleteSaleResponsePayload {
  ok: boolean;
  saleId: string;
  saleNumber?: string;
  totalAmount: number;
  receiptPdfUrl?: string;
  createdAt: string;
}

export interface BackendSaleItemInput {
  inventoryItemId?: string;
  imei: string;
  salePrice: number;
}

export interface ActiveDiscountAuthInfo {
  id: string;
  status: "PENDING" | "APPROVED" | "PARTIAL" | "REJECTED" | "CANCELLED";
  requestedDiscount: number;
  approvedDiscount: number;
  reason: string;
  responseNote?: string | null;
}

export interface BackendSaleCreatePayload {
  saleId?: string;
  customerName?: string;
  customerEmail?: string;
  customerWhatsapp?: string;
  sendReceiptEmail?: boolean;
  paymentMethod?: string;
  paymentBreakdown?: Record<string, number | string>;
  notes?: string;
  soldBy?: string;
  items: BackendSaleItemInput[];
  authorizationId?: string;
  discount?: number;
}

export interface SaleCustomerInfo {
  id?: string;
  name: string;
  email?: string;
  whatsapp?: string;
}

export interface SaleResponseItem {
  id?: string;
  inventoryItemId?: string;
  imei?: string;
  model?: string;
  capacity?: string;
  color?: string;
  salePrice: number;
}

export interface BackendSaleCreatedResponse {
  success: boolean;
  saleId: string;
  saleNumber?: string;
  total: number;
  items: SaleResponseItem[];
  paymentMethod?: string;
  customer?: SaleCustomerInfo;
  createdAt?: string;
  pdfUrl?: string;
  idempotentReplay?: boolean;
}

