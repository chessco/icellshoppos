export const WHATSAPP_COUNTRY_CODES = ["+52", "+1"] as const;
export type WhatsappCountryCode = (typeof WHATSAPP_COUNTRY_CODES)[number];

const WHATSAPP_COUNTRY_CODE_SET = new Set<string>(WHATSAPP_COUNTRY_CODES);
const DEFAULT_WHATSAPP_COUNTRY_CODE: WhatsappCountryCode = "+52";

export function normalizeWhatsappDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 10);
}

export function buildWhatsappNumber(countryCode: string, localNumber: string) {
  const normalizedCountryCode = String(countryCode ?? "").trim();
  if (!WHATSAPP_COUNTRY_CODE_SET.has(normalizedCountryCode)) {
    return null;
  }

  const digits = normalizeWhatsappDigits(String(localNumber ?? ""));
  if (digits.length !== 10) {
    return null;
  }

  return `${normalizedCountryCode}${digits}`;
}

export function parseWhatsappNumber(
  value: string | null | undefined
): { countryCode: WhatsappCountryCode; localNumber: string } {
  const raw = String(value ?? "").trim().replace(/[^\d+]/g, "");
  for (const countryCode of WHATSAPP_COUNTRY_CODES) {
    if (raw.startsWith(countryCode)) {
      const localNumber = normalizeWhatsappDigits(raw.slice(countryCode.length));
      return { countryCode, localNumber };
    }
  }

  return { countryCode: DEFAULT_WHATSAPP_COUNTRY_CODE, localNumber: "" };
}

export function formatWhatsappForDisplay(value: string | null | undefined) {
  const parsed = parseWhatsappNumber(value);
  if (parsed.localNumber.length !== 10) {
    return String(value ?? "").trim();
  }
  return `${parsed.countryCode}${parsed.localNumber}`;
}

export function normalizeWhatsappFromPayload(payload: {
  whatsapp?: unknown;
  whatsappCountryCode?: unknown;
  whatsappNumber?: unknown;
}) {
  const fromParts = buildWhatsappNumber(
    String(payload.whatsappCountryCode ?? ""),
    String(payload.whatsappNumber ?? "")
  );

  if (fromParts) {
    return fromParts;
  }

  const parsed = parseWhatsappNumber(String(payload.whatsapp ?? ""));
  return buildWhatsappNumber(parsed.countryCode, parsed.localNumber);
}