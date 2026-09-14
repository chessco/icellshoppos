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

export class MobileScannerCapability implements IScannerCapability {
  async getStatus(): Promise<ScannerStatus> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Camera } = require("expo-camera");
      if (!Camera) return "UNAVAILABLE";
      const { status } = await Camera.getCameraPermissionsAsync();
      return status === "granted" ? "SUPPORTED" : "REQUIRES_PERMISSION";
    } catch {
      return "UNAVAILABLE";
    }
  }

  async requestPermission(): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Camera } = require("expo-camera");
      if (!Camera) return false;
      const { status } = await Camera.requestCameraPermissionsAsync();
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
}
