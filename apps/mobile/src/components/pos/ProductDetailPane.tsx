import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import type { IInventoryListItem } from "@ireader/contracts";
import { IPAD_THEME } from "../../theme/tokens";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { useCart } from "../../contexts/CartContext";
import { formatCurrency } from "../../utils/formatters";

interface ProductDetailPaneProps {
  item: IInventoryListItem | null;
  onAddToCart: (item: IInventoryListItem) => void;
  onRemoveFromCart: (itemId: string) => void;
  onOpenScanner?: () => void;
}

export function ProductDetailPane({
  item,
  onAddToCart,
  onRemoveFromCart,
  onOpenScanner,
}: ProductDetailPaneProps) {
  const { hasItem } = useCart();

  if (!item) {
    return (
      <View style={[styles.container, styles.emptyContainer]}>
        <Text style={styles.emptyIcon}>📱</Text>
        <Text style={styles.emptyTitle}>No Device Selected</Text>
        <Text style={styles.emptySubtitle}>
          Select an item from the catalog or scan an IMEI/barcode to inspect full device details
        </Text>
      </View>
    );
  }

  const inCart = hasItem(item.id);
  const formattedPrice = formatCurrency(item.price);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header Info */}
      <View style={styles.header}>
        <View style={styles.badgeRow}>
          <Badge label={item.status || "AVAILABLE"} variant="success" />
          {item.grade && <Badge label={`Grade ${item.grade}`} variant="default" />}
          {item.condition && <Badge label={item.condition} variant="default" />}
        </View>

        <Text style={styles.modelName}>{item.model}</Text>
        <Text style={styles.specSub}>
          {[item.capacity, item.color, item.carrier].filter(Boolean).join(" • ")}
        </Text>
      </View>

      {/* Price Showcase */}
      <View style={styles.priceCard}>
        <Text style={styles.priceLabel}>Retail POS Price</Text>
        <Text style={styles.priceValue}>{formattedPrice}</Text>
      </View>

      {/* Identifiers & Hardware Meta */}
      <View style={styles.metaSection}>
        <Text style={styles.metaHeader}>Device Identifiers</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>IMEI</Text>
          <Text style={styles.metaValMono}>{item.imei || "—"}</Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>Serial Number</Text>
          <Text style={styles.metaValMono}>{item.serialNumber || "—"}</Text>
        </View>

        {item.sku && (
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>SKU</Text>
            <Text style={styles.metaVal}>{item.sku}</Text>
          </View>
        )}

        {item.carrier && (
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Network Lock</Text>
            <Text style={styles.metaVal}>{item.carrier}</Text>
          </View>
        )}

        {item.batteryHealth && (
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Battery Health</Text>
            <Text style={styles.metaValSuccess}>🔋 {item.batteryHealth}% Maximum Capacity</Text>
          </View>
        )}

        {item.cycleCount !== undefined && item.cycleCount !== null && (
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Cycle Count</Text>
            <Text style={styles.metaVal}>{item.cycleCount} cycles</Text>
          </View>
        )}

        {item.iosVersion && (
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>iOS Version</Text>
            <Text style={styles.metaVal}>iOS {item.iosVersion}</Text>
          </View>
        )}
      </View>

      {/* Cart Action */}
      <View style={styles.actionSection}>
        <Button
          title={inCart ? "Remove from POS Cart" : "Add to POS Cart"}
          variant={inCart ? "danger" : "primary"}
          size="lg"
          onPress={() => (inCart ? removeItem(item.id) : addItem(item))}
          accessibilityLabel={inCart ? "Remove from POS Cart" : "Add to POS Cart"}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderRadius: IPAD_THEME.radius.lg,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
  },
  content: {
    padding: IPAD_THEME.spacing.lg,
    justifyContent: "space-between",
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderRadius: IPAD_THEME.radius.lg,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    justifyContent: "center",
    alignItems: "center",
    padding: IPAD_THEME.spacing.xl,
  },
  emptyIcon: {
    fontSize: 42,
    marginBottom: IPAD_THEME.spacing.md,
  },
  emptyTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: IPAD_THEME.spacing.xs,
  },
  emptySubtitle: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  header: {
    marginBottom: IPAD_THEME.spacing.md,
  },
  badgeRow: {
    flexDirection: "row",
    gap: IPAD_THEME.spacing.xs,
    marginBottom: IPAD_THEME.spacing.sm,
  },
  modelName: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
  },
  specSub: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 14,
    marginTop: 2,
  },
  priceCard: {
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
    padding: IPAD_THEME.spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: IPAD_THEME.spacing.md,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.2)",
  },
  priceLabel: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  priceValue: {
    color: IPAD_THEME.colors.accent,
    fontSize: 24,
    fontWeight: "800",
  },
  metaSection: {
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
    padding: IPAD_THEME.spacing.md,
    marginBottom: IPAD_THEME.spacing.lg,
  },
  metaHeader: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: IPAD_THEME.spacing.sm,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: IPAD_THEME.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  metaKey: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
  },
  metaVal: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  metaValMono: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 12,
    fontFamily: "Courier",
    fontWeight: "700",
  },
  metaValSuccess: {
    color: IPAD_THEME.colors.success,
    fontSize: 12,
    fontWeight: "700",
  },
  actionSection: {
    marginTop: IPAD_THEME.spacing.md,
  },
});
