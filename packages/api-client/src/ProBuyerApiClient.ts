import type {
  LoginRequestPayload,
  LoginResponsePayload,
  SessionMeResponse,
  InventoryCheckRequest,
  InventoryCheckResponse,
  InventoryItemPayload,
  InventoryOptionsResponse,
  IInventoryListItem,
  InventoryListResponse,
  CompleteSaleRequestPayload,
  CompleteSaleResponsePayload,
  BackendSaleCreatePayload,
  BackendSaleCreatedResponse,
  IAuthToken,
  SmartScanSearchRequest,
  SmartScanSearchResponse,
  IPaymentCapabilities,
  IStripeReaderInfo,
  IPOSDeviceInfo,
  IConnectionTokenResponse,
  ICreatePaymentIntentPayload,
  ICreatePaymentIntentResponse,
  IVerifyPaymentStatusPayload,
  IVerifyPaymentStatusResponse,
  IPaymentHandoffInfo,
  ICreateHandoffPayload,
  ICreateHandoffResponse,
  IAcceptHandoffPayload,
  IAcceptHandoffResponse,
  IAvailableTargetDevice,
} from "@ireader/contracts";

export interface IApiClientConfig {
  baseUrl: string;
  timeoutMs?: number;
  getToken?: () => Promise<IAuthToken | null> | IAuthToken | null;
  onUnauthorized?: () => void;
}

export class ProBuyerApiClient {
  private baseUrl: string;
  private timeoutMs: number;
  private getToken?: () => Promise<IAuthToken | null> | IAuthToken | null;
  private onUnauthorized?: () => void;

  constructor(config: IApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 15000;
    this.getToken = config.getToken;
    this.onUnauthorized = config.onUnauthorized;
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, "");
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<{ ok: boolean; status: number; data?: T; error?: string; headers: Headers }> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = new Headers(options.headers || {});

    if (!headers.has("content-type") && options.body && typeof options.body === "string") {
      headers.set("content-type", "application/json");
    }
    headers.set("ngrok-skip-browser-warning", "1");

    if (this.getToken) {
      const token = await this.getToken();
      if (token) {
        headers.set(token.headerName, token.headerValue);
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: options.signal || controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401 && this.onUnauthorized) {
        this.onUnauthorized();
      }

      let data: any = undefined;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await response.json().catch(() => undefined);
      }

      if (!response.ok) {
        const errorMsg = data?.error || data?.message || `HTTP ${response.status}`;
        return { ok: false, status: response.status, error: errorMsg, data, headers: response.headers };
      }

      return { ok: true, status: response.status, data, headers: response.headers };
    } catch (err) {
      clearTimeout(timeoutId);
      const isAbort = (err as any)?.name === "AbortError";
      const message = isAbort
        ? "Network request timed out. Please check your connection and retry."
        : err instanceof Error
        ? err.message
        : "Network error";
      return { ok: false, status: 0, error: message, headers: new Headers() };
    }
  }

  // ─── Auth Endpoints ────────────────────────────────────────────────────────
  async login(payload: LoginRequestPayload): Promise<{ ok: boolean; status: number; data?: LoginResponsePayload; error?: string; rawHeaders: Headers }> {
    const res = await this.request<LoginResponsePayload>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: payload.email,
        password: payload.password,
        verificationCode: payload.verificationCode,
        organizationId: payload.organizationId,
      }),
    });
    return { ok: res.ok, status: res.status, data: res.data, error: res.error, rawHeaders: res.headers };
  }

  async me(): Promise<{ ok: boolean; status: number; data?: SessionMeResponse; error?: string }> {
    return this.request<SessionMeResponse>("/api/auth/me", { method: "GET" });
  }

  // ─── Inventory Endpoints ───────────────────────────────────────────────────
  async checkDuplicate(req: InventoryCheckRequest): Promise<{ ok: boolean; data?: InventoryCheckResponse; error?: string }> {
    const search = new URLSearchParams();
    if (req.imei) search.set("imei", req.imei);
    if (req.serialNumber) search.set("serialNumber", req.serialNumber);
    if (req.sku) search.set("sku", req.sku);
    if (req.id) search.set("id", req.id);
    if (req.excludeId) search.set("excludeId", req.excludeId);

    const res = await this.request<InventoryCheckResponse>(`/api/inventory/check-imei?${search.toString()}`, { method: "GET" });
    return { ok: res.ok, data: res.data, error: res.error };
  }

  async addInventoryItem(payload: Record<string, unknown>): Promise<{ ok: boolean; data?: any; error?: string }> {
    const res = await this.request("/api/inventory", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: res.data, error: res.error };
  }

  async getInventoryOptions(): Promise<{ ok: boolean; data?: InventoryOptionsResponse; error?: string }> {
    const [deviceTypes, locations, suppliers, carriers, conditions, grades, modelCatalog, pricingRules] = await Promise.all([
      this.request<{ deviceTypes?: any[] }>("/api/device-types"),
      this.request<{ locations?: any[] }>("/api/locations"),
      this.request<{ suppliers?: any[] }>("/api/suppliers"),
      this.request<{ options?: string[] }>("/api/org/carriers"),
      this.request<{ options?: string[] }>("/api/org/condition-options"),
      this.request<{ options?: string[] }>("/api/org/grade-options"),
      this.request<{ catalog?: Record<string, any> }>("/api/org/model-catalog"),
      this.request<{ rules?: any[] }>("/api/pricing-rules"),
    ]);

    const cleanNamed = (raw: any[] | undefined) => (raw || []).map((i) => ({ id: String(i.id || ""), name: String(i.name || ""), status: i.status }));

    return {
      ok: true,
      data: {
        deviceTypes: cleanNamed(deviceTypes.data?.deviceTypes),
        sites: cleanNamed(locations.data?.locations).filter((l) => l.status !== "Inactive"),
        suppliers: cleanNamed(suppliers.data?.suppliers).filter((s) => s.status !== "Inactive"),
        carriers: carriers.data?.options || ["Unlocked", "AT&T", "Verizon", "T-Mobile"],
        conditions: conditions.data?.options || ["New", "Used", "Refurbished", "For parts"],
        grades: grades.data?.options || ["A", "AB", "A+", "B", "B-"],
        statuses: ["Available", "Sold", "Reserved", "Damaged"],
        currencies: ["MXN", "USD"],
        modelCatalog: (modelCatalog.data?.catalog as any) || {},
        pricingRules: (pricingRules.data?.rules as any) || [],
      },
    };
  }

  async getInventoryList(status?: string): Promise<{ ok: boolean; data?: IInventoryListItem[]; error?: string }> {
    const query = status && status !== "All" ? `?status=${encodeURIComponent(status)}` : "";
    const res = await this.request<InventoryListResponse>(`/api/inventory${query}`, { method: "GET" });
    return { ok: res.ok, data: res.data?.inventoryItems, error: res.error };
  }

  // ─── Checkout & Sales Endpoints (Authority delegated to Backend) ───────────
  async completeSale(payload: CompleteSaleRequestPayload): Promise<{ ok: boolean; data?: CompleteSaleResponsePayload; error?: string }> {
    const res = await this.request<CompleteSaleResponsePayload>("/api/checkout", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: res.data, error: res.error };
  }

  async createSale(payload: BackendSaleCreatePayload): Promise<{ ok: boolean; data?: BackendSaleCreatedResponse; error?: string }> {
    const res = await this.request<BackendSaleCreatedResponse>("/api/sales", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: res.data, error: res.error };
  }

  async getSalesHistory(from?: string, to?: string): Promise<{ ok: boolean; data?: any[]; error?: string }> {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await this.request<{ sales: any[] }>(`/api/sales${qs}`, { method: "GET" });
    return { ok: res.ok, data: res.data?.sales, error: res.error };
  }

  // ─── Customer Endpoints ───────────────────────────────────────────────────
  async getCustomers(): Promise<{ ok: boolean; data?: any[]; error?: string }> {
    const res = await this.request<{ customers: any[] }>("/api/customers", { method: "GET" });
    return { ok: res.ok, data: res.data?.customers, error: res.error };
  }

  async addCustomer(payload: Record<string, unknown>): Promise<{ ok: boolean; data?: any; error?: string }> {
    const res = await this.request<{ customer: any }>("/api/customers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: res.data?.customer, error: res.error };
  }

  async getCreditLedger(customerId?: string): Promise<{ ok: boolean; data?: any[]; grandTotal?: number; error?: string }> {
    const query = customerId ? `?customerId=${encodeURIComponent(customerId)}` : "";
    const res = await this.request<{ customers: any[]; grandTotal?: number }>(`/api/credit-ledger${query}`, { method: "GET" });
    return { ok: res.ok, data: res.data?.customers, grandTotal: res.data?.grandTotal, error: res.error };
  }

  // ─── Discount Authorizations ──────────────────────────────────────────────
  async requestDiscountAuthorization(payload: {
    draftSaleId: string;
    requestedDiscount: number;
    reason: string;
    customerName?: string;
    customerEmail?: string;
    customerWhatsapp?: string;
    items: { inventoryItemId?: string; salePrice: number }[];
  }): Promise<{ ok: boolean; data?: any; error?: string; agentTriggered?: boolean; agentError?: string }> {
    const res = await this.request<{ authorization: any; agentTriggered?: boolean; agentError?: string }>("/api/sales/authorizations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return {
      ok: res.ok,
      data: res.data?.authorization,
      error: res.error,
      agentTriggered: res.data?.agentTriggered,
      agentError: res.data?.agentError,
    };
  }

  async getDiscountAuthorization(id: string): Promise<{ ok: boolean; data?: any; error?: string }> {
    const res = await this.request<{ authorization: any }>(`/api/sales/authorizations/${encodeURIComponent(id)}`, {
      method: "GET",
    });
    return { ok: res.ok, data: res.data?.authorization, error: res.error };
  }

  // ─── Chat & WhatsApp Messaging ────────────────────────────────────────────
  async getWhatsAppConversations(tab: "whatsapp" | "internal" = "whatsapp"): Promise<{ ok: boolean; data?: any[]; error?: string }> {
    const res = await this.request<{ conversations: any[] }>(`/api/messages/conversations?tab=${encodeURIComponent(tab)}`, {
      method: "GET",
    });
    return { ok: res.ok, data: res.data?.conversations, error: res.error };
  }

  async getChatMessages(conversationId: string, channel: "WHATSAPP" | "INTERNAL" = "WHATSAPP"): Promise<{ ok: boolean; data?: any[]; error?: string }> {
    const res = await this.request<{ messages: any[] }>(`/api/messages/history?conversationId=${encodeURIComponent(conversationId)}&channel=${encodeURIComponent(channel)}`, {
      method: "GET",
    });
    return { ok: res.ok, data: res.data?.messages, error: res.error };
  }

  async sendChatMessage(payload: {
    channel?: "WHATSAPP" | "INTERNAL";
    phone?: string;
    recipientUserId?: string;
    recipientName?: string;
    content: string;
  }): Promise<{ ok: boolean; data?: any; error?: string; providerResult?: any }> {
    const res = await this.request<{ success: boolean; message: any; providerResult?: any }>("/api/messages/send", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: res.data?.message, error: res.error, providerResult: res.data?.providerResult };
  }

  // ─── Smart Scanner Search ─────────────────────────────────────────────────
  async searchSmartCatalog(payload: SmartScanSearchRequest): Promise<{ ok: boolean; data?: SmartScanSearchResponse; error?: string }> {
    const res = await this.request<SmartScanSearchResponse>("/api/inventory/search", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: res.data, error: res.error };
  }

  // ─── Payment Capabilities & Multi-Tenant Configuration ──────────────────────
  async getPaymentCapabilities(siteId?: string): Promise<{ ok: boolean; data?: IPaymentCapabilities; error?: string }> {
    const qs = siteId ? `?siteId=${encodeURIComponent(siteId)}` : "";
    const res = await this.request<{ capabilities: IPaymentCapabilities }>(`/api/org/payment-capabilities${qs}`, {
      method: "GET",
    });
    return { ok: res.ok, data: res.data?.capabilities, error: res.error };
  }

  async updatePaymentCapabilities(capabilities: Partial<IPaymentCapabilities>, siteId?: string): Promise<{ ok: boolean; data?: IPaymentCapabilities; error?: string }> {
    const res = await this.request<{ capabilities: IPaymentCapabilities }>("/api/org/payment-capabilities", {
      method: "PUT",
      body: JSON.stringify({ siteId, capabilities }),
    });
    return { ok: res.ok, data: res.data?.capabilities, error: res.error };
  }

  // ─── POS Device Identity & Hardware Registration ───────────────────────────
  async getPosDevices(): Promise<{ ok: boolean; data?: IPOSDeviceInfo[]; error?: string }> {
    const res = await this.request<{ devices: IPOSDeviceInfo[] }>("/api/org/pos-devices", { method: "GET" });
    return { ok: res.ok, data: res.data?.devices, error: res.error };
  }

  async registerPosDevice(payload: {
    deviceUuid: string;
    deviceName: string;
    deviceType?: string;
    siteId?: string;
    stripeReaderId?: string;
  }): Promise<{ ok: boolean; data?: IPOSDeviceInfo; error?: string }> {
    const res = await this.request<{ device: IPOSDeviceInfo }>("/api/org/pos-devices", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: res.data?.device, error: res.error };
  }

  async getStripeReaders(): Promise<{ ok: boolean; data?: IStripeReaderInfo[]; error?: string }> {
    const res = await this.request<{ readers: IStripeReaderInfo[] }>("/api/org/stripe-readers", { method: "GET" });
    return { ok: res.ok, data: res.data?.readers, error: res.error };
  }

  async registerStripeReader(payload: {
    label: string;
    serialNumber: string;
    deviceType?: string;
    ipAddress?: string;
    stripeLocationId?: string;
    stripeReaderId?: string;
  }): Promise<{ ok: boolean; data?: IStripeReaderInfo; error?: string }> {
    const res = await this.request<{ reader: IStripeReaderInfo }>("/api/org/stripe-readers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: res.data?.reader, error: res.error };
  }

  // ─── Stripe Terminal Payment Orchestration ─────────────────────────────────
  async getStripeConnectionToken(siteId?: string): Promise<{ ok: boolean; secret?: string; error?: string }> {
    const res = await this.request<IConnectionTokenResponse>("/api/payments/stripe/connection-token", {
      method: "POST",
      body: JSON.stringify({ siteId }),
    });
    return { ok: res.ok, secret: res.data?.secret, error: res.error };
  }

  async createStripePaymentIntent(payload: ICreatePaymentIntentPayload): Promise<ICreatePaymentIntentResponse> {
    const body = {
      ...payload,
      idempotencyKey:
        payload.idempotencyKey ||
        `ik_${payload.saleId || "charge"}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    };
    const res = await this.request<ICreatePaymentIntentResponse>("/api/payments/stripe/create-intent", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.data) {
      return {
        ok: false,
        paymentIntentId: "",
        clientSecret: "",
        posPaymentId: "",
        paymentAttemptId: "",
        amount: payload.amount,
        currency: payload.currency || "mxn",
        status: "FAILED",
        error: res.error || "Failed to initialize Stripe payment intent on server.",
      };
    }
    return res.data;
  }

  async verifyStripePaymentStatus(payload: IVerifyPaymentStatusPayload): Promise<IVerifyPaymentStatusResponse> {
    const res = await this.request<IVerifyPaymentStatusResponse>("/api/payments/stripe/verify-status", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok || !res.data) {
      return {
        ok: false,
        status: "UNKNOWN",
        paymentAttemptStatus: "UNKNOWN",
        posPaymentStatus: "UNKNOWN",
        isUnknown: true,
        error: res.error || "Failed to reach server to verify payment status.",
      };
    }
    return res.data;
  }

  async cancelStripePaymentIntent(payload: { paymentIntentId: string; reason?: string }): Promise<{ ok: boolean; error?: string }> {
    const res = await this.request<{ success: boolean }>("/api/payments/stripe/cancel-intent", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, error: res.error };
  }

  async createStripeCheckoutSession(payload: {
    amount: number;
    currency?: string;
    saleId?: string;
    customerEmail?: string;
    customerName?: string;
    description?: string;
  }): Promise<{ ok: boolean; checkoutUrl?: string; qrCodeUrl?: string; sessionId?: string; error?: string }> {
    const res = await this.request<{
      ok: boolean;
      sessionId: string;
      checkoutUrl: string;
      qrCodeUrl: string;
    }>("/api/payments/stripe/create-checkout-session", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok || !res.data) {
      return { ok: false, error: res.error || "No se pudo generar el enlace de pago de Stripe." };
    }
    return {
      ok: true,
      checkoutUrl: res.data.checkoutUrl,
      qrCodeUrl: res.data.qrCodeUrl,
      sessionId: res.data.sessionId,
    };
  }

  // ─── Cross-Device Payment Handoff (iPad <-> iPhone) ───────────────────────
  async createPaymentHandoff(payload: ICreateHandoffPayload & { siteId?: string }): Promise<ICreateHandoffResponse> {
    const res = await this.request<ICreateHandoffResponse>("/api/payments/handoffs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok || !res.data) {
      return {
        ok: false,
        handoffId: "",
        handoff: null as any,
        error: res.error || "Failed to create payment handoff.",
      };
    }
    return res.data;
  }

  async getPaymentHandoff(handoffId: string): Promise<{ ok: boolean; handoff?: IPaymentHandoffInfo; error?: string }> {
    const res = await this.request<{ ok: boolean; handoff: IPaymentHandoffInfo }>(`/api/payments/handoffs/${handoffId}`, {
      method: "GET",
    });
    return { ok: res.ok, handoff: res.data?.handoff, error: res.error };
  }

  async getPendingPaymentHandoffs(params: { siteId?: string | null; targetDeviceId?: string | null } = {}): Promise<{ ok: boolean; handoffs?: IPaymentHandoffInfo[]; error?: string }> {
    const query = new URLSearchParams();
    if (params.siteId) query.append("siteId", params.siteId);
    if (params.targetDeviceId) query.append("targetDeviceId", params.targetDeviceId);
    const res = await this.request<{ ok: boolean; handoffs: IPaymentHandoffInfo[] }>(`/api/payments/handoffs?${query.toString()}`, {
      method: "GET",
    });
    return { ok: res.ok, handoffs: res.data?.handoffs || [], error: res.error };
  }

  async acceptPaymentHandoff(handoffId: string, payload: IAcceptHandoffPayload = {}): Promise<IAcceptHandoffResponse> {
    const res = await this.request<IAcceptHandoffResponse>(`/api/payments/handoffs/${handoffId}/accept`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok || !res.data) {
      return {
        ok: false,
        handoff: null as any,
        error: res.error || "Failed to accept payment handoff.",
      };
    }
    return res.data;
  }

  async rejectPaymentHandoff(handoffId: string, payload: { targetDeviceId?: string; reason?: string } = {}): Promise<{ ok: boolean; error?: string }> {
    const res = await this.request<{ ok: boolean }>(`/api/payments/handoffs/${handoffId}/reject`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, error: res.error };
  }

  async cancelPaymentHandoff(handoffId: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
    const res = await this.request<{ ok: boolean }>(`/api/payments/handoffs/${handoffId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    return { ok: res.ok, error: res.error };
  }

  async getAvailableTargetDevices(siteId?: string): Promise<{ ok: boolean; devices?: IAvailableTargetDevice[]; error?: string }> {
    const query = siteId ? `?siteId=${encodeURIComponent(siteId)}` : "";
    const res = await this.request<{ ok: boolean; devices: IAvailableTargetDevice[] }>(`/api/org/pos-devices/available${query}`, {
      method: "GET",
    });
    return { ok: res.ok, devices: res.data?.devices || [], error: res.error };
  }
}

