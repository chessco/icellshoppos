/**
 * Crash-proof currency and number formatters for React Native Hermes.
 * Avoids calling Number.prototype.toLocaleString which crashes on some Hermes engines without full Intl.
 */

export function formatCurrency(
  value: number | string | null | undefined,
  currencyPrefix = "$"
): string {
  const num = typeof value === "number" ? value : Number(value);
  if (isNaN(num) || num === null || num === undefined) {
    return `${currencyPrefix}0.00`;
  }
  const parts = Math.abs(num).toFixed(2).split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = num < 0 ? "-" : "";
  return `${sign}${currencyPrefix}${intPart}.${parts[1]}`;
}
