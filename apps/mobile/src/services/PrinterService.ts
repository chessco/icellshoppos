/**
 * iReader Multiplatform Architecture v2.0 - Printer Service Abstraction
 *
 * Prepares the architecture for thermal and document printing:
 *  - iPadOS: AirPrint / vendor SDK
 *  - macOS: System Printing
 *  - Windows: POS raw / ESC/POS
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
    // AirPrint is available on iPadOS devices with printer network access
    return true;
  }

  async printReceipt(receipt: PrintReceiptPayload): Promise<{ ok: boolean; error?: string }> {
    // AirPrint stub: In full release calls expo-print or thermal SDK
    if (!receipt.saleId) {
      return { ok: false, error: "Invalid receipt data" };
    }
    return { ok: true };
  }
}
