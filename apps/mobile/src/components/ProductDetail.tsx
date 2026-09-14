import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { IInventoryListItem } from "@ireader/contracts";
import { useCart } from "../contexts/CartContext.js";
import { IPAD_THEME } from "../theme/tokens.js";

interface ProductDetailProps {
  item: IInventoryListItem | null;
  onClose?: () => void;
}

export function ProductDetail({ item, onClose }: ProductDetailProps) {
  const { addItem, removeItem, hasItem } = useCart();

  if (!item) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No Device Selected</Text>
        <Text style={styles.emptySubtitle}>Select an item from the catalog to inspect details</Text>
      </View>
    );
  }

  const inCart = hasItem(item.id);
  const formattedPrice = typeof item.price === "number" ? `$${item.price.toFixed(2)}` : `$${item.price}`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
          <Text style={styles.modelName}>{item.model}</Text>
          <Text style={styles.variantSubtitle}>
            {[item.capacity, item.color, item.carrier].filter(Boolean).join(" • ")}
          </Text>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.priceLabel}>Retail Price</Text>
        <Text style={styles.priceValue}>{formattedPrice}</Text>
      </View>

      <View style={styles.metaCard}>
        <Text style={styles.metaTitle}>Device Identifiers</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>IMEI</Text>
          <Text style={styles.metaVal}>{item.imei || "Not specified"}</Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>Serial Number</Text>
          <Text style={styles.metaVal}>{item.serialNumber || "Not specified"}</Text>
        </View>

        {item.sku && (
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>SKU</Text>
            <Text style={styles.metaVal}>{item.sku}</Text>
          </View>
        )}

        {item.condition && (
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Condition</Text>
            <Text style={styles.metaVal}>{item.condition}</Text>
          </View>
        )}

        {item.grade && (
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Cosmetic Grade</Text>
            <Text style={styles.metaVal}>{item.grade}</Text>
          </View>
        )}

        {item.batteryHealth && (
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Battery Health</Text>
            <Text style={styles.metaVal}>{item.batteryHealth}%</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.cartActionButton, inCart ? styles.removeFromCart : styles.addToCart]}
        onPress={() => (inCart ? removeItem(item.id) : addItem(item))}
        accessibilityRole="button"
        accessibilityLabel={inCart ? "Remove from Cart" : "Add to Cart"}
      >
        <Text style={styles.cartActionText}>
          {inCart ? "Remove from POS Cart" : "Add to POS Cart"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: IPAD_THEME.spacing.lg,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: IPAD_THEME.spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: IPAD_THEME.colors.textPrimary,
    marginBottom: IPAD_THEME.spacing.xs,
  },
  emptySubtitle: {
    fontSize: 14,
    color: IPAD_THEME.colors.textMuted,
    textAlign: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: IPAD_THEME.spacing.md,
  },
  statusBadge: {
    alignSelf: "flex-start",
    backgroundColor: IPAD_THEME.colors.successMuted,
    paddingHorizontal: IPAD_THEME.spacing.sm,
    paddingVertical: 2,
    borderRadius: IPAD_THEME.radius.sm,
    marginBottom: IPAD_THEME.spacing.xs,
  },
  statusText: {
    color: IPAD_THEME.colors.success,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  modelName: {
    fontSize: 22,
    fontWeight: "800",
    color: IPAD_THEME.colors.textPrimary,
  },
  variantSubtitle: {
    fontSize: 14,
    color: IPAD_THEME.colors.textSecondary,
    marginTop: 2,
  },
  closeButton: {
    padding: IPAD_THEME.spacing.sm,
  },
  closeText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 16,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    padding: IPAD_THEME.spacing.md,
    borderRadius: IPAD_THEME.radius.md,
    marginVertical: IPAD_THEME.spacing.md,
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
  metaCard: {
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
    padding: IPAD_THEME.spacing.md,
    marginBottom: IPAD_THEME.spacing.lg,
  },
  metaTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: IPAD_THEME.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: IPAD_THEME.spacing.sm,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: IPAD_THEME.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  metaKey: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 14,
  },
  metaVal: {
    color: IPAD_THEME.colors.textPrimary,
    fontWeight: "600",
    fontSize: 14,
  },
  cartActionButton: {
    height: IPAD_THEME.touchTarget.largeHeight,
    borderRadius: IPAD_THEME.radius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  addToCart: {
    backgroundColor: IPAD_THEME.colors.accent,
  },
  removeFromCart: {
    backgroundColor: IPAD_THEME.colors.danger,
  },
  cartActionText: {
    color: "#080c14",
    fontWeight: "700",
    fontSize: 16,
  },
});
