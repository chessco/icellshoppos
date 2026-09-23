import React, { useState, useEffect, useMemo } from "react";
import { View, useWindowDimensions, StyleSheet } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import { usePosLayout } from "../contexts/PosLayoutContext";
import { InventoryApplicationService } from "@ireader/application";
import type { IInventoryListItem, BackendSaleCreatedResponse } from "@ireader/contracts";
import type { ScanMatchResult } from "../capabilities/ScannerCapability";
import { IPAD_THEME } from "../theme/tokens";
import { CatalogGrid } from "../components/pos/CatalogGrid";
import { ProductDetailPane } from "../components/pos/ProductDetailPane";
import { CartDrawer } from "../components/pos/CartDrawer";
import { AppleTouchPosView } from "../components/pos/AppleTouchPosView";
import { AppleReceiptTicket } from "../components/pos/AppleReceiptTicket";
import { CustomerSelectModal } from "../components/pos/CustomerSelectModal";
import { ScannerModal } from "../components/pos/ScannerModal";
import { CheckoutSheet } from "../components/checkout/CheckoutSheet";
import { SaleConfirmation } from "../components/checkout/SaleConfirmation";
import type { ConnectivityState } from "../components/ui/ConnectivityBadge";

type POSViewMode = "pos" | "checkout" | "confirmed";

interface PosMasterScreenProps {
  connectivityState: ConnectivityState;
  onRefreshConnectivity: () => void;
  scannerStatus: string;
  onOpenMessages?: () => void;
}

export function PosMasterScreen({
  connectivityState,
  onRefreshConnectivity,
  scannerStatus,
  onOpenMessages,
}: PosMasterScreenProps) {
  const { width } = useWindowDimensions();
  const { apiClient } = useAuth();
  const { items: cartItems, addItem, removeItem } = useCart();
  const { layoutMode } = usePosLayout();

  const [inventory, setInventory] = useState<IInventoryListItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<IInventoryListItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<POSViewMode>("pos");
  const [lastSaleResult, setLastSaleResult] = useState<BackendSaleCreatedResponse | null>(null);

  // Modals state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<"cart" | "detail">("cart");
  const [catalogSearch, setCatalogSearch] = useState("");

  const inventoryService = useMemo(
    () => new InventoryApplicationService(apiClient),
    [apiClient]
  );

  const loadInventoryData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await inventoryService.loadInventory("Available");
      if (res.ok) {
        const availableItems = (res.items || []).filter(
          (item) => (item.status || "Available").toLowerCase() === "available"
        );
        setInventory(availableItems);
        if (availableItems.length > 0 && !selectedItem) {
          setSelectedItem(availableItems[0]);
        }
      } else {
        setErrorMessage(res.error || "Failed to load store inventory");
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Error connecting to store inventory"
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadInventoryData();
  }, []);

  const handleScanMatch = (
    raw: string,
    type: string,
    normalized: string
  ): ScanMatchResult<IInventoryListItem> => {
    // 1. Network / error boundary check
    if (errorMessage) {
      return {
        matched: false,
        reason: "ERROR",
        errorMessage,
      };
    }

    // 2. Loading boundary check
    if (isLoading) {
      return {
        matched: false,
        reason: "LOADING",
      };
    }

    // 3. Find matching item in available inventory by IMEI, Serial, or SKU
    const match = inventory.find((item) => {
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
      setSelectedItem(match);
      setActiveRightTab("detail");
      return { matched: true, item: match };
    }

    return { matched: false, reason: "NOT_FOUND" };
  };

  // Full-Screen Checkout Sheet Mode
  if (viewMode === "checkout") {
    return (
      <CheckoutSheet
        onBackToPos={() => setViewMode("pos")}
        onSaleSuccess={(saleResult) => {
          setLastSaleResult(saleResult);
          setViewMode("confirmed");
          void loadInventoryData();
        }}
      />
    );
  }

  // Sale Confirmed View Mode
  if (viewMode === "confirmed") {
    return (
      <SaleConfirmation
        sale={lastSaleResult}
        onNewSale={() => {
          setLastSaleResult(null);
          setViewMode("pos");
        }}
      />
    );
  }

  // In iPad portrait (width ~768-834px) as well as landscape (width >= 1024px),
  // we maintain full-height dual columns to prevent ticket compression.
  // Stacked mode is only reserved for ultra-compact phone screens (< 600px).
  const isTablet = width >= 600;

  return (
    <View style={styles.container}>
      {layoutMode === "apple_touch" ? (
        /* ─────────────── APPLE TOUCH POS MODE ─────────────── */
        <View style={[styles.layout, !isTablet && styles.layoutStacked]}>
          {/* Left Column: Tactile Product Grid (58%) */}
          <View style={styles.appleCatalogColumn}>
            <AppleTouchPosView
              items={inventory}
              isLoading={isLoading}
              errorMessage={errorMessage}
              onRefresh={loadInventoryData}
              onOpenScanner={() => setIsScannerOpen(true)}
              onOpenMessages={onOpenMessages}
            />
          </View>

          {/* Right Column: Apple Live Receipt Ticket (42%) */}
          <View style={styles.appleTicketColumn}>
            <AppleReceiptTicket
              onProceedCheckout={() => setViewMode("checkout")}
              onOpenCustomerSelect={() => setIsCustomerModalOpen(true)}
              onOpenScanner={() => setIsScannerOpen(true)}
            />
          </View>
        </View>
      ) : (
        /* ─────────────── CLASSIC WEB CATALOG MODE ─────────────── */
        <View style={[styles.layout, !isTablet && styles.layoutStacked]}>
          {/* Left Column: Product Catalog & Search */}
          <View style={styles.catalogColumn}>
            <CatalogGrid
              items={inventory}
              selectedItem={selectedItem}
              onSelectItem={(it) => {
                setSelectedItem(it);
                setActiveRightTab("detail");
              }}
              isLoading={isLoading}
              errorMessage={errorMessage}
              onRefresh={loadInventoryData}
              onOpenScanner={() => setIsScannerOpen(true)}
              searchQuery={catalogSearch}
              onSearchQueryChange={setCatalogSearch}
            />
          </View>

          {/* Right Column: Cart / Product Detail Drawer */}
          <View style={styles.rightColumn}>
            {activeRightTab === "detail" && selectedItem ? (
              <View style={styles.detailWrapper}>
                <ProductDetailPane
                  item={selectedItem}
                  onAddToCart={addItem}
                  onRemoveFromCart={removeItem}
                />
              </View>
            ) : (
              <CartDrawer
                onProceedCheckout={() => setViewMode("checkout")}
                onOpenCustomerSelect={() => setIsCustomerModalOpen(true)}
              />
            )}
          </View>
        </View>
      )}

      {/* Customer Assign Modal */}
      <CustomerSelectModal
        visible={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
      />

      {/* Camera / Barcode Scanner Modal */}
      <ScannerModal
        visible={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanResult={handleScanMatch}
        onSearchManually={(query) => {
          setCatalogSearch(query);
          setIsScannerOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.background,
  },
  layout: {
    flex: 1,
    flexDirection: "row",
  },
  layoutStacked: {
    flexDirection: "column",
  },
  // Classic layout dimensions
  catalogColumn: {
    flex: 58,
    borderRightWidth: 1,
    borderRightColor: IPAD_THEME.colors.borderSubtle,
  },
  rightColumn: {
    flex: 42,
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
  },
  // Apple Touch layout dimensions (58% Catalog, 42% Ticket)
  // Perfectly balanced for iPad Vertical (e.g. ~460px / ~340px at 800px width)
  appleCatalogColumn: {
    flex: 58,
  },
  appleTicketColumn: {
    flex: 42,
  },
  detailWrapper: {
    flex: 1,
  },
});
