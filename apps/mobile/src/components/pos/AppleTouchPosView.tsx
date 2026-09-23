import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import type { IInventoryListItem } from "@ireader/contracts";
import { IPAD_THEME } from "../../theme/tokens";
import { useCart } from "../../contexts/CartContext";
import {
  groupInventoryByAppleModel,
  type AppleModelGroup,
  type AppleSeriesCategory,
} from "../../utils/appleCatalogGrouping";
import { formatCurrency } from "../../utils/formatters";
import { AppleTouchCard } from "./AppleTouchCard";
import { AppleConfiguratorSheet } from "./AppleConfiguratorSheet";

interface AppleTouchPosViewProps {
  items: IInventoryListItem[];
  isLoading: boolean;
  errorMessage: string | null;
  onRefresh: () => void;
  onOpenScanner: () => void;
  onOpenMessages?: () => void;
}

const CATEGORIES = [
  { id: "iphone", label: "iPhone", icon: "📱" },
  { id: "ipad", label: "iPad", icon: "📟" },
  { id: "mac", label: "Mac", icon: "💻" },
  { id: "watch", label: "Watch", icon: "⌚" },
  { id: "all", label: "Todos", icon: "✨" },
  { id: "other", label: "Otros", icon: "📦" },
];

const IPHONE_SERIES: Array<{ id: AppleSeriesCategory | "all"; label: string }> = [
  { id: "bestsellers", label: "⭐ Top Ventas" },
  { id: "series_17_16", label: "Serie 16 & 17" },
  { id: "series_15", label: "Serie 15" },
  { id: "series_14", label: "Serie 14" },
  { id: "series_13_12", label: "Serie 12 & 13" },
  { id: "series_se_older", label: "SE & Anteriores" },
  { id: "all", label: "Todos los iPhone" },
];

export function AppleTouchPosView({
  items,
  isLoading,
  errorMessage,
  onRefresh,
  onOpenScanner,
  onOpenMessages,
}: AppleTouchPosViewProps) {
  const { width } = useWindowDimensions();
  const { addItem, items: cartItems, hasItem } = useCart();

  // Por defecto iniciamos en iPhone y en el Top Más Vendidos para que la pantalla sea ultra-ligera (4-6 tarjetas)
  const [selectedCategory, setSelectedCategory] = useState("iphone");
  const [selectedSeries, setSelectedSeries] = useState<AppleSeriesCategory | "all">("bestsellers");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<AppleModelGroup | null>(null);
  const [viewDensity, setViewDensity] = useState<"grid" | "compact">("grid");
  const [quickToast, setQuickToast] = useState<string | null>(null);

  // Auto-cierre del toast de retroalimentación
  useEffect(() => {
    if (!quickToast) return;
    const timer = setTimeout(() => {
      setQuickToast(null);
    }, 2200);
    return () => clearTimeout(timer);
  }, [quickToast]);

  // Selección inteligente con 1-tap directo al carrito para productos con 1 solo ítem
  const handleSelectGroup = (group: AppleModelGroup) => {
    if (group.items && group.items.length === 1) {
      const singleItem = group.items[0];
      if (singleItem) {
        if (!hasItem(singleItem.id)) {
          addItem(singleItem);
          const spec = [singleItem.capacity, singleItem.color].filter(Boolean).join(" ");
          setQuickToast(`✓ Agregado al ticket: ${singleItem.model}${spec ? ` (${spec})` : ""}`);
        } else {
          setQuickToast(`ℹ️ ${singleItem.model} ya está en el ticket`);
        }
        return;
      }
    }

    // Si tiene más de una unidad o variante, abrir configurador táctil
    setSelectedGroup(group);
  };

  // En iPad vertical, 2 columnas amplias es la proporción ideal
  const numColumns = width >= 1200 ? 3 : 2;

  // Agrupamiento maestro por modelo (priorizando iPhones más vendidos al inicio)
  const allGroups = useMemo(() => {
    return groupInventoryByAppleModel(items || []);
  }, [items]);

  // Filtrado de grupos por categoría, subserie y búsqueda
  const filteredGroups = useMemo(() => {
    if (!allGroups || !Array.isArray(allGroups)) return [];
    return allGroups.filter((group): group is AppleModelGroup => {
      if (!group || !group.modelKey) return false;

      // 1. Filtro de categoría principal
      if (selectedCategory !== "all" && group.deviceType !== selectedCategory) {
        return false;
      }

      // 2. Filtro de subserie de iPhone (evita saturar la pantalla con 36 equipos)
      if (selectedCategory === "iphone" || selectedCategory === "all") {
        if (selectedSeries === "bestsellers" && !group.isBestseller) {
          return false;
        }
        if (selectedSeries === "series_17_16" && group.series !== "series_17_16") {
          return false;
        }
        if (selectedSeries === "series_15" && group.series !== "series_15") {
          return false;
        }
        if (selectedSeries === "series_14" && group.series !== "series_14") {
          return false;
        }
        if (selectedSeries === "series_13_12" && group.series !== "series_13_12") {
          return false;
        }
        if (selectedSeries === "series_se_older" && group.series !== "series_se_older") {
          return false;
        }
      }

      // 3. Filtro de búsqueda
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesModel = (group.modelName || "").toLowerCase().includes(q);
        const matchesColor = (group.colors || []).some((c) => (c.name || "").toLowerCase().includes(q));
        const matchesCap = (group.capacities || []).some((c) => (c || "").toLowerCase().includes(q));
        const matchesImeiOrSku = (group.items || []).some((it) => {
          if (!it) return false;
          const imei = (it.imei || "").toLowerCase();
          const sku = (it.sku || "").toLowerCase();
          const serial = (it.serialNumber || "").toLowerCase();
          return imei.includes(q) || sku.includes(q) || serial.includes(q);
        });

        return matchesModel || matchesColor || matchesCap || matchesImeiOrSku;
      }

      return true;
    });
  }, [allGroups, selectedCategory, selectedSeries, searchQuery]);

  // Conteo de MODELOS por categoría (en lugar de IMEIs brutos) para evitar sensación de saturación
  const countsByCategory = useMemo(() => {
    const counts: Record<string, number> = { all: allGroups.length };
    allGroups.forEach((g) => {
      const type = g.deviceType || "other";
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [allGroups]);

  // Conteo de modelos por subserie para visualización directa en cada chip
  const seriesCounts = useMemo(() => {
    const iphoneGroups = allGroups.filter((g) => g.deviceType === "iphone");
    return {
      bestsellers: iphoneGroups.filter((g) => g.isBestseller).length,
      series_17_16: iphoneGroups.filter((g) => g.series === "series_17_16").length,
      series_15: iphoneGroups.filter((g) => g.series === "series_15").length,
      series_14: iphoneGroups.filter((g) => g.series === "series_14").length,
      series_13_12: iphoneGroups.filter((g) => g.series === "series_13_12").length,
      series_se_older: iphoneGroups.filter((g) => g.series === "series_se_older").length,
      all: iphoneGroups.length,
    };
  }, [allGroups]);

  // Total de unidades físicas en la vista filtrada actual
  const totalUnitsInView = useMemo(() => {
    return filteredGroups.reduce((sum, g) => sum + (g.totalAvailable || 0), 0);
  }, [filteredGroups]);

  return (
    <View style={styles.container}>
      {/* Top Search & Category Bar */}
      <View style={styles.topControlPanel}>
        {/* Search, Scanner & View Toggle Row */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrapper}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar modelo, capacidad, color o IMEI..."
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

          {onOpenMessages && (
            <TouchableOpacity
              style={styles.messagesLauncherBtn}
              onPress={onOpenMessages}
              accessibilityRole="button"
              accessibilityLabel="Abrir Mensajería WhatsApp"
              activeOpacity={0.7}
            >
              <Text style={styles.messagesLauncherText}>✉️ Mensajes</Text>
            </TouchableOpacity>
          )}

          {/* Toggle de densidad: Cuadrícula vs Lista Compacta */}
          <View style={styles.densityToggle}>
            <TouchableOpacity
              style={[styles.densityBtn, viewDensity === "grid" && styles.densityBtnActive]}
              onPress={() => setViewDensity("grid")}
              accessibilityRole="button"
              accessibilityLabel="Vista cuadrícula"
            >
              <Text style={[styles.densityBtnText, viewDensity === "grid" && styles.densityBtnTextActive]}>
                ⊞
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.densityBtn, viewDensity === "compact" && styles.densityBtnActive]}
              onPress={() => setViewDensity("compact")}
              accessibilityRole="button"
              accessibilityLabel="Vista compacta de lista"
            >
              <Text style={[styles.densityBtnText, viewDensity === "compact" && styles.densityBtnTextActive]}>
                ☰
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Category Pills Bar (Horizontal Scrollable) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesScrollView}
          contentContainerStyle={styles.categoriesScrollContent}
        >
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            const count = countsByCategory[cat.id] || 0;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryPill, isSelected && styles.categoryPillActive]}
                onPress={() => {
                  setSelectedCategory(cat.id);
                  if (cat.id === "iphone") setSelectedSeries("bestsellers");
                  else setSelectedSeries("all");
                }}
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
        </ScrollView>

        {/* Sub-bar de Series de iPhone (Filtro Anti-Saturación) */}
        {(selectedCategory === "iphone" || selectedCategory === "all") && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.seriesScrollView}
            contentContainerStyle={styles.seriesScrollContent}
          >
            {IPHONE_SERIES.map((ser) => {
              const isSelected = selectedSeries === ser.id;
              const sCount = (seriesCounts as Record<string, number>)[ser.id] ?? 0;
              return (
                <TouchableOpacity
                  key={ser.id}
                  style={[styles.seriesChip, isSelected && styles.seriesChipActive]}
                  onPress={() => setSelectedSeries(ser.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.seriesChipText, isSelected && styles.seriesChipTextActive]}>
                    {ser.label} ({sCount})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Sub-header de conteo sin saturación */}
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>
            Mostrando <Text style={styles.statusHighlight}>{filteredGroups.length} modelos</Text> ({totalUnitsInView} unidades disponibles)
          </Text>
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
          <Text style={styles.loadingText}>Cargando catálogo táctil de Apple...</Text>
        </View>
      ) : filteredGroups.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyTitle}>Sin resultados en esta sección</Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery
              ? `No se encontraron modelos para "${searchQuery}".`
              : "No hay productos en esta serie actualmente. Selecciona otra categoría."}
          </Text>
          {Boolean(searchQuery) && (
            <TouchableOpacity style={styles.clearFilterBtn} onPress={() => setSearchQuery("")}>
              <Text style={styles.clearFilterText}>Limpiar búsqueda</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : viewDensity === "compact" ? (
        /* ─────────────── VISTA COMPACTA TIPO FILA (ANTI-SATURACIÓN) ─────────────── */
        <FlatList
          key="compact-list"
          data={filteredGroups}
          keyExtractor={(group, index) => group?.modelKey || `compact-${index}`}
          renderItem={({ item: group }) => {
            if (!group || !group.modelKey) return null;
            const inCart = (cartItems || []).filter(
              (ci) => (ci?.inventoryItem?.model || "").toLowerCase() === group.modelKey
            ).length;
            const isSingle = group.items?.length === 1;

            return (
              <TouchableOpacity
                style={[styles.compactRow, inCart > 0 && styles.compactRowInCart]}
                onPress={() => handleSelectGroup(group)}
                activeOpacity={0.7}
              >
                <View style={styles.compactLeft}>
                  <Text style={styles.compactIcon}>
                    {group.deviceType === "iphone" ? "📱" : group.deviceType === "ipad" ? "📟" : "📦"}
                  </Text>
                  <View>
                    <View style={styles.compactTitleRow}>
                      <Text style={styles.compactModelTitle}>{group.modelName}</Text>
                      {group.isBestseller && (
                        <View style={styles.compactBadge}>
                          <Text style={styles.compactBadgeText}>⭐ TOP</Text>
                        </View>
                      )}
                      {inCart > 0 && (
                        <View style={styles.compactInCartBadge}>
                          <Text style={styles.compactInCartText}>✓ {inCart}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.compactSwatchesRow}>
                      {(group.colors || []).slice(0, 4).map((c) => (
                        <View key={c.name} style={[styles.compactColorDot, { backgroundColor: c.hex }]} />
                      ))}
                      <Text style={styles.compactDetailsText}>
                        {(group.capacities || []).join(", ")} · {group.totalAvailable} disp.
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.compactRight}>
                  <View style={styles.compactPriceBox}>
                    <Text style={styles.compactPriceLabel}>{isSingle ? "PRECIO" : "DESDE"}</Text>
                    <Text style={styles.compactPriceVal}>{formatCurrency(group.minPrice)}</Text>
                  </View>
                  <View style={[styles.compactActionBtn, inCart > 0 && styles.compactActionBtnInCart]}>
                    <Text style={[styles.compactActionBtnText, inCart > 0 && styles.compactActionBtnTextInCart]}>
                      {inCart > 0 ? "✓ Listo" : isSingle ? "+ Agregar" : "Elegir ›"}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.listContentCompact}
          showsVerticalScrollIndicator={false}
          onRefresh={onRefresh}
          refreshing={isLoading}
        />
      ) : (
        /* ─────────────── VISTA CUADRÍCULA APPLE CARDS ─────────────── */
        <FlatList
          key={`grid-${numColumns}`}
          data={filteredGroups}
          keyExtractor={(group, index) => group?.modelKey || `grid-${index}`}
          numColumns={numColumns}
          renderItem={({ item: group }) => {
            if (!group || !group.modelKey) return null;
            return <AppleTouchCard group={group} onPressGroup={handleSelectGroup} />;
          }}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onRefresh={onRefresh}
          refreshing={isLoading}
        />
      )}

      {/* Apple Store Configurator Sheet (Paso a Paso: Color ➔ Capacidad ➔ IMEI) */}
      <AppleConfiguratorSheet
        visible={Boolean(selectedGroup)}
        group={selectedGroup}
        onClose={() => setSelectedGroup(null)}
        onAddToCart={addItem}
      />

      {/* Toast flotante de retroalimentación inmediata */}
      {quickToast && (
        <View style={styles.quickToastContainer} pointerEvents="none">
          <View style={styles.quickToastPill}>
            <Text style={styles.quickToastText}>{quickToast}</Text>
          </View>
        </View>
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
    paddingBottom: IPAD_THEME.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  searchRow: {
    flexDirection: "row",
    gap: IPAD_THEME.spacing.sm,
    alignItems: "center",
    marginBottom: IPAD_THEME.spacing.sm,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161f30",
    borderRadius: IPAD_THEME.radius.lg,
    paddingHorizontal: IPAD_THEME.spacing.md,
    height: 42,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 13,
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 6,
  },
  clearSearchText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  scanLauncherBtn: {
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    borderRadius: IPAD_THEME.radius.lg,
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.3)",
    height: 42,
  },
  scanLauncherText: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: "800",
  },
  messagesLauncherBtn: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderRadius: IPAD_THEME.radius.lg,
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#f59e0b",
    height: 42,
  },
  messagesLauncherText: {
    color: "#f59e0b",
    fontSize: 12,
    fontWeight: "800",
  },
  densityToggle: {
    flexDirection: "row",
    backgroundColor: "#161f30",
    borderRadius: IPAD_THEME.radius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: 2,
    height: 42,
    alignItems: "center",
  },
  densityBtn: {
    paddingHorizontal: 10,
    height: 36,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  densityBtnActive: {
    backgroundColor: "rgba(56, 189, 248, 0.2)",
  },
  densityBtnText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 16,
    fontWeight: "700",
  },
  densityBtnTextActive: {
    color: "#38bdf8",
  },
  categoriesScrollView: {
    flexGrow: 0,
  },
  categoriesScrollContent: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
    paddingRight: IPAD_THEME.spacing.md,
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingVertical: 6,
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
    fontSize: 13,
  },
  categoryLabel: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 12,
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
    fontSize: 10,
    fontWeight: "700",
  },
  countBadgeTextActive: {
    color: "#0f172a",
    fontWeight: "900",
  },
  seriesScrollView: {
    flexGrow: 0,
    marginTop: 6,
    marginBottom: 4,
  },
  seriesScrollContent: {
    flexDirection: "row",
    gap: 6,
    paddingRight: IPAD_THEME.spacing.md,
  },
  seriesChip: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  seriesChipActive: {
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    borderColor: "rgba(56, 189, 248, 0.4)",
  },
  seriesChipText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  seriesChipTextActive: {
    color: "#38bdf8",
    fontWeight: "900",
  },
  errorBanner: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingHorizontal: IPAD_THEME.spacing.lg,
    paddingVertical: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(239, 68, 68, 0.3)",
  },
  errorText: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  retryBtn: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: IPAD_THEME.radius.sm,
  },
  retryText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: IPAD_THEME.spacing.xxl,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  emptySubtitle: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: IPAD_THEME.spacing.md,
  },
  clearFilterBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: IPAD_THEME.radius.full,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  clearFilterText: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  listContent: {
    padding: 6,
  },
  listContentCompact: {
    padding: 8,
    gap: 6,
  },
  compactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: IPAD_THEME.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  compactRowInCart: {
    borderColor: IPAD_THEME.colors.accent,
    backgroundColor: "#131f37",
  },
  compactLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  compactIcon: {
    fontSize: 20,
  },
  compactTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  compactModelTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
  compactBadge: {
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  compactBadgeText: {
    color: "#f59e0b",
    fontSize: 9,
    fontWeight: "900",
  },
  compactInCartBadge: {
    backgroundColor: IPAD_THEME.colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  compactInCartText: {
    color: "#0f172a",
    fontSize: 10,
    fontWeight: "900",
  },
  compactSwatchesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  compactColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  compactDetailsText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    marginLeft: 4,
  },
  compactRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  compactPriceBox: {
    alignItems: "flex-end",
  },
  compactPriceLabel: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 8,
    fontWeight: "800",
  },
  compactPriceVal: {
    color: "#38bdf8",
    fontSize: 14,
    fontWeight: "900",
  },
  compactActionBtn: {
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: IPAD_THEME.radius.full,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.3)",
  },
  compactActionBtnInCart: {
    backgroundColor: IPAD_THEME.colors.accent,
    borderColor: IPAD_THEME.colors.accent,
  },
  compactActionBtnText: {
    color: "#38bdf8",
    fontSize: 11,
    fontWeight: "800",
  },
  compactActionBtnTextInCart: {
    color: "#0f172a",
    fontWeight: "900",
  },
  quickToastContainer: {
    position: "absolute",
    bottom: 24,
    left: 24,
    right: 24,
    alignItems: "center",
    zIndex: 999,
  },
  quickToastPill: {
    backgroundColor: "#161f30",
    borderWidth: 1.5,
    borderColor: IPAD_THEME.colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: IPAD_THEME.radius.full,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  quickToastText: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },
  statusBar: {
    paddingTop: 4,
    paddingBottom: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  statusText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: "500",
  },
  statusHighlight: {
    color: "#38bdf8",
    fontWeight: "700",
  },
});
