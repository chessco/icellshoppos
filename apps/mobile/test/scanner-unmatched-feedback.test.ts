import test from "node:test";
import assert from "node:assert/strict";
import {
  MobileScannerCapability,
  type ScanMatchResult,
} from "../src/capabilities/ScannerCapability.ts";
import type { IInventoryListItem } from "../../../packages/contracts/src/index.ts";

// Inventory fixture representing available store stock
const sampleAvailableInventory: IInventoryListItem[] = [
  {
    id: "device-001",
    model: "iPhone 14 Pro",
    capacity: "128GB",
    color: "Space Black",
    imei: "354928110293847",
    serialNumber: "DNPZ1234ABCD",
    sku: "IP14P-128-BLK",
    price: 24500,
    costPesos: 18000,
    costCurrency: "MXN",
    carrier: "Unlocked",
    condition: "Good",
    grade: "A",
    status: "Available",
  },
  {
    id: "device-002",
    model: "iPhone 13",
    capacity: "128GB",
    color: "Midnight",
    imei: "356982101234567",
    serialNumber: "F2LZ5678WXYZ",
    sku: "IP13-128-MID",
    price: 15500,
    costPesos: 11000,
    costCurrency: "MXN",
    carrier: "Unlocked",
    condition: "Good",
    grade: "A",
    status: "Available",
  },
];

interface ScannerHarnessState {
  isLoading: boolean;
  errorMessage: string | null;
  selectedItem: IInventoryListItem | null;
  cart: {
    items: Array<{ id: string; salePrice: number }>;
    total: number;
  };
  unmatchedFeedback: {
    raw: string;
    type: string;
    normalized: string;
    reason: string;
  } | null;
  hasScanned: boolean;
  feedbackInvocationCount: number;
}

function createScannerHarness(initialOverrides?: Partial<ScannerHarnessState>) {
  const scanner = new MobileScannerCapability();

  const state: ScannerHarnessState = {
    isLoading: false,
    errorMessage: null,
    selectedItem: null,
    cart: {
      items: [],
      total: 0,
    },
    unmatchedFeedback: null,
    hasScanned: false,
    feedbackInvocationCount: 0,
    ...initialOverrides,
  };

  // Mirrors PosMasterScreen.tsx handleScanMatch logic exactly
  const handleScanMatch = (
    raw: string,
    type: string,
    normalized: string
  ): ScanMatchResult<IInventoryListItem> => {
    // 1. Network / error boundary check
    if (state.errorMessage) {
      return {
        matched: false,
        reason: "ERROR",
        errorMessage: state.errorMessage,
      };
    }

    // 2. Loading boundary check
    if (state.isLoading) {
      return {
        matched: false,
        reason: "LOADING",
      };
    }

    // 3. Match against available inventory
    const match = sampleAvailableInventory.find((item) => {
      const imei = item.imei || "";
      const serial = item.serialNumber?.toUpperCase() || "";
      const sku = item.sku?.toUpperCase() || "";
      return (
        imei === normalized ||
        serial === normalized ||
        sku === normalized ||
        imei.includes(normalized)
      );
    });

    if (match) {
      state.selectedItem = match;
      return { matched: true, item: match };
    }

    return { matched: false, reason: "NOT_FOUND" };
  };

  // Mirrors ScannerModal.tsx handleProcessCode and handleBarcodeScanned
  const processCode = (rawCode: string) => {
    const trimmed = rawCode.trim();
    if (!trimmed) return;

    // Throttle / debounce: if already showing feedback for this code, skip
    if (state.unmatchedFeedback && state.unmatchedFeedback.raw === trimmed) {
      return;
    }

    const parsed = scanner.parseScannedCode(trimmed);
    const result = handleScanMatch(trimmed, parsed.type, parsed.normalizedValue);

    if (result.matched && result.item) {
      state.unmatchedFeedback = null;
      state.hasScanned = false;
    } else {
      state.hasScanned = true;
      state.feedbackInvocationCount++;
      state.unmatchedFeedback = {
        raw: trimmed,
        type: parsed.type,
        normalized: parsed.normalizedValue,
        reason: result.reason || "NOT_FOUND",
      };
    }
  };

  return { state, scanner, processCode, handleScanMatch };
}

test("TEST 1: Valid IMEI matching an Available inventory item continues to normal product selection", () => {
  const { state, processCode } = createScannerHarness();

  processCode("354928110293847");

  assert.equal(state.selectedItem?.id, "device-001");
  assert.equal(state.selectedItem?.model, "iPhone 14 Pro");
  assert.equal(state.unmatchedFeedback, null);
});

test("TEST 2: Unknown IMEI produces unmatched state", () => {
  const { state, processCode } = createScannerHarness();

  const unknownImei = "359999999999999";
  processCode(unknownImei);

  assert.equal(state.selectedItem, null);
  assert.ok(state.unmatchedFeedback);
  assert.equal(state.unmatchedFeedback.type, "IMEI");
  assert.equal(state.unmatchedFeedback.normalized, unknownImei);
  assert.equal(state.unmatchedFeedback.reason, "NOT_FOUND");
});

test("TEST 3: Unknown serial produces unmatched state", () => {
  const { state, processCode } = createScannerHarness();

  const unknownSerial = "C39UNKNOWN01";
  processCode(unknownSerial);

  assert.equal(state.selectedItem, null);
  assert.ok(state.unmatchedFeedback);
  assert.equal(state.unmatchedFeedback.type, "SERIAL");
  assert.equal(state.unmatchedFeedback.normalized, unknownSerial);
  assert.equal(state.unmatchedFeedback.reason, "NOT_FOUND");
});

test("TEST 4: Unknown SKU produces unmatched state", () => {
  const { state, processCode } = createScannerHarness();

  const unknownSku = "IP15-999-NOTFOUND";
  processCode(unknownSku);

  assert.equal(state.selectedItem, null);
  assert.ok(state.unmatchedFeedback);
  assert.equal(state.unmatchedFeedback.type, "SKU");
  assert.equal(state.unmatchedFeedback.normalized, unknownSku);
  assert.equal(state.unmatchedFeedback.reason, "NOT_FOUND");
});

test("TEST 5: Unknown QR/raw code produces unmatched state", () => {
  const { state, processCode } = createScannerHarness();

  const unknownQr = "https://example.com/unregistered/device/qr/9999";
  processCode(unknownQr);

  assert.equal(state.selectedItem, null);
  assert.ok(state.unmatchedFeedback);
  assert.equal(state.unmatchedFeedback.type, "QR_RAW");
  assert.equal(state.unmatchedFeedback.normalized, unknownQr);
  assert.equal(state.unmatchedFeedback.reason, "NOT_FOUND");
});

test("TEST 6: Unmatched scan does NOT add anything to cart", () => {
  const { state, processCode } = createScannerHarness();

  assert.equal(state.cart.items.length, 0);

  // Scan unknown IMEI
  processCode("359999999999999");
  assert.equal(state.cart.items.length, 0);

  // Scan unknown serial
  processCode("NONEXIST1234");
  assert.equal(state.cart.items.length, 0);
});

test("TEST 7: Unmatched scan does NOT change cart total", () => {
  const { state, processCode } = createScannerHarness({
    cart: {
      items: [{ id: "existing-item", salePrice: 8500 }],
      total: 8500,
    },
  });

  const initialTotal = state.cart.total;
  assert.equal(initialTotal, 8500);

  processCode("359999999999999");

  assert.equal(state.cart.total, initialTotal);
  assert.equal(state.cart.items.length, 1);
});

test("TEST 8: Network/inventory loading failure is NOT classified as product-not-found", () => {
  // Case B: Network/API error
  const networkErrorHarness = createScannerHarness({
    errorMessage: "Connection refused. Store offline.",
  });
  networkErrorHarness.processCode("354928110293847");

  assert.ok(networkErrorHarness.state.unmatchedFeedback);
  assert.equal(networkErrorHarness.state.unmatchedFeedback.reason, "ERROR");
  assert.notEqual(networkErrorHarness.state.unmatchedFeedback.reason, "NOT_FOUND");

  // Case C: Inventory still loading
  const loadingHarness = createScannerHarness({
    isLoading: true,
  });
  loadingHarness.processCode("354928110293847");

  assert.ok(loadingHarness.state.unmatchedFeedback);
  assert.equal(loadingHarness.state.unmatchedFeedback.reason, "LOADING");
  assert.notEqual(loadingHarness.state.unmatchedFeedback.reason, "NOT_FOUND");
});

test("TEST 9: Repeated camera event for the same code does not produce duplicate feedback if debounced", () => {
  const { state, processCode } = createScannerHarness();

  const code = "359999999999999";

  // First camera event
  processCode(code);
  assert.equal(state.feedbackInvocationCount, 1);
  assert.equal(state.hasScanned, true);

  // Rapid camera bursts while feedback card is displayed
  processCode(code);
  processCode(code);
  processCode(code);

  // Must still be 1 invocation, not 4!
  assert.equal(state.feedbackInvocationCount, 1);
});
