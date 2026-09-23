import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import type { AppleModelGroup } from "../../utils/appleCatalogGrouping";
import { IPAD_THEME } from "../../theme/tokens";
import { useCart } from "../../contexts/CartContext";
import { formatCurrency } from "../../utils/formatters";

interface AppleTouchCardProps {
  group: AppleModelGroup;
  onPressGroup: (group: AppleModelGroup) => void;
}

export function AppleTouchCard({ group, onPressGroup }: AppleTouchCardProps) {
  const { items: cartItems } = useCart();
  const [pulseAnim] = useState(new Animated.Value(1));

  if (!group || !group.modelKey) {
    return null;
  }

  // Determinar cuántas unidades de este modelo ya están en el ticket
  const inCartCount = (cartItems || []).filter(
    (ci) => (ci?.inventoryItem?.model || "").toLowerCase() === group.modelKey
  ).length;

  const isSingleItem = group.items?.length === 1;

  const handlePress = () => {
    // Animación táctil suave
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 0.95, duration: 70, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();

    onPressGroup(group);
  };

  const getDeviceIcon = () => {
    switch (group.deviceType) {
      case "iphone":
        return "📱";
      case "ipad":
        return "📟";
      case "mac":
        return "💻";
      case "watch":
        return "⌚";
      default:
        return "📦";
    }
  };

  const formattedMinPrice = formatCurrency(group.minPrice);

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale: pulseAnim }] }]}>
      <TouchableOpacity
        style={[styles.card, inCartCount > 0 && styles.cardActiveInCart]}
        onPress={handlePress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${group.modelName}, ${group.totalAvailable} disponibles, ${isSingleItem ? "precio" : "desde"} ${formattedMinPrice}. ${isSingleItem ? "Toca para agregar al carrito de inmediato." : "Toca para configurar."}`}
      >
        {/* Fila Superior: Badges y Estado */}
        <View style={styles.topRow}>
          <View style={styles.topLeft}>
            <View style={styles.deviceIconBadge}>
              <Text style={styles.deviceIconText}>{getDeviceIcon()}</Text>
            </View>
            {group.isBestseller && (
              <View style={styles.bestsellerBadge}>
                <Text style={styles.bestsellerBadgeText}>
                  {group.bestsellerBadgeText || "⭐ MÁS VENDIDO"}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.topRight}>
            {inCartCount > 0 ? (
              <View style={styles.inCartBadge}>
                <Text style={styles.inCartText}>✓ {inCartCount} en ticket</Text>
              </View>
            ) : (
              <View style={styles.stockBadge}>
                <Text style={styles.stockText}>{group.totalAvailable} disp.</Text>
              </View>
            )}
          </View>
        </View>

        {/* Título del Modelo */}
        <Text style={styles.modelTitle} numberOfLines={2}>
          {group.modelName}
        </Text>

        {/* Fila de Muestras de Color Oficiales (Apple Color Dots) */}
        <View style={styles.swatchesRow}>
          {group.colors.slice(0, 5).map((c) => (
            <View
              key={c.name}
              style={[styles.colorDot, { backgroundColor: c.hex }]}
              accessibilityLabel={`Color ${c.name}`}
            />
          ))}
          {group.colors.length > 5 && (
            <Text style={styles.extraColorsText}>+{group.colors.length - 5}</Text>
          )}

          {/* Chips de Capacidades */}
          <View style={styles.capacitiesMiniRow}>
            {group.capacities.slice(0, 3).map((cap) => (
              <View key={cap} style={styles.capacityMiniPill}>
                <Text style={styles.capacityMiniText}>{cap}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Fila Inferior: Precio Desde y Botón de Acción */}
        <View style={styles.bottomRow}>
          <View>
            <Text style={styles.priceLabel}>{isSingleItem ? "PRECIO" : "DESDE"}</Text>
            <Text style={styles.priceValue}>{formattedMinPrice}</Text>
          </View>

          <View style={[styles.chooseBtn, inCartCount > 0 && styles.chooseBtnActive]}>
            <Text style={[styles.chooseBtnText, inCartCount > 0 && styles.chooseBtnTextActive]}>
              {inCartCount > 0 ? "✓ En ticket" : isSingleItem ? "+ Agregar" : "Elegir ›"}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    margin: 6,
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: IPAD_THEME.radius.lg,
    padding: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "space-between",
    minHeight: 154,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  cardActiveInCart: {
    borderColor: IPAD_THEME.colors.accent,
    backgroundColor: "#131f37",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  topLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  topRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  deviceIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  deviceIconText: {
    fontSize: 15,
  },
  bestsellerBadge: {
    backgroundColor: "rgba(245, 158, 11, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bestsellerBadgeText: {
    color: "#f59e0b",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  inCartBadge: {
    backgroundColor: IPAD_THEME.colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: IPAD_THEME.radius.full,
  },
  inCartText: {
    color: "#0f172a",
    fontSize: 10,
    fontWeight: "900",
  },
  stockBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  stockText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
  },
  modelTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19,
    marginBottom: 6,
  },
  swatchesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 8,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  extraColorsText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
  },
  capacitiesMiniRow: {
    flexDirection: "row",
    gap: 4,
    marginLeft: "auto",
  },
  capacityMiniPill: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  capacityMiniText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 9,
    fontWeight: "700",
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    paddingTop: 6,
  },
  priceLabel: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  priceValue: {
    color: "#38bdf8",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 1,
  },
  chooseBtn: {
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: IPAD_THEME.radius.full,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.3)",
  },
  chooseBtnActive: {
    backgroundColor: IPAD_THEME.colors.accent,
    borderColor: IPAD_THEME.colors.accent,
  },
  chooseBtnText: {
    color: "#38bdf8",
    fontSize: 11,
    fontWeight: "800",
  },
  chooseBtnTextActive: {
    color: "#0f172a",
    fontWeight: "900",
  },
});
