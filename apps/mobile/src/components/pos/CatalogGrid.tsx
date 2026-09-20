import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import type { IInventoryListItem } from "@ireader/contracts";
import { IPAD_THEME } from "../../theme/tokens";
import { SearchBar } from "../ui/SearchBar";
import { ProductCard } from "./ProductCard";
import { useCart } from "../../contexts/CartContext";

interface CatalogGridProps {
  items: IInventoryListItem[];
  selectedItem: IInventoryListItem | null;
  onSelectItem: (item: IInventoryListItem) => void;
  isLoading: boolean;
  errorMessage: string | null;
  onRefresh: () => void;
  onOpenScanner?: () => void;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
}

const FILTER_CHIPS = ["All", "Unlocked", "Grade A", "iPhone 15", "iPhone 14", "iPhone 13", "iPad"];

export function CatalogGrid({
  items,
  selectedItem,
  onSelectItem,
  isLoading,
  errorMessage,
  onRefresh,
  onOpenScanner,
  searchQuery: controlledQuery,
  onSearchQueryChange,
}: CatalogGridProps) {
  const { hasItem, addItem, removeItem } = useCart();
  const [internalQuery, setInternalQuery] = useState("");
  const [activeChip, setActiveChip] = useState("All");

  const searchQuery = controlledQuery !== undefined ? controlledQuery : internalQuery;
  const setSearchQuery = onSearchQueryChange || setInternalQuery;

  const filteredItems = useMemo(() => {
    let result = items;

    // Apply active chip filter
    if (activeChip !== "All") {
      const chipNorm = activeChip.toLowerCase();
      if (chipNorm === "unlocked") {
        result = result.filter((i) => i.carrier?.toLowerCase().includes("unlocked"));
      } else if (chipNorm === "grade a") {
        result = result.filter((i) => i.grade?.toUpperCase() === "A");
      } else {
        result = result.filter((i) => i.model?.toLowerCase().includes(chipNorm));
      }
    }

    // Apply text search / scan filter
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
  }, [items, searchQuery, activeChip]);

  return (
    <View style={styles.container}>
      {/* Top Search Bar */}
      <View style={styles.searchSection}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          onScanPress={onOpenScanner}
          placeholder="Scan barcode, IMEI, S/N, or search model..."
        />
      </View>

      {/* Filter Chips */}
      <View style={styles.chipsSection}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTER_CHIPS}
          keyExtractor={(c) => c}
          contentContainerStyle={styles.chipsContent}
          renderItem={({ item: chip }) => {
            const isActive = activeChip === chip;
            return (
              <TouchableOpacity
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => setActiveChip(chip)}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${chip}`}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {chip}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Inventory Catalog List */}
      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={IPAD_THEME.colors.accent} />
          <Text style={styles.loadingText}>Fetching available inventory...</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
            <Text style={styles.retryText}>Retry Loading</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          initialNumToRender={10}
          maxToRenderPerBatch={15}
          windowSize={7}
          removeClippedSubviews={true}
          renderItem={({ item }) => (
            <ProductCard
              item={item}
              isSelected={selectedItem?.id === item.id}
              isInCart={hasItem(item.id)}
              onSelect={onSelectItem}
              onQuickAdd={(target) => {
                if (hasItem(target.id)) {
                  removeItem(target.id);
                } else {
                  addItem(target);
                }
              }}
            />
          )}
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>No matching inventory</Text>
              <Text style={styles.emptySubtitle}>
                Try adjusting your search keywords or filter chip selection
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
    padding: IPAD_THEME.spacing.lg,
  },
  searchSection: {
    marginBottom: IPAD_THEME.spacing.sm,
  },
  chipsSection: {
    marginBottom: IPAD_THEME.spacing.md,
  },
  chipsContent: {
    gap: IPAD_THEME.spacing.xs,
  },
  chip: {
    paddingHorizontal: IPAD_THEME.spacing.md,
    paddingVertical: 6,
    borderRadius: IPAD_THEME.radius.full,
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
  },
  chipActive: {
    backgroundColor: IPAD_THEME.colors.accent,
    borderColor: IPAD_THEME.colors.accent,
  },
  chipText: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#080c14",
    fontWeight: "700",
  },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: IPAD_THEME.spacing.xl,
  },
  loadingText: {
    color: IPAD_THEME.colors.textSecondary,
    marginTop: IPAD_THEME.spacing.md,
    fontSize: 14,
  },
  errorText: {
    color: IPAD_THEME.colors.danger,
    fontSize: 14,
    textAlign: "center",
    marginBottom: IPAD_THEME.spacing.md,
  },
  retryButton: {
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    paddingHorizontal: IPAD_THEME.spacing.lg,
    paddingVertical: IPAD_THEME.spacing.sm,
    borderRadius: IPAD_THEME.radius.md,
  },
  retryText: {
    color: IPAD_THEME.colors.textPrimary,
    fontWeight: "600",
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: IPAD_THEME.spacing.sm,
  },
  emptyTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 4,
  },
  emptySubtitle: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 13,
    textAlign: "center",
  },
});
