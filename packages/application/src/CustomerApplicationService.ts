import type { ProBuyerApiClient } from "@ireader/api-client";
import type { ICustomerListItem, CustomerCreatePayload } from "@ireader/contracts";

/**
 * Normalizes a WhatsApp phone number for iReader POS.
 * Authoritative destination formats:
 *   Mexico:        +52XXXXXXXXXX (10 local digits)
 *   United States: +1XXXXXXXXXX  (10 local digits)
 *
 * Defaults 10-digit un-prefixed input to Mexico (+52).
 * Rejects unsupported international codes without guessing.
 */
export function normalizeWhatsappPhone(raw: string): { valid: boolean; normalized: string; error?: string } {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return { valid: false, normalized: "", error: "Phone number is required." };
  }

  const hasLeadingPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");

  // Handle legacy Mexican mobile prefix (+52 1 XXXXXXXXXX -> 13 digits starting with 521)
  if (digits.length === 13 && digits.startsWith("521")) {
    digits = "52" + digits.slice(3);
  }

  // If explicit leading plus was supplied
  if (hasLeadingPlus) {
    if (digits.startsWith("52") && digits.length === 12) {
      const normalized = `+52${digits.slice(2)}`;
      return { valid: true, normalized };
    }
    if (digits.startsWith("1") && digits.length === 11) {
      const normalized = `+1${digits.slice(1)}`;
      return { valid: true, normalized };
    }
    // Any other + prefix is either unsupported country or invalid length
    return {
      valid: false,
      normalized: trimmed,
      error: "Ingresa un número de WhatsApp válido de México (+52) o Estados Unidos (+1).",
    };
  }

  // No leading plus:
  // Case A: 10 digits -> Default to Mexico (+52)
  if (digits.length === 10) {
    const normalized = `+52${digits}`;
    return { valid: true, normalized };
  }

  // Case B: 11 digits starting with 1 -> United States (+1)
  if (digits.length === 11 && digits.startsWith("1")) {
    const normalized = `+1${digits.slice(1)}`;
    return { valid: true, normalized };
  }

  // Case C: 12 digits starting with 52 -> Mexico (+52)
  if (digits.length === 12 && digits.startsWith("52")) {
    const normalized = `+52${digits.slice(2)}`;
    return { valid: true, normalized };
  }

  if (digits.length < 10) {
    return {
      valid: false,
      normalized: trimmed,
      error: "El número debe incluir al menos 10 dígitos.",
    };
  }

  return {
    valid: false,
    normalized: trimmed,
    error: "Ingresa un número de WhatsApp válido de México (+52) o Estados Unidos (+1).",
  };
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
