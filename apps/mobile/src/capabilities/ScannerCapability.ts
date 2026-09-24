/**
 * iReader Multiplatform Architecture v2.0 - Scanner Port & Capability
 *
 * Provides a platform-independent abstraction for QR and Barcode scanning.
 * States: SUPPORTED | UNAVAILABLE | REQUIRES_PERMISSION | FUTURE
 */

export type ScannerStatus = "SUPPORTED" | "UNAVAILABLE" | "REQUIRES_PERMISSION" | "FUTURE";

export interface ScanResult {
  data: string;
  format: "QR" | "CODE_128" | "EAN_13" | "UNKNOWN";
}

export interface IScannerCapability {
  getStatus(): Promise<ScannerStatus>;
  requestPermission(): Promise<boolean>;
}

export interface ParsedScanCode {
  type: "IMEI" | "SERIAL" | "SKU" | "QR_RAW";
  normalizedValue: string;
}

export type ScanMatchFailureReason = "NOT_FOUND" | "LOADING" | "ERROR";

export interface ScanMatchResult<T = unknown> {
  matched: boolean;
  item?: T;
  reason?: ScanMatchFailureReason;
  errorMessage?: string;
}

export class MobileScannerCapability implements IScannerCapability {
  async getStatus(): Promise<ScannerStatus> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const cameraModule = require("expo-camera");
      const fn = cameraModule.getCameraPermissionsAsync || cameraModule.Camera?.getCameraPermissionsAsync;
      if (!fn) return "UNAVAILABLE";
      const { status } = await fn();
      return status === "granted" ? "SUPPORTED" : "REQUIRES_PERMISSION";
    } catch {
      return "UNAVAILABLE";
    }
  }

  async requestPermission(): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const cameraModule = require("expo-camera");
      const fn = cameraModule.requestCameraPermissionsAsync || cameraModule.Camera?.requestCameraPermissionsAsync;
      if (!fn) return false;
      const { status } = await fn();
      return status === "granted";
    } catch {
      return false;
    }
  }

  parseScannedCode(raw: string): ParsedScanCode {
    const trimmed = String(raw ?? "").trim();
    const digitsOnly = trimmed.replace(/\D/g, "");

    // 15-digit numeric string is an IMEI
    if (digitsOnly.length === 15 && digitsOnly === trimmed.replace(/\s+/g, "")) {
      return { type: "IMEI", normalizedValue: digitsOnly };
    }

    // Standard 10 to 12 alphanumeric string is an Apple Serial
    if (/^[A-Z0-9]{10,12}$/i.test(trimmed)) {
      return { type: "SERIAL", normalizedValue: trimmed.toUpperCase() };
    }

    // SKU pattern (e.g. IP13-128-BLK)
    if (/^[A-Z0-9_-]{3,20}$/i.test(trimmed)) {
      return { type: "SKU", normalizedValue: trimmed.toUpperCase() };
    }

    return { type: "QR_RAW", normalizedValue: trimmed };
  }

  /**
   * Parses unstructured OCR text from labels, boxes, and product tags.
   * Differentiates contextually between:
   * - IMEI (15 digits)
   * - Serial Number (with contextual prefix or strict format)
   * - SKU / Part Number (e.g. A2305, MU7T2AM/A, SKU:...)
   * - Product title and descriptive specs (e.g. "Apple 20W USB-C Power Adapter")
   */
  parseOcrText(raw: string): ParsedOcrResult {
    const rawLines = String(raw ?? "")
      .split(/[\r\n]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const fullText = rawLines.join(" ");

    // 1. Check for IMEI in lines or tokens (15 digits, optionally with IMEI prefix)
    for (const line of rawLines) {
      const imeiPrefixMatch = line.match(/\b(?:IMEI|MEID)[:\s#]*([0-9]{15})\b/i);
      if (imeiPrefixMatch) {
        return {
          isIdentifier: true,
          identifierType: "IMEI",
          identifierValue: imeiPrefixMatch[1],
          cleanText: fullText,
          rawLines,
        };
      }

      // Check pure 15 digits line
      const cleanDigits = line.replace(/[\s-]/g, "");
      if (/^[0-9]{15}$/.test(cleanDigits)) {
        return {
          isIdentifier: true,
          identifierType: "IMEI",
          identifierValue: cleanDigits,
          cleanText: fullText,
          rawLines,
        };
      }
    }

    // 2. Check for Serial Number with contextual labels: "Serial", "S/N", "SN", "Serial No"
    for (const line of rawLines) {
      const serialPrefixMatch = line.match(
        /\b(?:Serial(?:\s*(?:No|Number))?|S\/N|SN)[:\s#]+([A-Z0-9]{8,14})\b/i
      );
      if (serialPrefixMatch) {
        return {
          isIdentifier: true,
          identifierType: "SERIAL",
          identifierValue: serialPrefixMatch[1].toUpperCase(),
          cleanText: fullText,
          rawLines,
        };
      }
    }

    // 3. Check for SKU or Part Number prefix: "SKU:...", "Part No:...", "P/N:...", "Model: A..."
    let extractedPartNumber: string | undefined = undefined;
    for (const line of rawLines) {
      const skuPrefixMatch = line.match(/\b(?:SKU|P\/N|Part\s*(?:No|Number)?|Item)[:\s#]+([A-Z0-9_-]{4,20})\b/i);
      if (skuPrefixMatch) {
        return {
          isIdentifier: true,
          identifierType: "SKU",
          identifierValue: skuPrefixMatch[1].toUpperCase(),
          cleanText: fullText,
          rawLines,
        };
      }

      const modelCodeMatch = line.match(/\b(?:Model|Mod|Modelo)[:\s#]+(A[0-9]{4}|[A-Z0-9/-]{5,12})\b/i);
      if (modelCodeMatch) {
        extractedPartNumber = modelCodeMatch[1].toUpperCase();
      }
    }

    // 4. Extract Brand (Apple, Samsung, Anker, Belkin, etc.)
    let extractedBrand: string | undefined = undefined;
    const knownBrands = ["Apple", "Samsung", "Anker", "Belkin", "OtterBox", "Logitech", "Google", "Huawei", "Xiaomi", "Motorola"];
    for (const brand of knownBrands) {
      if (new RegExp(`\\b${brand}\\b`, "i").test(fullText)) {
        extractedBrand = brand;
        break;
      }
    }

    // 5. Clean descriptive text: filter out noise words, barcodes, barcodes artifacts
    const noiseWords = new Set(["unlocked", "original", "gen", "designed", "by", "in", "california", "assembled", "china"]);
    const meaningfulLines = rawLines.filter((line) => {
      const lower = line.toLowerCase();
      if (/^[0-9%]+$/.test(line)) return false; // battery percentage or single numbers like 98%, 259
      if (noiseWords.has(lower)) return false;
      return true;
    });

    const cleanModel = meaningfulLines.slice(0, 3).join(" ").trim();

    return {
      isIdentifier: false,
      brand: extractedBrand,
      model: cleanModel || fullText,
      partNumber: extractedPartNumber,
      cleanText: fullText,
      rawLines,
    };
  }
}

export interface ParsedOcrResult {
  isIdentifier: boolean;
  identifierType?: "IMEI" | "SERIAL" | "SKU";
  identifierValue?: string;
  brand?: string;
  model?: string;
  partNumber?: string;
  cleanText: string;
  rawLines: string[];
}
