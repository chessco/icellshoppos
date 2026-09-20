import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import type { IInventoryListItem } from "@ireader/contracts";
import { IPAD_THEME } from "../../theme/tokens";
import { useCart } from "../../contexts/CartContext";

import { formatCurrency } from "../../utils/formatters";

interface AppleTouchCardProps {
  item: IInventoryListItem;
}

export function AppleTouchCard({ item }: AppleTouchCardProps) {
  const { items: cartItems, addItem } = useCart();
  const [pulseAnim] = useState(new Animated.Value(1));

  // Determine how many of this item are currently in the cart
  const inCartCount = cartItems.filter((ci) => ci.inventoryItem.id === item.id).length;

  const handlePress = () => {
    // Quick tactile pulse animation
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 0.94, duration: 80, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();

    addItem(item);
  };

  const getDeviceIcon = () => {
    const modelLower = (item.model || "").toLowerCase();
    if (modelLower.includes("iphone")) return "📱";
    if (modelLower.includes("ipad")) return "📟";
    if (modelLower.includes("mac") || modelLower.includes("imac") || modelLower.includes("book")) return "💻";
    if (modelLower.includes("watch")) return "⌚";
    if (modelLower.includes("airpod") || modelLower.includes("headphone") || modelLower.includes("case")) return "🎧";
    return "📦";
  };

  // Safe price number format (Hermes-compatible)
  const formattedPrice = formatCurrency(item.price);

  const displayCapacity = item.capacity || item.storageSize;

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale: pulseAnim }] }]}>
      <TouchableOpacity
        style={[
          styles.card,
          inCartCount > 0 && styles.cardActiveInCart,
        ]}
        onPress={handlePress}
        activeOpacity={0.72}
        accessibilityRole="button"
        accessibilityLabel={`${item.model}, ${displayCapacity || ""}, ${formattedPrice}. Toca para agregar.`}
      >
        {/* Top Badges Row */}
        <View style={styles.topRow}>
          <View style={styles.deviceIconBadge}>
            <Text style={styles.deviceIconText}>{getDeviceIcon()}</Text>
          </View>

          {inCartCount > 0 ? (
            <View style={styles.inCartBadge}>
              <Text style={styles.inCartText}>✓ {inCartCount}</Text>
            </View>
          ) : item.grade ? (
            <View style={styles.gradeBadge}>
              <Text style={styles.gradeText}>{item.grade.toUpperCase()}</Text>
            </View>
          ) : null}
        </View>

        {/* Model Title */}
        <Text style={styles.modelTitle} numberOfLines={2}>
          {item.model}
        </Text>

        {/* Specifications Pills */}
        <View style={styles.specPillsContainer}>
          {Boolean(displayCapacity) && (
            <View style={styles.specPill}>
              <Text style={styles.specPillText}>{displayCapacity}</Text>
            </View>
          )}
          {Boolean(item.carrier) && (
            <View style={[styles.specPill, styles.specPillCarrier]}>
              <Text style={styles.specPillText} numberOfLines={1}>
                {item.carrier}
              </Text>
            </View>
          )}
          {Boolean(item.color) && (
            <View style={styles.specPill}>
              <Text style={styles.specPillText} numberOfLines={1}>
                {item.color}
              </Text>
            </View>
          )}
        </View>

        {/* Bottom Price & Quick Add Button */}
        <View style={styles.bottomRow}>
          <View>
            <Text style={styles.priceLabel}>PRECIO</Text>
            <Text style={styles.priceValue}>{formattedPrice}</Text>
          </View>

          <View style={[styles.addBtnCircle, inCartCount > 0 && styles.addBtnCircleActive]}>
            <Text style={styles.addBtnPlus}>＋</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    margin: IPAD_THEME.spacing.sm,
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: IPAD_THEME.radius.xl,
    padding: IPAD_THEME.spacing.lg,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "space-between",
    minHeight: 180,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  cardActiveInCart: {
    borderColor: IPAD_THEME.colors.accent,
    backgroundColor: "#131f37",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: IPAD_THEME.spacing.sm,
  },
  deviceIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  deviceIconText: {
    fontSize: 20,
  },
  inCartBadge: {
    backgroundColor: IPAD_THEME.colors.accent,
    paddingHorizontal: IPAD_THEME.spacing.md,
    paddingVertical: 4,
    borderRadius: IPAD_THEME.radius.full,
  },
  inCartText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "800",
  },
  gradeBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: IPAD_THEME.spacing.sm,
    paddingVertical: 3,
    borderRadius: IPAD_THEME.radius.sm,
  },
  gradeText: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  modelTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
    marginBottom: IPAD_THEME.spacing.sm,
  },
  specPillsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: IPAD_THEME.spacing.md,
  },
  specPill: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  specPillCarrier: {
    backgroundColor: "rgba(56, 189, 248, 0.12)",
  },
  specPillText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    paddingTop: IPAD_THEME.spacing.sm,
  },
  priceLabel: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  priceValue: {
    color: "#38bdf8",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 1,
  },
  addBtnCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnCircleActive: {
    backgroundColor: IPAD_THEME.colors.accent,
  },
  addBtnPlus: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    marginTop: -1,
  },
});
