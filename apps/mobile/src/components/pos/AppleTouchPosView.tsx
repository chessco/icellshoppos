import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import type { IInventoryListItem } from "@ireader/contracts";
import { IPAD_THEME } from "../../theme/tokens";
import { AppleTouchCard } from "./AppleTouchCard";

interface AppleTouchPosViewProps {
  items: IInventoryListItem[];
  isLoading: boolean;
  errorMessage: string | null;
  onRefresh: () => void;
  onOpenScanner: () => void;
}

const CATEGORIES = [
  { id: "all", label: "Todos", icon: "✨" },
  { id: "iphone", label: "iPhone", icon: "📱" },
  { id: "ipad", label: "iPad", icon: "📟" },
  { id: "mac", label: "Mac", icon: "💻" },
  { id: "watch", label: "Watch", icon: "⌚" },
  { id: "other", label: "Otros", icon: "📦" },
];

export function AppleTouchPosView({
  items,
  isLoading,
  errorMessage,
  onRefresh,
  onOpenScanner,
}: AppleTouchPosViewProps) {
  const { width } = useWindowDimensions();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Determine number of columns based on width
  const numColumns = width >= 1100 ? 3 : 2;

  // Filter items based on category and search text
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const model = (item.model || "").toLowerCase();

      // Category filter
      if (selectedCategory === "iphone" && !model.includes("iphone")) return false;
      if (selectedCategory === "ipad" && !model.includes("ipad")) return false;
      if (
        selectedCategory === "mac" &&
        !model.includes("mac") &&
        !model.includes("imac") &&
        !model.includes("book")
      ) {
        return false;
      }
      if (selectedCategory === "watch" && !model.includes("watch")) return false;
      if (
        selectedCategory === "other" &&
        (model.includes("iphone") ||
          model.includes("ipad") ||
          model.includes("mac") ||
          model.includes("imac") ||
          model.includes("book") ||
          model.includes("watch"))
      ) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const imei = item.imei || "";
        const sku = (item.sku || "").toLowerCase();
        const serial = (item.serialNumber || "").toLowerCase();
        return model.includes(q) || imei.includes(q) || sku.includes(q) || serial.includes(q);
      }

      return true;
    });
  }, [items, selectedCategory, searchQuery]);

  // Calculate counts per category for chip badges
  const countsByCategory = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    items.forEach((item) => {
      const m = (item.model || "").toLowerCase();
      if (m.includes("iphone")) counts["iphone"] = (counts["iphone"] || 0) + 1;
      else if (m.includes("ipad")) counts["ipad"] = (counts["ipad"] || 0) + 1;
      else if (m.includes("mac") || m.includes("imac") || m.includes("book"))
        counts["mac"] = (counts["mac"] || 0) + 1;
      else if (m.includes("watch")) counts["watch"] = (counts["watch"] || 0) + 1;
      else counts["other"] = (counts["other"] || 0) + 1;
    });
    return counts;
  }, [items]);

  return (
    <View style={styles.container}>
      {/* Top Search & Category Bar */}
      <View style={styles.topControlPanel}>
        {/* Search & Scanner Input Row */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrapper}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por modelo, capacidad, IMEI o SKU..."
              placeholderTextColor={IPAD_THEME.colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")} style={styles.clearSearchBtn}>
                <Text style={styles.clearSearchText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.scanLauncherBtn}
            onPress={onOpenScanner}
            accessibilityRole="button"
            accessibilityLabel="Escanear con cámara"
          >
            <Text style={styles.scanLauncherText}>📷 Escanear</Text>
          </TouchableOpacity>
        </View>

        {/* Category Pills Bar */}
        <View style={styles.categoriesBar}>
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            const count = countsByCategory[cat.id] || 0;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryPill, isSelected && styles.categoryPillActive]}
                onPress={() => setSelectedCategory(cat.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Categoría ${cat.label}, ${count} disponibles`}
              >
                <Text style={styles.categoryIcon}>{cat.icon}</Text>
                <Text style={[styles.categoryLabel, isSelected && styles.categoryLabelActive]}>
                  {cat.label}
                </Text>
                <View style={[styles.countBadge, isSelected && styles.countBadgeActive]}>
                  <Text style={[styles.countBadgeText, isSelected && styles.countBadgeTextActive]}>
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Error Banner */}
      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={onRefresh}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content Area */}
      {isLoading && items.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={IPAD_THEME.colors.accent} />
          <Text style={styles.loadingText}>Cargando catálogo táctil...</Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyTitle}>Sin resultados en esta categoría</Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery
              ? `No se encontraron equipos para "${searchQuery}". Intenta con otro término.`
              : "No hay productos disponibles en esta categoría actualmente."}
          </Text>
          {Boolean(searchQuery) && (
            <TouchableOpacity style={styles.clearFilterBtn} onPress={() => setSearchQuery("")}>
              <Text style={styles.clearFilterText}>Limpiar búsqueda</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          key={`grid-${numColumns}`}
          data={filteredItems}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          renderItem={({ item }) => <AppleTouchCard item={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onRefresh={onRefresh}
          refreshing={isLoading}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.background,
  },
  topControlPanel: {
    backgroundColor: "#0d131f",
    paddingHorizontal: IPAD_THEME.spacing.lg,
    paddingTop: IPAD_THEME.spacing.md,
    paddingBottom: IPAD_THEME.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  searchRow: {
    flexDirection: "row",
    gap: IPAD_THEME.spacing.md,
    marginBottom: IPAD_THEME.spacing.sm,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161f30",
    borderRadius: IPAD_THEME.radius.lg,
    paddingHorizontal: IPAD_THEME.spacing.md,
    height: 44,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 14,
    height: 44,
  },
  clearSearchBtn: {
    padding: 6,
  },
  clearSearchText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  scanLauncherBtn: {
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    borderRadius: IPAD_THEME.radius.lg,
    paddingHorizontal: IPAD_THEME.spacing.lg,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.3)",
    height: 44,
  },
  scanLauncherText: {
    color: "#38bdf8",
    fontSize: 13,
    fontWeight: "800",
  },
  categoriesBar: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: IPAD_THEME.radius.full,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.07)",
    gap: 6,
  },
  categoryPillActive: {
    backgroundColor: IPAD_THEME.colors.accent,
    borderColor: IPAD_THEME.colors.accent,
  },
  categoryIcon: {
    fontSize: 14,
  },
  categoryLabel: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  categoryLabelActive: {
    color: "#0f172a",
    fontWeight: "900",
  },
  countBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  countBadgeActive: {
    backgroundColor: "rgba(15, 23, 42, 0.2)",
  },
  countBadgeText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
  },
  countBadgeTextActive: {
    color: "#0f172a",
    fontWeight: "900",
  },
  errorBanner: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    margin: IPAD_THEME.spacing.md,
    padding: IPAD_THEME.spacing.md,
    borderRadius: IPAD_THEME.radius.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  errorText: {
    color: "#f87171",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  retryBtn: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: IPAD_THEME.radius.sm,
    marginLeft: 8,
  },
  retryText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: IPAD_THEME.spacing.xxl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 6,
  },
  emptySubtitle: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  clearFilterBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: IPAD_THEME.radius.full,
  },
  clearFilterText: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  listContent: {
    padding: IPAD_THEME.spacing.sm,
    paddingBottom: 40,
  },
});
