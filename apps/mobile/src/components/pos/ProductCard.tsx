import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { IInventoryListItem } from "@ireader/contracts";
import { IPAD_THEME } from "../../theme/tokens";
import { Badge } from "../ui/Badge";
import { formatCurrency } from "../../utils/formatters";

interface ProductCardProps {
  item: IInventoryListItem;
  isSelected?: boolean;
  isInCart?: boolean;
  onSelect: (item: IInventoryListItem) => void;
  onQuickAdd?: (item: IInventoryListItem) => void;
}

export const ProductCard = React.memo(function ProductCard({
  item,
  isSelected = false,
  isInCart = false,
  onSelect,
  onQuickAdd,
}: ProductCardProps) {
  const formattedPrice = formatCurrency(item.price);

  const specString = [item.capacity, item.color, item.carrier].filter(Boolean).join(" • ");

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isSelected && styles.cardSelected,
        isInCart && styles.cardInCart,
      ]}
      onPress={() => onSelect(item)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${item.model}, ${specString}, Price ${formattedPrice}`}
    >
      <View style={styles.leftInfo}>
        <View style={styles.titleRow}>
          <Text style={styles.modelName} numberOfLines={1}>
            {item.model}
          </Text>
          {item.grade && (
            <Badge label={`Grade ${item.grade}`} variant="default" />
          )}
          {isInCart && (
            <Badge label="IN CART" variant="accent" />
          )}
        </View>

        {specString.length > 0 && (
          <Text style={styles.specs} numberOfLines={1}>
            {specString}
          </Text>
        )}

        <View style={styles.identifierRow}>
          {item.imei ? (
            <Text style={styles.imeiText}>IMEI: {item.imei}</Text>
          ) : item.serialNumber ? (
            <Text style={styles.imeiText}>S/N: {item.serialNumber}</Text>
          ) : null}
          {item.batteryHealth ? (
            <Text style={styles.batteryText}>🔋 {item.batteryHealth}%</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.rightAction}>
        <Text style={styles.price}>{formattedPrice}</Text>
        {onQuickAdd && (
          <TouchableOpacity
            style={[styles.quickAddBtn, isInCart && styles.quickAddBtnInCart]}
            onPress={(e) => {
              e.stopPropagation();
              onQuickAdd(item);
            }}
            accessibilityRole="button"
            accessibilityLabel={isInCart ? "Remove item from cart" : "Quick add to cart"}
          >
            <Text style={[styles.quickAddText, isInCart && styles.quickAddTextInCart]}>
              {isInCart ? "✕ Remove" : "+ Add"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
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
  cardSelected: {
    borderColor: IPAD_THEME.colors.accent,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
  },
  cardInCart: {
    borderLeftWidth: 4,
    borderLeftColor: IPAD_THEME.colors.accent,
  },
  leftInfo: {
    flex: 1,
    paddingRight: IPAD_THEME.spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: IPAD_THEME.spacing.sm,
    marginBottom: 3,
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
  identifierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: IPAD_THEME.spacing.md,
  },
  imeiText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    fontFamily: "Courier",
  },
  batteryText: {
    color: IPAD_THEME.colors.success,
    fontSize: 11,
    fontWeight: "600",
  },
  rightAction: {
    alignItems: "flex-end",
    gap: IPAD_THEME.spacing.xs,
  },
  price: {
    color: IPAD_THEME.colors.accent,
    fontSize: 17,
    fontWeight: "800",
  },
  quickAddBtn: {
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.accent,
    paddingHorizontal: IPAD_THEME.spacing.md,
    paddingVertical: 4,
    borderRadius: IPAD_THEME.radius.sm,
    minHeight: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  quickAddBtnInCart: {
    backgroundColor: IPAD_THEME.colors.dangerMuted,
    borderColor: IPAD_THEME.colors.danger,
  },
  quickAddText: {
    color: IPAD_THEME.colors.accent,
    fontSize: 12,
    fontWeight: "700",
  },
  quickAddTextInCart: {
    color: IPAD_THEME.colors.danger,
  },
});
