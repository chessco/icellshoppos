import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { InventoryApplicationService } from "@ireader/application";
import type { IInventoryListItem } from "@ireader/contracts";
import { IPAD_THEME } from "../theme/tokens";
import { SearchBar } from "../components/ui/SearchBar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";

export type InventoryStatusFilter = "Available" | "All" | "Sold";

interface StatusOption {
  id: InventoryStatusFilter;
  label: string;
  icon: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  { id: "Available", label: "Disponible", icon: "✨" },
  { id: "All", label: "Todos", icon: "📋" },
  { id: "Sold", label: "Vendido", icon: "🏷️" },
];

export function InventoryScreen() {
  const { apiClient } = useAuth();
  const [items, setItems] = useState<IInventoryListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>("Available");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inventoryService = useMemo(
    () => new InventoryApplicationService(apiClient),
    [apiClient]
  );

  const loadData = async (filterToUse: InventoryStatusFilter = statusFilter) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const statusParam = filterToUse === "All" ? undefined : filterToUse;
      const res = await inventoryService.loadInventory(statusParam);
      if (res.ok) {
        setItems(res.items);
      } else {
        setErrorMessage(res.error || "Failed to load inventory");
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData(statusFilter);
  }, [statusFilter]);

  const filteredItems = useMemo(() => {
    let result = items;

    if (statusFilter === "Available") {
      result = result.filter(
        (i) => (i.status || "Available").toLowerCase() === "available"
      );
    } else if (statusFilter === "Sold") {
      result = result.filter(
        (i) => (i.status || "").toLowerCase() === "sold"
      );
    }

    const q = searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter((i) => {
        const model = i.model?.toLowerCase() || "";
        const imei = i.imei || "";
        const serial = i.serialNumber?.toLowerCase() || "";
        const sku = i.sku?.toLowerCase() || "";
        return model.includes(q) || imei.includes(q) || serial.includes(q) || sku.includes(q);
      });
    }
    return result;
  }, [items, searchQuery, statusFilter]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchWrapper}>
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search inventory by model, IMEI, serial..."
          />
        </View>
        <Button
          title="↻ Refresh"
          variant="secondary"
          onPress={() => loadData(statusFilter)}
        />
      </View>

      {/* Filter Chips: Default is "Disponible" */}
      <View style={styles.filterSection}>
        {STATUS_OPTIONS.map((opt) => {
          const isActive = statusFilter === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setStatusFilter(opt.id)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Filtro ${opt.label}`}
            >
              <Text style={styles.filterIcon}>{opt.icon}</Text>
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {opt.label}
              </Text>
              {isActive && (
                <View style={styles.badgeCount}>
                  <Text style={styles.badgeCountText}>{filteredItems.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={IPAD_THEME.colors.accent} />
          <Text style={styles.loadingText}>Loading inventory records...</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Button title="Retry" variant="primary" onPress={() => loadData(statusFilter)} />
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardMain}>
                <View style={styles.titleRow}>
                  <Text style={styles.modelName}>{item.model}</Text>
                  <Badge label={item.status || "UNKNOWN"} variant={item.status === "Available" ? "success" : "default"} />
                </View>
                <Text style={styles.specs}>
                  {[item.capacity, item.color, item.carrier].filter(Boolean).join(" • ")}
                </Text>
                <Text style={styles.imei}>IMEI: {item.imei || item.serialNumber || "N/A"}</Text>
              </View>

              <View style={styles.cardRight}>
                <Text style={styles.price}>
                  ${typeof item.price === "number" ? item.price.toFixed(2) : item.price}
                </Text>
                {item.batteryHealth ? (
                  <Text style={styles.battery}>🔋 {item.batteryHealth}%</Text>
                ) : null}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>
                {statusFilter === "Available"
                  ? "No hay productos disponibles"
                  : statusFilter === "Sold"
                  ? "No hay productos vendidos"
                  : "No se encontraron registros"}
              </Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? `No se encontraron coincidencias para "${searchQuery}".`
                  : statusFilter === "Available"
                  ? "Todos los equipos se encuentran vendidos o en otro estado."
                  : "No hay equipos registrados en esta vista."}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.background,
    padding: IPAD_THEME.spacing.xl,
  },
  header: {
    flexDirection: "row",
    gap: IPAD_THEME.spacing.md,
    alignItems: "center",
    marginBottom: IPAD_THEME.spacing.lg,
  },
  searchWrapper: {
    flex: 1,
  },
  listContent: {
    gap: IPAD_THEME.spacing.sm,
  },
  card: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    borderRadius: IPAD_THEME.radius.lg,
    padding: IPAD_THEME.spacing.lg,
  },
  cardMain: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: IPAD_THEME.spacing.sm,
    marginBottom: 4,
  },
  modelName: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  specs: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
    marginBottom: 4,
  },
  imei: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    fontFamily: "Courier",
  },
  cardRight: {
    alignItems: "flex-end",
  },
  price: {
    color: IPAD_THEME.colors.accent,
    fontSize: 18,
    fontWeight: "800",
  },
  battery: {
    color: IPAD_THEME.colors.success,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: IPAD_THEME.colors.textSecondary,
    marginTop: IPAD_THEME.spacing.md,
  },
  errorText: {
    color: IPAD_THEME.colors.danger,
    marginBottom: IPAD_THEME.spacing.md,
  },
  filterSection: {
    flexDirection: "row",
    gap: IPAD_THEME.spacing.sm,
    marginBottom: IPAD_THEME.spacing.md,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: IPAD_THEME.spacing.md,
    paddingVertical: 8,
    borderRadius: IPAD_THEME.radius.full,
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: IPAD_THEME.colors.accent,
    borderColor: IPAD_THEME.colors.accent,
  },
  filterIcon: {
    fontSize: 13,
  },
  filterChipText: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  filterChipTextActive: {
    color: "#080c14",
    fontWeight: "800",
  },
  badgeCount: {
    backgroundColor: "rgba(8, 12, 20, 0.18)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  badgeCountText: {
    color: "#080c14",
    fontSize: 11,
    fontWeight: "900",
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: IPAD_THEME.spacing.xxl,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: IPAD_THEME.spacing.sm,
  },
  emptyTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  emptySubtitle: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 13,
    textAlign: "center",
  },
});
