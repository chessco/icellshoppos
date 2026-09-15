import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { InventoryApplicationService } from "@ireader/application";
import type { IInventoryListItem } from "@ireader/contracts";
import { IPAD_THEME } from "../theme/tokens";
import { SearchBar } from "../components/ui/SearchBar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";

export function InventoryScreen() {
  const { apiClient } = useAuth();
  const [items, setItems] = useState<IInventoryListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inventoryService = useMemo(
    () => new InventoryApplicationService(apiClient),
    [apiClient]
  );

  const loadData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await inventoryService.loadInventory();
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
    void loadData();
  }, []);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return items;
    return items.filter((i) => {
      const model = i.model?.toLowerCase() || "";
      const imei = i.imei || "";
      const serial = i.serialNumber?.toLowerCase() || "";
      return model.includes(q) || imei.includes(q) || serial.includes(q);
    });
  }, [items, searchQuery]);

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
          onPress={loadData}
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={IPAD_THEME.colors.accent} />
          <Text style={styles.loadingText}>Loading inventory records...</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Button title="Retry" variant="primary" onPress={loadData} />
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
});
