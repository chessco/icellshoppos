import type { ProBuyerApiClient } from "@ireader/api-client";
import type {
  CompleteSaleRequestPayload,
  CompleteSaleResponsePayload,
  BackendSaleCreatePayload,
  BackendSaleCreatedResponse,
} from "@ireader/contracts";

export class CheckoutApplicationService {
  private readonly apiClient: ProBuyerApiClient;

  constructor(apiClient: ProBuyerApiClient) {
    this.apiClient = apiClient;
  }

  validateSale(payload: CompleteSaleRequestPayload): { valid: boolean; error?: string } {
    if (!payload.items || payload.items.length === 0) {
      return { valid: false, error: "Sale must contain at least one item." };
    }
    const totalPayments = payload.payments.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(totalPayments - payload.totalPrice) > 0.01) {
      return { valid: false, error: "Total payments do not match total sale price." };
    }
    return { valid: true };
  }

  async processSale(payload: CompleteSaleRequestPayload): Promise<{ ok: boolean; data?: CompleteSaleResponsePayload; error?: string }> {
    const validation = this.validateSale(payload);
    if (!validation.valid) {
      return { ok: false, error: validation.error };
    }
    return this.apiClient.completeSale(payload);
  }

  validateBackendSale(payload: BackendSaleCreatePayload): { valid: boolean; error?: string } {
    if (!payload.items || payload.items.length === 0) {
      return { valid: false, error: "Sale must contain at least one item." };
    }
    if (!payload.customerName?.trim()) {
      return { valid: false, error: "Customer name is required." };
    }
    if (!payload.customerWhatsapp?.trim()) {
      return { valid: false, error: "Customer WhatsApp is required." };
    }
    if (!payload.paymentMethod?.trim()) {
      return { valid: false, error: "Payment method is required." };
    }
    return { valid: true };
  }

  async processBackendSale(payload: BackendSaleCreatePayload): Promise<{ ok: boolean; data?: BackendSaleCreatedResponse; error?: string }> {
    const validation = this.validateBackendSale(payload);
    if (!validation.valid) {
      return { ok: false, error: validation.error };
    }
    return this.apiClient.createSale(payload);
  }
}
