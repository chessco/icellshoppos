import { DEFAULT_RECEIPT_CONFIG, normalizeReceiptConfig, type ReceiptConfig } from "@/lib/receipt-config";
import { parseReceiptPaymentLines } from "@/lib/receipt-payment";

export type SaleReceiptItem = {
  imei: string;
  model: string;
  capacity: string;
  color: string;
  salePrice: number;
};

export type SaleReceiptData = {
  companyName?: string;
  saleId: string;
  soldAt: string;
  customerName?: string;
  customerWhatsapp?: string;
  customerEmail?: string;
  paymentMethod?: string;
  soldBy?: string;
  notes?: string;
  logoDataUrl?: string;
  receiptConfig?: ReceiptConfig;
  items: SaleReceiptItem[];
  subtotal?: number;
  discount?: number;
  total: number;
};

export type ReceiptPrintLayout = "thermal80" | "a4";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    Math.round(value)
  );

const renderCustomLines = (lines: ReceiptConfig["topLines"], className: string) =>
  lines
    .map(
      (line) =>
        `<div class="${className}${line.bold ? " custom-line-bold" : ""}">${escapeHtml(line.text)}</div>`
    )
    .join("");

export function buildSaleReceiptDocument(
  receipt: SaleReceiptData,
  options?: { layout?: ReceiptPrintLayout }
) {
  const layout = options?.layout ?? "thermal80";
  const config = normalizeReceiptConfig(receipt.receiptConfig ?? DEFAULT_RECEIPT_CONFIG);
  const isThermal = layout === "thermal80";

  const rows = receipt.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.imei)}</td>
          <td>${escapeHtml([item.model, item.capacity, item.color].filter(Boolean).join(" "))}</td>
          <td style="text-align:right;">${money(item.salePrice)}</td>
        </tr>`
    )
    .join("");

  const paymentLines = parseReceiptPaymentLines(receipt.paymentMethod);

  const metadataRows = [
    `<p><strong>Sale:</strong> ${escapeHtml(receipt.saleId)}</p>`,
    `<p><strong>Date:</strong> ${escapeHtml(new Date(receipt.soldAt).toLocaleString())}</p>`,
    config.showCustomerName ? `<p><strong>Customer:</strong> ${escapeHtml(receipt.customerName || "Walk-in")}</p>` : "",
    config.showCustomerPhone ? `<p><strong>WhatsApp:</strong> ${escapeHtml(receipt.customerWhatsapp || "-")}</p>` : "",
    config.showCustomerEmail ? `<p><strong>Email:</strong> ${escapeHtml(receipt.customerEmail || "-")}</p>` : "",
    config.showSeller ? `<p><strong>Sold by:</strong> ${escapeHtml(receipt.soldBy || "-")}</p>` : "",
  ]
    .filter(Boolean)
    .join("");

  const paymentRows = paymentLines
    .map((line) => {
      if (!line.amountText) {
        return `<div class="payment-line"><span class="payment-label">${escapeHtml(line.label)}</span></div>`;
      }
      return `<div class="payment-line"><span class="payment-label">${escapeHtml(line.label)}:</span><span class="payment-amount">${escapeHtml(line.amountText)}</span></div>`;
    })
    .join("");

  const pageCss = isThermal
    ? `
      @page { size: 80mm auto; margin: 2mm; }
      html, body { width: 80mm; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; color: #111827; font-size: 11px; line-height: 1.25; box-sizing: border-box; padding: 3mm; }
      h1 { margin: 0 0 4px; font-size: 16px; }
      p { margin: 2px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border-bottom: 1px solid #d1d5db; padding: 4px 2px; font-size: 10px; vertical-align: top; }
      th { text-align: left; color: #4b5563; }
      .total { margin-top: 10px; text-align: right; font-size: 13px; font-weight: 700; }
      .payments { margin-top: 4px; margin-left: auto; width: 65%; }
      .payment-line { display: grid; grid-template-columns: 1fr auto; gap: 10px; font-size: 10px; line-height: 1.3; }
      .payment-label { text-align: left; }
      .payment-amount { text-align: right; font-variant-numeric: tabular-nums; }
      .meta { margin-top: 8px; }
      .custom-line { margin: 4px 0; font-size: 10px; white-space: pre-wrap; }
      .custom-line-bold { font-weight: 700; }
      img { max-height: 42px; max-width: 100%; object-fit: contain; }
    `
    : `
      @page { size: auto; margin: 12mm; }
      body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
      h1 { margin: 0 0 8px; font-size: 24px; }
      p { margin: 4px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th, td { border-bottom: 1px solid #d1d5db; padding: 10px 6px; font-size: 14px; }
      th { text-align: left; color: #4b5563; }
      .total { margin-top: 20px; text-align: right; font-size: 18px; font-weight: 700; }
      .payments { margin-top: 8px; margin-left: auto; width: 340px; }
      .payment-line { display: grid; grid-template-columns: 1fr auto; gap: 16px; font-size: 13px; line-height: 1.35; }
      .payment-label { text-align: left; }
      .payment-amount { text-align: right; font-variant-numeric: tabular-nums; }
      .meta { margin-top: 16px; }
      .custom-line { margin: 8px 0; white-space: pre-wrap; }
      .custom-line-bold { font-weight: 700; }
      img { max-height:64px;max-width:220px;object-fit:contain; }
    `;

  return `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt ${escapeHtml(receipt.saleId)}</title>
        <style>
          ${pageCss}

          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }
        </style>
      </head>
      <body>
        <h1>Sale Receipt</h1>
        ${config.showLogo && receipt.logoDataUrl ? `<div style="margin: 0 0 8px;"><img src="${escapeHtml(receipt.logoDataUrl)}" alt="Logo" /></div>` : ""}
        ${renderCustomLines(config.topLines, "custom-line")}
        ${metadataRows}
        <table>
          <thead>
            <tr>
              <th>IMEI</th>
              <th>Device</th>
              <th style="text-align:right;">Price</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${receipt.discount && receipt.discount > 0 ? `
          <div style="margin-top: 10px; text-align: right; font-size: 11px; color: #555;">Subtotal: ${money(receipt.subtotal ?? (receipt.total + receipt.discount))}</div>
          <div style="margin-top: 2px; text-align: right; font-size: 11px; color: #b91c1c; font-weight: 600;">Descuento autorizado: -${money(receipt.discount)}</div>
        ` : ""}
        <div class="total">Total: ${money(receipt.total)}</div>
        ${paymentRows ? `<div class="payments">${paymentRows}</div>` : ""}
        ${receipt.notes ? `<div class="meta"><strong>Notes:</strong> ${escapeHtml(receipt.notes)}</div>` : ""}
        ${renderCustomLines(config.bottomLines, "custom-line")}
      </body>
    </html>`;
}

export function printSaleReceipt(receipt: SaleReceiptData, options?: { layout?: ReceiptPrintLayout }) {
  if (typeof window === "undefined") return;

  const layout = options?.layout ?? "thermal80";
  const isThermal = layout === "thermal80";
  const popupWidth = isThermal ? 340 : 860;
  const popup = window.open("", "_blank", `width=${popupWidth},height=760`);
  if (!popup) {
    throw new Error("Popup blocked. Please allow popups to print receipts.");
  }

  popup.document.write(buildSaleReceiptDocument(receipt, options));
  popup.document.close();
  window.setTimeout(() => {
    popup.focus();
    popup.print();
  }, 120);
}