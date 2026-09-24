import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { IPAD_THEME } from "../../theme/tokens";
import { ConnectivityBadge, type ConnectivityState } from "../ui/ConnectivityBadge";
import { useCart } from "../../contexts/CartContext";
import { usePosLayout } from "../../contexts/PosLayoutContext";
import { formatCurrency } from "../../utils/formatters";

interface IPadHeaderProps {
  title: string;
  subtitle?: string;
  connectivityState: ConnectivityState;
  onRetryConnection?: () => void;
  scannerStatus?: string;
  onToggleSidebar?: () => void;
  onOpenCart?: () => void;
  showCartButton?: boolean;
  onOpenMessages?: () => void;
  unreadMessagesCount?: number;
}

export function IPadHeader({
  title,
  subtitle,
  connectivityState,
  onRetryConnection,
  scannerStatus = "READY",
  onToggleSidebar,
  onOpenCart,
  showCartButton = false,
  onOpenMessages,
  unreadMessagesCount,
}: IPadHeaderProps) {
  const { items, subtotal } = useCart();
  const { layoutMode, setLayoutMode } = usePosLayout();

  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        {onToggleSidebar && (
          <TouchableOpacity
            style={styles.sidebarToggle}
            onPress={onToggleSidebar}
            accessibilityRole="button"
            accessibilityLabel="Toggle navigation sidebar"
          >
            <Text style={styles.toggleIcon}>☰</Text>
          </TouchableOpacity>
        )}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>

      <View style={styles.rightSection}>
        {/* POS Mode Switcher (Visible on Point of Sale) */}
        {title === "Point of Sale" && (
          <View style={styles.modeSwitcherContainer}>
            <TouchableOpacity
              style={[styles.modeBtn, layoutMode === "apple_touch" && styles.modeBtnActive]}
              onPress={() => setLayoutMode("apple_touch")}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Modo POS Táctil Apple"
            >
              <Text style={[styles.modeBtnText, layoutMode === "apple_touch" && styles.modeBtnTextActive]}>
                📱 Táctil POS
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeBtn, layoutMode === "classic" && styles.modeBtnActive]}
              onPress={() => setLayoutMode("classic")}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Modo Catálogo Web"
            >
              <Text style={[styles.modeBtnText, layoutMode === "classic" && styles.modeBtnTextActive]}>
                🖥️ Catálogo Web
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <ConnectivityBadge state={connectivityState} onRetry={onRetryConnection} />

        <View style={styles.hardwareBadge}>
          <Text style={styles.hardwareText}>📷 {scannerStatus}</Text>
        </View>

        {onOpenMessages && (
          <TouchableOpacity
            style={styles.messagingBtn}
            onPress={onOpenMessages}
            accessibilityRole="button"
            accessibilityLabel="Abrir mensajería de clientes"
            activeOpacity={0.7}
          >
            <Text style={styles.messagingIcon}>✉️</Text>
            {unreadMessagesCount !== undefined && unreadMessagesCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadMessagesCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {showCartButton && onOpenCart && (
          <TouchableOpacity
            style={styles.cartBtn}
            onPress={onOpenCart}
            accessibilityRole="button"
            accessibilityLabel={`Cart with ${items.length} items, subtotal ${formatCurrency(subtotal)}`}
          >
            <Text style={styles.cartIcon}>🛒</Text>
            <Text style={styles.cartCount}>{items.length}</Text>
            <Text style={styles.cartTotal}>{formatCurrency(subtotal)}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 56,
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderBottomWidth: 1,
    borderBottomColor: IPAD_THEME.colors.borderSubtle,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: IPAD_THEME.spacing.lg,
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: IPAD_THEME.spacing.md,
  },
  sidebarToggle: {
    width: 36,
    height: 36,
    borderRadius: IPAD_THEME.radius.sm,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleIcon: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  titleContainer: {
    justifyContent: "center",
  },
  title: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  subtitle: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: IPAD_THEME.spacing.md,
  },
  hardwareBadge: {
    paddingHorizontal: IPAD_THEME.spacing.sm,
    paddingVertical: 3,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.sm,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
  },
  hardwareText: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  cartBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: IPAD_THEME.colors.accentMuted,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.accent,
    borderRadius: IPAD_THEME.radius.md,
    paddingHorizontal: IPAD_THEME.spacing.md,
    height: 36,
    gap: IPAD_THEME.spacing.xs,
  },
  cartIcon: {
    fontSize: 14,
  },
  cartCount: {
    backgroundColor: IPAD_THEME.colors.accent,
    color: "#080c14",
    fontWeight: "800",
    fontSize: 11,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
  },
  cartTotal: {
    color: IPAD_THEME.colors.accent,
    fontWeight: "800",
    fontSize: 13,
  },
  modeSwitcherContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderRadius: IPAD_THEME.radius.full,
    padding: 3,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginRight: IPAD_THEME.spacing.sm,
  },
  modeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: IPAD_THEME.radius.full,
  },
  modeBtnActive: {
    backgroundColor: IPAD_THEME.colors.accent,
  },
  modeBtnText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  modeBtnTextActive: {
    color: "#0f172a",
    fontWeight: "900",
  },
  messagingBtn: {
    width: 36,
    height: 36,
    borderRadius: IPAD_THEME.radius.sm,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderWidth: 1.5,
    borderColor: "#f59e0b",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  messagingIcon: {
    fontSize: 16,
  },
  unreadBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#ef4444",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: IPAD_THEME.colors.surfacePrimary,
  },
  unreadBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },
});
