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
}
