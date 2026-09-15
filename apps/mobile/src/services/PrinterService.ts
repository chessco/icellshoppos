import * as Print from "expo-print";

/**
 * iReader Multiplatform Architecture v2.0 - Printer Service Abstraction
 *
 * Provides receipt printing via AirPrint on iPadOS / iOS.
 */

export interface PrintReceiptPayload {
  saleId: string;
  customerName?: string;
  items?: Array<{
    model: string;
    imei?: string;
    salePrice: number;
  }>;
  totalAmount: number;
  paymentMethod?: string;
  createdAt?: string;
}

export interface IPrinterService {
  isAvailable(): Promise<boolean>;
  printReceipt(receipt: PrintReceiptPayload): Promise<{ ok: boolean; error?: string }>;
}

export class MobilePrinterService implements IPrinterService {
  async isAvailable(): Promise<boolean> {
    return true;
  }

  async printReceipt(receipt: PrintReceiptPayload): Promise<{ ok: boolean; error?: string }> {
    if (!receipt.saleId) {
      return { ok: false, error: "Invalid receipt data" };
    }

    try {
      const itemsHtml = (receipt.items || [])
        .map(
          (i) => `
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <div>
              <div style="font-weight: 600;">${i.model}</div>
              ${i.imei ? `<div style="font-size: 10px; color: #555;">IMEI: ${i.imei}</div>` : ""}
            </div>
            <div style="font-weight: 600;">$${Number(i.salePrice).toFixed(2)}</div>
          </div>
        `
        )
        .join("");

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              padding: 20px;
              color: #111;
              max-width: 380px;
              margin: 0 auto;
            }
            .header { text-align: center; border-bottom: 1px dashed #999; padding-bottom: 12px; margin-bottom: 12px; }
            .title { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; }
            .subtitle { font-size: 11px; color: #666; margin-top: 4px; }
            .meta { font-size: 11px; margin-bottom: 12px; line-height: 1.5; }
            .items { border-bottom: 1px dashed #999; padding-bottom: 12px; margin-bottom: 12px; font-size: 13px; }
            .total-row { display: flex; justify-content: space-between; font-size: 16px; font-weight: 800; margin-top: 8px; }
            .footer { text-align: center; font-size: 11px; color: #777; margin-top: 20px; border-top: 1px dashed #999; padding-top: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">iCELLSHOP / PRO BUYER</div>
            <div class="subtitle">Official Transaction Receipt</div>
          </div>
          <div class="meta">
            <div><strong>Sale Ref:</strong> ${receipt.saleId}</div>
            <div><strong>Date:</strong> ${receipt.createdAt ? new Date(receipt.createdAt).toLocaleString() : new Date().toLocaleString()}</div>
            ${receipt.customerName ? `<div><strong>Customer:</strong> ${receipt.customerName}</div>` : ""}
            ${receipt.paymentMethod ? `<div><strong>Payment Method:</strong> ${receipt.paymentMethod}</div>` : ""}
          </div>
          <div class="items">
            ${itemsHtml || `<div style="text-align: center; color: #777;">Recorded POS Sale</div>`}
          </div>
          <div class="total-row">
            <span>TOTAL PAID</span>
            <span>$${Number(receipt.totalAmount).toFixed(2)}</span>
          </div>
          <div class="footer">
            <div>Thank you for your business!</div>
            <div style="font-size: 9px; margin-top: 4px;">Powered by iReader POS v2.0</div>
          </div>
        </body>
        </html>
      `;

      await Print.printAsync({ html });
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : "Print error" };
    }
  }
}
