import type { ProBuyerApiClient } from "@ireader/api-client";
import type { ICustomerListItem, CustomerCreatePayload } from "@ireader/contracts";

/**
 * Normalizes a WhatsApp phone number requiring country code and 10-digit number.
 * Example: "+52 55 1234 5678" -> "+525512345678"
 */
export function normalizeWhatsappPhone(raw: string): { valid: boolean; normalized: string; error?: string } {
  const cleaned = String(raw ?? "").trim().replace(/[^\d+]/g, "");
  if (!cleaned) {
    return { valid: false, normalized: "", error: "Phone number is required." };
  }

  // Must have a plus sign or at least 11 digits (e.g. 5215512345678 or +525512345678)
  const digitsOnly = cleaned.replace(/\D/g, "");
  if (digitsOnly.length < 10) {
    return {
      valid: false,
      normalized: cleaned,
      error: "Phone number must include area code and at least 10 digits.",
    };
  }

  const withPlus = cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
  return { valid: true, normalized: withPlus };
}

export class CustomerApplicationService {
  private readonly apiClient: ProBuyerApiClient;

  constructor(apiClient: ProBuyerApiClient) {
    this.apiClient = apiClient;
  }

  async loadCustomers(): Promise<{ ok: boolean; items: ICustomerListItem[]; error?: string }> {
    const res = await this.apiClient.getCustomers();
    return {
      ok: res.ok,
      items: (res.data as ICustomerListItem[]) || [],
      error: res.error,
    };
  }

  async createCustomer(payload: CustomerCreatePayload): Promise<{ ok: boolean; customer?: ICustomerListItem; error?: string }> {
    if (!payload.name?.trim()) {
      return { ok: false, error: "Customer name is required." };
    }

    const phoneCheck = normalizeWhatsappPhone(payload.whatsapp);
    if (!phoneCheck.valid) {
      return { ok: false, error: phoneCheck.error };
    }

    const res = await this.apiClient.addCustomer({
      name: payload.name.trim(),
      email: payload.email?.trim().toLowerCase() || undefined,
      whatsapp: phoneCheck.normalized,
      customerType: payload.customerType || "retail",
    });

    return {
      ok: res.ok,
      customer: res.data as ICustomerListItem,
      error: res.error,
    };
  }

  filterCustomers(customers: ICustomerListItem[], query: string): ICustomerListItem[] {
    const q = String(query ?? "").toLowerCase().trim();
    if (!q) return customers;
    return customers.filter((c) => {
      const name = c.name?.toLowerCase() || "";
      const email = c.email?.toLowerCase() || "";
      const phone = c.whatsapp?.toLowerCase() || "";
      return name.includes(q) || email.includes(q) || phone.includes(q);
    });
  }
}
