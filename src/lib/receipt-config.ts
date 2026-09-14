export const MAX_RECEIPT_CUSTOM_LINES = 5;

export type ReceiptCustomLine = {
  text: string;
  bold: boolean;
};

export type ReceiptConfig = {
  showLogo: boolean;
  showSeller: boolean;
  showCustomerName: boolean;
  showCustomerPhone: boolean;
  showCustomerEmail: boolean;
  topLines: ReceiptCustomLine[];
  bottomLines: ReceiptCustomLine[];
};

export const DEFAULT_RECEIPT_CONFIG: ReceiptConfig = {
  showLogo: true,
  showSeller: true,
  showCustomerName: true,
  showCustomerPhone: true,
  showCustomerEmail: false,
  topLines: [],
  bottomLines: [],
};

const toTrimmedString = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized) return "";
  return normalized.slice(0, maxLength);
};

const normalizeLine = (value: unknown, maxLength: number): ReceiptCustomLine | null => {
  if (!value || typeof value !== "object") return null;

  const source = value as Partial<ReceiptCustomLine>;
  const text = toTrimmedString(source.text, maxLength);
  if (!text) return null;

  return {
    text,
    bold: Boolean(source.bold),
  };
};

const normalizeLines = (value: unknown, maxLength: number) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeLine(item, maxLength))
    .filter((item): item is ReceiptCustomLine => Boolean(item))
    .slice(0, MAX_RECEIPT_CUSTOM_LINES);
};

export function normalizeReceiptConfig(value: unknown): ReceiptConfig {
  const source = (value && typeof value === "object" ? value : {}) as Partial<ReceiptConfig> & {
    headerText?: unknown;
    footerText?: unknown;
  };

  const topLines = normalizeLines(source.topLines, 90);
  const bottomLines = normalizeLines(source.bottomLines, 110);
  const legacyHeaderText = toTrimmedString(source.headerText, 90);
  const legacyFooterText = toTrimmedString(source.footerText, 110);

  return {
    showLogo: typeof source.showLogo === "boolean" ? source.showLogo : DEFAULT_RECEIPT_CONFIG.showLogo,
    showSeller:
      typeof source.showSeller === "boolean"
        ? source.showSeller
        : DEFAULT_RECEIPT_CONFIG.showSeller,
    showCustomerName:
      typeof source.showCustomerName === "boolean"
        ? source.showCustomerName
        : DEFAULT_RECEIPT_CONFIG.showCustomerName,
    showCustomerPhone:
      typeof source.showCustomerPhone === "boolean"
        ? source.showCustomerPhone
        : DEFAULT_RECEIPT_CONFIG.showCustomerPhone,
    showCustomerEmail:
      typeof source.showCustomerEmail === "boolean"
        ? source.showCustomerEmail
        : DEFAULT_RECEIPT_CONFIG.showCustomerEmail,
    topLines: topLines.length > 0 ? topLines : legacyHeaderText ? [{ text: legacyHeaderText, bold: false }] : [],
    bottomLines:
      bottomLines.length > 0 ? bottomLines : legacyFooterText ? [{ text: legacyFooterText, bold: false }] : [],
  };
}
