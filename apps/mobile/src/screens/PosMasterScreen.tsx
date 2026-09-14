import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from "react-native";
import { useAuth } from "../contexts/AuthContext.js";
import { useCart } from "../contexts/CartContext.js";
import { InventoryApplicationService } from "@ireader/application";
import type { IInventoryListItem, BackendSaleCreatedResponse } from "@ireader/contracts";
import { IPAD_THEME } from "../theme/tokens.js";
import { ProductDetail } from "../components/ProductDetail.js";
import { CheckoutView } from "../components/CheckoutView.js";
import { SaleConfirmation } from "../components/SaleConfirmation.js";
import { MobileScannerCapability } from "../capabilities/ScannerCapability.js";

type POSViewMode = "catalog" | "checkout" | "confirmed";

export function PosMasterScreen() {
  const { session, apiClient, logout } = useAuth();
  const { items: cartItems, subtotal, removeItem } = useCart();

  const [inventory, setInventory] = useState<IInventoryListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<IInventoryListItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<POSViewMode>("catalog");
  const [lastSaleResult, setLastSaleResult] = useState<BackendSaleCreatedResponse | null>(null);
  const [scannerStatus, setScannerStatus] = useState<string>("CHECKING");

  const inventoryService = useMemo(
    () => new InventoryApplicationService(apiClient),
    [apiClient]
  );

  const scanner = useMemo(() => new MobileScannerCapability(), []);

  const [connectivityState, setConnectivityState] = useState<"ONLINE" | "LOADING" | "OFFLINE" | "SYNC_ERROR">("LOADING");

  const loadInventoryData = async () => {
    setIsLoading(true);
    setConnectivityState("LOADING");
    setErrorMessage(null);
    try {
      const res = await inventoryService.loadInventory("Available");
      if (res.ok) {
        setInventory(res.items);
        setConnectivityState("ONLINE");
        if (res.items.length > 0 && !selectedItem) {
          setSelectedItem(res.items[0]);
        }
      } else {
        setConnectivityState("SYNC_ERROR");
        setErrorMessage(res.error || "Failed to load inventory");
      }
    } catch (err: unknown) {
      setConnectivityState("OFFLINE");
      setErrorMessage(err instanceof Error ? err.message : "Network error. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadInventoryData();
    void scanner.getStatus().then(setScannerStatus);
  }, [inventoryService, scanner]);

  const filteredInventory = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return inventory;
    return inventory.filter((item) => {
      const model = item.model?.toLowerCase() || "";
      const imei = item.imei || "";
      const serial = item.serialNumber?.toLowerCase() || "";
      const sku = item.sku?.toLowerCase() || "";
      return model.includes(q) || imei.includes(q) || serial.includes(q) || sku.includes(q);
    });
  }, [inventory, searchQuery]);

  // If in checkout mode
  if (viewMode === "checkout") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <CheckoutView
          onSuccess={(sale) => {
            setLastSaleResult(sale);
            setViewMode("confirmed");
            void loadInventoryData();
          }}
          onCancel={() => setViewMode("catalog")}
        />
      </SafeAreaView>
    );
  }

  // If sale confirmed
  if (viewMode === "confirmed" && lastSaleResult) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <SaleConfirmation
          sale={lastSaleResult}
          onNewSale={() => {
            setLastSaleResult(null);
            setViewMode("catalog");
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      {/* iPad Top App Navigation */}
      <View style={styles.topBar}>
        <View style={styles.brandContainer}>
          <Text style={styles.appTitle}>iReader POS</Text>
          <Text style={styles.orgSubtitle}>
            {session?.email} • Store POS
          </Text>
        </View>

        <View style={styles.topBarActions}>
          <View
            style={[
              styles.statusBadge,
              connectivityState === "ONLINE"
                ? styles.statusOnline
                : connectivityState === "OFFLINE"
                ? styles.statusOffline
                : styles.statusSync,
            ]}
          >
            <Text style={styles.statusBadgeText}>● {connectivityState}</Text>
          </View>
          <View style={styles.scannerBadge}>
            <Text style={styles.scannerBadgeText}>Camera: {scannerStatus}</Text>
          </View>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => void logout()}
            accessibilityRole="button"
            accessibilityLabel="Sign Out"
          >
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* iPad 2-Column Split View Layout */}
      <View style={styles.splitLayout}>
        {/* Left Column: Inventory List & Search (55% width on landscape) */}
        <View style={styles.catalogColumn}>
          <View style={styles.searchHeader}>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={(text) => {
                const parsed = scanner.parseScannedCode(text);
                setSearchQuery(parsed.normalizedValue);
              }}
              placeholder="Scan/type model, IMEI, serial, or SKU..."
              placeholderTextColor={IPAD_THEME.colors.textMuted}
              accessibilityLabel="Search Catalog"
              clearButtonMode="while-editing"
            />
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={() => void loadInventoryData()}
              accessibilityRole="button"
              accessibilityLabel="Refresh Catalog"
            >
              <Text style={styles.refreshButtonText}>↻</Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={IPAD_THEME.colors.accent} />
              <Text style={styles.loadingText}>Loading store inventory...</Text>
            </View>
          ) : errorMessage ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => void loadInventoryData()}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filteredInventory}
              keyExtractor={(it) => it.id}
              initialNumToRender={12}
              maxToRenderPerBatch={15}
              windowSize={7}
              removeClippedSubviews={true}
              renderItem={({ item }) => {
                const isSelected = selectedItem?.id === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.itemCard, isSelected && styles.itemCardSelected]}
                    onPress={() => setSelectedItem(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.model}, ${item.capacity || ""}`}
                  >
                    <View style={styles.itemMainInfo}>
                      <Text style={styles.itemModelName}>{item.model}</Text>
                      <Text style={styles.itemSubInfo}>
                        {[item.capacity, item.color, item.carrier].filter(Boolean).join(" • ")}
                      </Text>
                      {item.imei && <Text style={styles.itemImei}>IMEI: {item.imei}</Text>}
                    </View>
                    <View style={styles.itemPriceInfo}>
                      <Text style={styles.itemPriceText}>
                        ${typeof item.price === "number" ? item.price.toFixed(2) : item.price}
                      </Text>
                      <Text style={styles.itemConditionText}>{item.condition || "Available"}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.centerBox}>
                  <Text style={styles.emptyText}>No available devices found.</Text>
                </View>
              }
            />
          )}
        </View>

        {/* Right Column: Selected Product Detail & Cart Drawer (45% width) */}
        <View style={styles.detailColumn}>
          <View style={styles.detailCard}>
            <ProductDetail item={selectedItem} />
          </View>

          {/* Persistent Cart Summary Box */}
          <View style={styles.cartBar}>
            <View>
              <Text style={styles.cartCountText}>{cartItems.length} items in cart</Text>
              <Text style={styles.cartSubtotalText}>${subtotal.toFixed(2)}</Text>
            </View>

            <TouchableOpacity
              style={[styles.checkoutNavButton, cartItems.length === 0 && styles.buttonDisabled]}
              disabled={cartItems.length === 0}
              onPress={() => setViewMode("checkout")}
              accessibilityRole="button"
              accessibilityLabel="Proceed to Checkout"
            >
              <Text style={styles.checkoutNavButtonText}>Proceed to Checkout →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.background,
  },
  topBar: {
    height: 60,
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderBottomWidth: 1,
    borderBottomColor: IPAD_THEME.colors.borderSubtle,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: IPAD_THEME.spacing.lg,
  },
  brandContainer: {
    flexDirection: "column",
  },
  appTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  orgSubtitle: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 12,
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: IPAD_THEME.spacing.md,
  },
  scannerBadge: {
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    paddingHorizontal: IPAD_THEME.spacing.md,
    paddingVertical: IPAD_THEME.spacing.xs,
    borderRadius: IPAD_THEME.radius.sm,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
  },
  scannerBadgeText: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: IPAD_THEME.spacing.md,
    paddingVertical: IPAD_THEME.spacing.xs,
    borderRadius: IPAD_THEME.radius.sm,
    borderWidth: 1,
  },
  statusOnline: {
    backgroundColor: IPAD_THEME.colors.successMuted,
    borderColor: IPAD_THEME.colors.success,
  },
  statusOffline: {
    backgroundColor: IPAD_THEME.colors.dangerMuted,
    borderColor: IPAD_THEME.colors.danger,
  },
  statusSync: {
    backgroundColor: IPAD_THEME.colors.warningMuted,
    borderColor: IPAD_THEME.colors.warning,
  },
  statusBadgeText: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 11,
    fontWeight: "700",
  },
  logoutButton: {
    paddingVertical: IPAD_THEME.spacing.xs,
    paddingHorizontal: IPAD_THEME.spacing.md,
  },
  logoutText: {
    color: IPAD_THEME.colors.danger,
    fontWeight: "600",
    fontSize: 14,
  },
  splitLayout: {
    flex: 1,
    flexDirection: "row",
  },
  catalogColumn: {
    flex: 1.1,
    borderRightWidth: 1,
    borderRightColor: IPAD_THEME.colors.borderSubtle,
    padding: IPAD_THEME.spacing.lg,
  },
  searchHeader: {
    flexDirection: "row",
    gap: IPAD_THEME.spacing.sm,
    marginBottom: IPAD_THEME.spacing.md,
  },
  searchInput: {
    flex: 1,
    height: IPAD_THEME.touchTarget.largeHeight,
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    borderRadius: IPAD_THEME.radius.md,
    paddingHorizontal: IPAD_THEME.spacing.lg,
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 15,
  },
  refreshButton: {
    width: IPAD_THEME.touchTarget.largeHeight,
    height: IPAD_THEME.touchTarget.largeHeight,
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    borderRadius: IPAD_THEME.radius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  refreshButtonText: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 20,
    fontWeight: "bold",
  },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: IPAD_THEME.spacing.xxl,
  },
  loadingText: {
    color: IPAD_THEME.colors.textSecondary,
    marginTop: IPAD_THEME.spacing.md,
    fontSize: 14,
  },
  errorText: {
    color: IPAD_THEME.colors.danger,
    fontSize: 14,
    marginBottom: IPAD_THEME.spacing.md,
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: IPAD_THEME.spacing.lg,
    paddingVertical: IPAD_THEME.spacing.sm,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
  },
  retryText: {
    color: IPAD_THEME.colors.textPrimary,
    fontWeight: "600",
  },
  emptyText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 15,
  },
  itemCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    borderRadius: IPAD_THEME.radius.md,
    padding: IPAD_THEME.spacing.md,
    marginBottom: IPAD_THEME.spacing.sm,
  },
  itemCardSelected: {
    borderColor: IPAD_THEME.colors.accent,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
  },
  itemMainInfo: {
    flex: 1,
  },
  itemModelName: {
    fontSize: 16,
    fontWeight: "700",
    color: IPAD_THEME.colors.textPrimary,
  },
  itemSubInfo: {
    fontSize: 13,
    color: IPAD_THEME.colors.textSecondary,
    marginTop: 2,
  },
  itemImei: {
    fontSize: 12,
    color: IPAD_THEME.colors.textMuted,
    marginTop: 2,
  },
  itemPriceInfo: {
    alignItems: "flex-end",
  },
  itemPriceText: {
    fontSize: 16,
    fontWeight: "800",
    color: IPAD_THEME.colors.accent,
  },
  itemConditionText: {
    fontSize: 12,
    color: IPAD_THEME.colors.textMuted,
  },
  detailColumn: {
    flex: 0.9,
    padding: IPAD_THEME.spacing.lg,
    justifyContent: "space-between",
  },
  detailCard: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderRadius: IPAD_THEME.radius.lg,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    marginBottom: IPAD_THEME.spacing.lg,
  },
  cartBar: {
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderRadius: IPAD_THEME.radius.lg,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    padding: IPAD_THEME.spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cartCountText: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  cartSubtotalText: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
  },
  checkoutNavButton: {
    backgroundColor: IPAD_THEME.colors.accent,
    paddingHorizontal: IPAD_THEME.spacing.xl,
    height: IPAD_THEME.touchTarget.minHeight,
    borderRadius: IPAD_THEME.radius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  checkoutNavButtonText: {
    color: "#080c14",
    fontWeight: "700",
    fontSize: 15,
  },
});
