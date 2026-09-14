const extractFirstNumber = (value: string): number | null => {
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatBatteryPercentage = (value: string | null | undefined) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";

  const normalized = raw.replace(/,/g, ".");
  const parsed = extractFirstNumber(normalized);
  if (parsed === null) {
    return raw.includes("%") ? raw : `${raw}%`;
  }

  const basePercent = parsed >= 0 && parsed <= 1 ? parsed * 100 : parsed;
  const rounded = Math.round(basePercent * 10) / 10;
  const display = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
  return `${display}%`;
};

export const formatCurrencyDisplay = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return "-";

  const numeric =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[^\d.-]/g, "").trim());

  if (!Number.isFinite(numeric)) return "-";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numeric);
};
