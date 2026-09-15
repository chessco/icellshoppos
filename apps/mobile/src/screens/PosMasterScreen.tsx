import React, { useState, useEffect, useMemo } from "react";
import { View, useWindowDimensions, StyleSheet } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import { InventoryApplicationService } from "@ireader/application";
import type { IInventoryListItem, BackendSaleCreatedResponse } from "@ireader/contracts";
import { IPAD_THEME } from "../theme/tokens";
import { CatalogGrid } from "../components/pos/CatalogGrid";
import { ProductDetailPane } from "../components/pos/ProductDetailPane";
import { CartDrawer } from "../components/pos/CartDrawer";
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
}

export function PosMasterScreen({
  connectivityState,
  onRefreshConnectivity,
  scannerStatus,
}: PosMasterScreenProps) {
  const { width } = useWindowDimensions();
  const { apiClient } = useAuth();
  const { items: cartItems } = useCart();

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
        setInventory(res.items);
        if (res.items.length > 0 && !selectedItem) {
          setSelectedItem(res.items[0]);
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

  const handleScanMatch = (raw: string, type: string, normalized: string) => {
    // Find matching item in inventory by IMEI, Serial, or SKU
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
    }
  };

  // If in checkout mode
  if (viewMode === "checkout") {
    return (
      <CheckoutSheet
        onSuccess={(sale) => {
          setLastSaleResult(sale);
          setViewMode("confirmed");
          void loadInventoryData();
        }}
        onCancel={() => setViewMode("pos")}
      />
    );
  }

  // If sale confirmed
  if (viewMode === "confirmed" && lastSaleResult) {
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

  const isWide = width >= IPAD_THEME.breakpoints.regular;

  return (
    <View style={styles.container}>
      {/* Split Layout: Left Catalog (58%), Right Cart/Detail (42%) */}
      <View style={[styles.layout, !isWide && styles.layoutStacked]}>
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
          />
        </View>

        {/* Right Column: Cart / Product Detail Drawer */}
        <View style={styles.rightColumn}>
          {activeRightTab === "detail" && selectedItem ? (
            <View style={styles.detailWrapper}>
              <ProductDetailPane item={selectedItem} />
            </View>
          ) : (
            <CartDrawer
              onProceedCheckout={() => setViewMode("checkout")}
              onOpenCustomerSelect={() => setIsCustomerModalOpen(true)}
            />
          )}
        </View>
      </View>

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
  catalogColumn: {
    flex: 1.25,
    borderRightWidth: 1,
    borderRightColor: IPAD_THEME.colors.borderSubtle,
  },
  rightColumn: {
    flex: 1,
    padding: IPAD_THEME.spacing.lg,
  },
  detailWrapper: {
    flex: 1,
  },
});
