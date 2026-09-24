import test from "node:test";
import assert from "node:assert/strict";
import { MobileScannerCapability } from "../src/capabilities/ScannerCapability.ts";
import { MobileSecureStorageAdapter } from "../src/storage/MobileSecureStorageAdapter.ts";

test("MobileScannerCapability correctly categorizes scanned IMEI, Serial, SKU, and QR", () => {
  const scanner = new MobileScannerCapability();

  // 15 digits IMEI
  const imeiResult = scanner.parseScannedCode(" 356982101234567 ");
  assert.equal(imeiResult.type, "IMEI");
  assert.equal(imeiResult.normalizedValue, "356982101234567");

  // 15 digits IMEI with dashes/spaces
  const formattedImei = scanner.parseScannedCode("356982 10 1234567");
  assert.equal(formattedImei.type, "IMEI");
  assert.equal(formattedImei.normalizedValue, "356982101234567");

  // Apple Serial Number (12 chars uppercase alphanumeric)
  const serialResult = scanner.parseScannedCode("c39z1234abcd");
  assert.equal(serialResult.type, "SERIAL");
  assert.equal(serialResult.normalizedValue, "C39Z1234ABCD");

  // SKU code
  const skuResult = scanner.parseScannedCode("IP13-128-BLK");
  assert.equal(skuResult.type, "SKU");
  assert.equal(skuResult.normalizedValue, "IP13-128-BLK");

  // Complex QR payload
  const qrResult = scanner.parseScannedCode('{"model":"iPhone 13","imei":"356982101234567"}');
  assert.equal(qrResult.type, "QR_RAW");
});

test("MobileSecureStorageAdapter securely stores, retrieves, and removes session tokens", async () => {
  const storage = new MobileSecureStorageAdapter();

  // Test set and get
  await storage.setItem("auth_token", "jwt-secure-test-token");
  const stored = await storage.getItem("auth_token");
  assert.equal(stored, "jwt-secure-test-token");

  // Test IAuthStoragePort alias compliance
  const cookie = await storage.getSessionCookie();
  assert.equal(cookie, "jwt-secure-test-token");

  // Test removal
  await storage.removeItem("auth_token");
  const deleted = await storage.getItem("auth_token");
  assert.equal(deleted, null);
});

test("MobileScannerCapability.parseOcrText correctly handles accessory labels without barcodes", () => {
  const scanner = new MobileScannerCapability();

  // Pure accessory label: "Apple 20W USB-C Power Adapter"
  const accessoryLabel = `
    Apple
    20W USB-C Power Adapter
    USB-C
    Power Adapter
  `;

  const result = scanner.parseOcrText(accessoryLabel);
  assert.equal(result.isIdentifier, false);
  assert.equal(result.brand, "Apple");
  assert.ok(result.model?.includes("20W USB-C Power Adapter"));
});

test("MobileScannerCapability.parseOcrText differentiates contextually between identifiers and descriptive text", () => {
  const scanner = new MobileScannerCapability();

  // Label with explicit IMEI printed
  const labelWithImei = `
    iPhone 16 Pro Max White Titanium 512GB
    98%
    259
    Unlocked
    IMEI: 355008281719272
  `;
  const imeiResult = scanner.parseOcrText(labelWithImei);
  assert.equal(imeiResult.isIdentifier, true);
  assert.equal(imeiResult.identifierType, "IMEI");
  assert.equal(imeiResult.identifierValue, "355008281719272");

  // Label with explicit Serial Number
  const labelWithSerial = `
    iPad Pro 11-inch M4 Space Black 256GB
    Serial No: C39Z1234ABCD
  `;
  const serialResult = scanner.parseOcrText(labelWithSerial);
  assert.equal(serialResult.isIdentifier, true);
  assert.equal(serialResult.identifierType, "SERIAL");
  assert.equal(serialResult.identifierValue, "C39Z1234ABCD");

  // Descriptive text should NOT classify words like "TITANIUM" or "UNLOCKED" as serial
  const descriptiveLabel = `
    Apple Watch Ultra 2 Titanium Case
    Unlocked
    Original
  `;
  const descResult = scanner.parseOcrText(descriptiveLabel);
  assert.equal(descResult.isIdentifier, false);
  assert.equal(descResult.brand, "Apple");
});
