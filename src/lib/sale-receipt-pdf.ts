import { PDFDocument, StandardFonts } from "pdf-lib";
import { DEFAULT_RECEIPT_CONFIG, normalizeReceiptConfig, type ReceiptConfig } from "@/lib/receipt-config";
import { parseReceiptPaymentLines } from "@/lib/receipt-payment";

type SaleReceiptPdfItem = {
  imei: string;
  model: string;
  capacity: string;
  color: string;
  salePrice: number;
  status?: string; // Add status for strikethrough
};

type SaleReceiptPdfData = {
  companyName: string;
  saleId: string;
  soldAt: Date;
  customerName: string;
  customerWhatsapp: string;
  customerEmail?: string;
  paymentMethod: string;
  soldBy: string;
  notes: string;
  logoDataUrl?: string | null;
  receiptConfig?: ReceiptConfig;
  items: SaleReceiptPdfItem[];
  total: number;
  correctionMode?: boolean;
  cancelledImeis?: string[];
};

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(value));

const truncate = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
};

export async function buildSaleReceiptPdf(data: SaleReceiptPdfData) {
  const document = await PDFDocument.create();
  let page = document.addPage([612, 792]);
  const config = normalizeReceiptConfig(data.receiptConfig ?? DEFAULT_RECEIPT_CONFIG);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);

  // For strikethrough
  const drawStrikethroughText = (text: string, x: number, yPosition: number, width: number, options?: { bold?: boolean; size?: number }) => {
    page.drawText(text, {
      x,
      y: yPosition,
      font: options?.bold ? boldFont : font,
      size: options?.size ?? bodySize,
    });
    // Draw strikethrough line
    page.drawLine({
      start: { x, y: yPosition + ((options?.size ?? bodySize) / 2) },
      end: { x: x + width, y: yPosition + ((options?.size ?? bodySize) / 2) },
      thickness: 1,
    });
  };

  const margin = 44;
  const lineHeight = 16;
  const titleSize = 20;
  const bodySize = 11;
  const smallSize = 10;

  let y = 760;

  const drawText = (text: string, x: number, yPosition: number, options?: { bold?: boolean; size?: number }) => {
    page.drawText(text, {
      x,
      y: yPosition,
      font: options?.bold ? boldFont : font,
      size: options?.size ?? bodySize,
    });
  };

  const ensureSpace = (requiredHeight: number) => {
    if (y - requiredHeight >= margin) return;
    page = document.addPage([612, 792]);
    y = 760;
  };

  if (config.showLogo && data.logoDataUrl) {
    const match = /^data:([^;]+);base64,(.+)$/u.exec(data.logoDataUrl);
    const mime = (match?.[1] ?? "").toLowerCase();
    const base64 = match?.[2] ?? "";

    if (base64 && (mime === "image/png" || mime === "image/jpeg" || mime === "image/jpg")) {
      try {
        const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
        const image = mime === "image/png" ? await document.embedPng(bytes) : await document.embedJpg(bytes);
        const scaled = image.scale(1);
        const maxWidth = 130;
        const maxHeight = 48;
        const scale = Math.min(maxWidth / scaled.width, maxHeight / scaled.height, 1);
        const width = scaled.width * scale;
        const height = scaled.height * scale;

        page.drawImage(image, {
          x: margin,
          y: y - height,
          width,
          height,
        });

        y -= height + 8;
      } catch {
      }
    }
  }

  drawText("Sale Receipt", margin, y, { bold: true, size: titleSize });
  y -= 24;
  drawText(data.companyName || "Pro Buyer", margin, y, { bold: true, size: 13 });
  y -= 20;

  for (const line of config.topLines) {
    ensureSpace(lineHeight * 2);
    drawText(truncate(line.text, 110), margin, y, { size: smallSize, bold: line.bold });
    y -= lineHeight;
  }

  const metadataRows = [
    ["Sale", data.saleId],
    ["Date", data.soldAt.toLocaleString()],
    ...(config.showCustomerName ? [["Customer", data.customerName || "Walk-in"]] : []),
    ...(config.showCustomerPhone ? [["WhatsApp", data.customerWhatsapp || "-"]] : []),
    ...(config.showCustomerEmail ? [["Email", data.customerEmail || "-"]] : []),
    ...(config.showSeller ? [["Sold by", data.soldBy || "-"]] : []),
  ] as const;

  for (const [label, value] of metadataRows) {
    ensureSpace(lineHeight);
    drawText(`${label}:`, margin, y, { bold: true });
    drawText(String(value), margin + 84, y);
    y -= lineHeight;
  }

  if (data.notes) {
    ensureSpace(lineHeight * 2);
    drawText("Notes:", margin, y, { bold: true });
    y -= lineHeight;
    drawText(truncate(data.notes, 110), margin, y, { size: smallSize });
    y -= lineHeight;
  }

  y -= 8;
  ensureSpace(lineHeight * 2);
  drawText("IMEI", margin, y, { bold: true });
  drawText("Device", margin + 150, y, { bold: true });
  drawText("Price", 520, y, { bold: true });
  y -= lineHeight;

  page.drawLine({
    start: { x: margin, y: y + 6 },
    end: { x: 568, y: y + 6 },
    thickness: 1,
  });

  for (const item of data.items) {
    ensureSpace(lineHeight * 1.4);
    const deviceLabel = truncate(
      [item.model, item.capacity, item.color].filter(Boolean).join(" "),
      38
    );
    const isCancelled = (item.status === "Cancelled") || (data.cancelledImeis && data.cancelledImeis.includes(item.imei));
    // If correctionMode and cancelled, strikethrough and negative price
    if (data.correctionMode && isCancelled) {
      drawStrikethroughText(item.imei || "-", margin, y, 60, { size: smallSize });
      drawStrikethroughText(deviceLabel || "-", margin + 150, y, 120, { size: smallSize });
      drawStrikethroughText(money(-Math.abs(item.salePrice)), 500, y, 50, { size: smallSize });
    } else {
      drawText(item.imei || "-", margin, y, { size: smallSize });
      drawText(deviceLabel || "-", margin + 150, y, { size: smallSize });
      drawText(money(item.salePrice), 500, y, { size: smallSize });
    }
    y -= lineHeight;
  }

  y -= 8;
  ensureSpace(lineHeight * 2);
  page.drawLine({
    start: { x: margin, y: y + 6 },
    end: { x: 568, y: y + 6 },
    thickness: 1,
  });

  drawText("Total:", 450, y - 8, { bold: true, size: 12 });
  drawText(money(data.total), 510, y - 8, { bold: true, size: 12 });

  const paymentLines = parseReceiptPaymentLines(data.paymentMethod);
  if (paymentLines.length > 0) {
    y -= lineHeight * 1.5;
    for (const line of paymentLines) {
      ensureSpace(lineHeight * 1.2);
      const label = line.amountText ? `${line.label}:` : line.label;
      drawText(label, 380, y, { size: smallSize, bold: true });
      if (line.amountText) {
        drawText(line.amountText, 510, y, { size: smallSize });
      }
      y -= lineHeight;
    }
  }

  if (config.bottomLines.length > 0) {
    y -= lineHeight * 2;
    for (const line of config.bottomLines) {
      ensureSpace(lineHeight * 2);
      drawText(truncate(line.text, 120), margin, y, { size: smallSize, bold: line.bold });
      y -= lineHeight;
    }
  }

  return document.save();
}
