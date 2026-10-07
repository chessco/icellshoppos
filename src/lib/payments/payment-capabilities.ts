/**
 * Pro Buyer POS Payment System - Multi-Tenant Payment Capabilities
 *
 * Implements configurable payment capabilities per tenant and site.
 * Guarantees that Stripe is completely OPTIONAL.
 *
 * Scenarios:
 * - Distributor without Stripe: cashEnabled=true, transferEnabled=true, stripeReaderEnabled=false.
 *   App boots and operates normally without requesting connection tokens or scanning for readers.
 * - Distributor with Stripe: stripeReaderEnabled=true.
 *   App activates card reader selection and Stripe Terminal workflow.
 */

export interface PaymentCapabilitiesConfig {
  cashEnabled: boolean;
  transferEnabled: boolean;
  stripeReaderEnabled: boolean;
  tapToPayIPhoneEnabled: boolean;
  creditEnabled: boolean;
  otherEnabled: boolean;
  defaultMethod: "Cash" | "Transfer" | "Card" | "Credit" | "Other";
  stripeLocationId?: string | null;
  currency: string;
}

export const DEFAULT_PAYMENT_CAPABILITIES: PaymentCapabilitiesConfig = {
  cashEnabled: true,
  transferEnabled: true,
  stripeReaderEnabled: false, // Default FALSE: Stripe is optional and opt-in
  tapToPayIPhoneEnabled: false, // Default FALSE: reserved for PAYMENT-04
  creditEnabled: true,
  otherEnabled: true,
  defaultMethod: "Cash",
  currency: "MXN",
};

/**
 * Normalizes raw capability JSON (from Organization or Site) with safe defaults
 */
export function normalizePaymentCapabilities(
  orgJson: unknown,
  siteJson?: unknown
): PaymentCapabilitiesConfig {
  const parseConfig = (json: unknown): Partial<PaymentCapabilitiesConfig> => {
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      return {};
    }
    const rec = json as Record<string, unknown>;
    const partial: Partial<PaymentCapabilitiesConfig> = {};

    if (typeof rec.cashEnabled === "boolean") partial.cashEnabled = rec.cashEnabled;
    if (typeof rec.transferEnabled === "boolean") partial.transferEnabled = rec.transferEnabled;
    if (typeof rec.stripeReaderEnabled === "boolean") partial.stripeReaderEnabled = rec.stripeReaderEnabled;
    if (typeof rec.tapToPayIPhoneEnabled === "boolean") partial.tapToPayIPhoneEnabled = rec.tapToPayIPhoneEnabled;
    if (typeof rec.stripeTapToPayEnabled === "boolean") partial.tapToPayIPhoneEnabled = rec.stripeTapToPayEnabled;
    if (typeof rec.creditEnabled === "boolean") partial.creditEnabled = rec.creditEnabled;
    if (typeof rec.otherEnabled === "boolean") partial.otherEnabled = rec.otherEnabled;
    if (
      rec.defaultMethod === "Cash" ||
      rec.defaultMethod === "Transfer" ||
      rec.defaultMethod === "Card" ||
      rec.defaultMethod === "Credit" ||
      rec.defaultMethod === "Other"
    ) {
      partial.defaultMethod = rec.defaultMethod;
    }
    if (typeof rec.stripeLocationId === "string" || rec.stripeLocationId === null) {
      partial.stripeLocationId = rec.stripeLocationId ? String(rec.stripeLocationId).trim() : null;
    }
    if (typeof rec.currency === "string") {
      partial.currency = rec.currency.trim().toUpperCase();
    }
    return partial;
  };

  const orgConfig = parseConfig(orgJson);
  const siteConfig = siteJson ? parseConfig(siteJson) : {};

  // Site configuration overrides organization defaults
  return {
    ...DEFAULT_PAYMENT_CAPABILITIES,
    ...orgConfig,
    ...siteConfig,
  };
}

/**
 * Resolves authoritative PaymentCapabilitiesConfig for an organization and optional site from DB
 */
export async function resolvePaymentCapabilities(
  dbClient: any,
  organizationId: string,
  siteId?: string
): Promise<PaymentCapabilitiesConfig> {
  if (!organizationId) {
    return DEFAULT_PAYMENT_CAPABILITIES;
  }

  const org = await dbClient.organization.findUnique({
    where: { id: organizationId },
    select: { paymentCapabilitiesJson: true },
  });

  let siteJson: unknown = null;
  let siteLocationId: string | null = null;

  if (siteId) {
    const site = await dbClient.site.findFirst({
      where: { id: siteId, organizationId },
      select: { paymentCapabilitiesJson: true, stripeLocationId: true },
    });
    if (site) {
      siteJson = site.paymentCapabilitiesJson;
      siteLocationId = site.stripeLocationId;
    }
  }

  // Check if organization has Stripe configured in SystemSetting
  const stripeKeySetting = await dbClient.systemSetting.findUnique({
    where: { key: `integration:${organizationId}:stripe_secret_key` },
  }).catch(() => null);

  const stripeLocSetting = await dbClient.systemSetting.findUnique({
    where: { key: `integration:${organizationId}:stripe_location_id` },
  }).catch(() => null);

  const hasStripeConfigured = Boolean(
    (stripeKeySetting?.value && stripeKeySetting.value.startsWith("sk_")) ||
    (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith("sk_"))
  );

  const capabilities = normalizePaymentCapabilities(org?.paymentCapabilitiesJson, siteJson);

  // If Stripe is configured in settings and not explicitly disabled in org capabilities, enable it by default
  if (hasStripeConfigured && org?.paymentCapabilitiesJson == null) {
    capabilities.stripeReaderEnabled = true;
    capabilities.tapToPayIPhoneEnabled = true;
  }

  if (stripeLocSetting?.value && !capabilities.stripeLocationId) {
    capabilities.stripeLocationId = stripeLocSetting.value.trim();
  }

  if (siteLocationId && !capabilities.stripeLocationId) {
    capabilities.stripeLocationId = siteLocationId;
  }

  return capabilities;
}
