import type { SaleReceiptData } from "@/lib/sales-receipt";
import { parseReceiptPaymentLines } from "@/lib/receipt-payment";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(value));

export function buildReceiptText(receipt: SaleReceiptData) {
  const companyName = receipt.companyName?.trim() || "Your Company";
  const paymentLines = parseReceiptPaymentLines(receipt.paymentMethod);
  const header = [
    `${companyName} - Sale Receipt`,
    `Sale: ${receipt.saleId}`,
    `Date: ${new Date(receipt.soldAt).toLocaleString()}`,
    `Customer: ${receipt.customerName || "Walk-in"}`,
    `WhatsApp: ${receipt.customerWhatsapp || "-"}`,
    `Sold by: ${receipt.soldBy || "-"}`,
    "",
    "Items:",
  ];

  const items = receipt.items.map(
    (item) => `- ${item.imei} | ${[item.model, item.capacity, item.color].filter(Boolean).join(" ")} | ${money(item.salePrice)}`
  );

  const footer = [
    "",
    `Total: ${money(receipt.total)}`,
    ...paymentLines.map((line) => (line.amountText ? `${line.label}: ${line.amountText}` : line.label)),
    receipt.notes ? `Notes: ${receipt.notes}` : "",
    "",
    `Thank you for your purchase with ${companyName}.`,
  ].filter(Boolean);

  return [...header, ...items, ...footer].join("\n");
}

export function buildWhatsAppWebShareUrl(whatsapp: string, message: string) {
  const phone = whatsapp.replace(/\D/g, "");
  if (!phone) return null;
  return `https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}`;
}