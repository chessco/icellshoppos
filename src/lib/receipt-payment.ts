const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(value));

const parseAmount = (value: string) => {
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const isTradeInLabel = (label: string) => /trade\s*-?\s*in/i.test(label);

export type ReceiptPaymentLine = {
  label: string;
  amount: number | null;
  amountText: string;
};

export function parseReceiptPaymentLines(paymentMethod?: string): ReceiptPaymentLine[] {
  const normalized = String(paymentMethod ?? "").trim();
  if (!normalized) return [];

  return normalized
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf(":");
      if (separatorIndex === -1) {
        return {
          label: part,
          amount: null,
          amountText: "",
        } satisfies ReceiptPaymentLine;
      }

      const rawLabel = part.slice(0, separatorIndex).trim();
      const rawAmount = part.slice(separatorIndex + 1).trim();
      const parsedAmount = parseAmount(rawAmount);

      if (parsedAmount === null) {
        return {
          label: isTradeInLabel(rawLabel) ? "Trade in value" : rawLabel,
          amount: null,
          amountText: rawAmount,
        } satisfies ReceiptPaymentLine;
      }

      if (isTradeInLabel(rawLabel)) {
        const amount = -Math.abs(parsedAmount);
        return {
          label: "Trade in value",
          amount,
          amountText: money(amount),
        } satisfies ReceiptPaymentLine;
      }

      return {
        label: rawLabel,
        amount: parsedAmount,
        amountText: money(parsedAmount),
      } satisfies ReceiptPaymentLine;
    });
}
