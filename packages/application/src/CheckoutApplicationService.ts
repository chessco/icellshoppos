import type { ProBuyerApiClient } from "@ireader/api-client";
import type {
  CompleteSaleRequestPayload,
  CompleteSaleResponsePayload,
  BackendSaleCreatePayload,
  BackendSaleCreatedResponse,
  IPaymentCapabilities,
  ICreatePaymentIntentPayload,
  ICreatePaymentIntentResponse,
  IVerifyPaymentStatusPayload,
  IVerifyPaymentStatusResponse,
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

  // ─── Payment Capabilities & Stripe Reader Orchestration ───────────────────
  async getPaymentCapabilities(siteId?: string): Promise<IPaymentCapabilities | null> {
    const res = await this.apiClient.getPaymentCapabilities(siteId);
    if (!res.ok || !res.data) {
      // Fallback default safe capabilities (Cash & Transfer enabled, Stripe disabled)
      return {
        cashEnabled: true,
        transferEnabled: true,
        cardEnabled: false,
        stripeReaderEnabled: false,
        stripeTapToPayEnabled: false,
        creditEnabled: true,
        otherEnabled: true,
        defaultMethod: "Cash",
      };
    }
    return res.data;
  }

  async initiateStripeCardPayment(payload: ICreatePaymentIntentPayload): Promise<ICreatePaymentIntentResponse> {
    return this.apiClient.createStripePaymentIntent(payload);
  }

  async verifyStripePayment(payload: IVerifyPaymentStatusPayload): Promise<IVerifyPaymentStatusResponse> {
    return this.apiClient.verifyStripePaymentStatus(payload);
  }

  async cancelStripePayment(paymentIntentId: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
    return this.apiClient.cancelStripePaymentIntent({ paymentIntentId, reason });
  }

  async createStripeCheckoutSession(payload: {
    amount: number;
    currency?: string;
    saleId?: string;
    customerEmail?: string;
    customerName?: string;
    customerPhone?: string;
    description?: string;
  }): Promise<{ ok: boolean; checkoutUrl?: string; qrCodeUrl?: string; sessionId?: string; error?: string }> {
    return this.apiClient.createStripeCheckoutSession(payload);
  }
}

