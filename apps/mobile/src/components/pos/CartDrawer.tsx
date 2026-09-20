import React from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { IPAD_THEME } from "../../theme/tokens";
import { Button } from "../ui/Button";
import { useCart } from "../../contexts/CartContext";
import { formatCurrency } from "../../utils/formatters";

interface CartDrawerProps {
  onProceedCheckout: () => void;
  onOpenCustomerSelect: () => void;
}

export function CartDrawer({
  onProceedCheckout,
  onOpenCustomerSelect,
}: CartDrawerProps) {
  const {
    items,
    selectedCustomer,
    discountAmount,
    subtotal,
    totalPreview,
    removeItem,
    clearCart,
  } = useCart();

  const hasItems = items.length > 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.title}>Current Order</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{items.length}</Text>
          </View>
        </View>

        {hasItems && (
          <TouchableOpacity
            onPress={clearCart}
            accessibilityRole="button"
            accessibilityLabel="Clear entire cart"
          >
            <Text style={styles.clearText}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Customer Quick Pill */}
      <TouchableOpacity
        style={styles.customerPill}
        onPress={onOpenCustomerSelect}
        accessibilityRole="button"
        accessibilityLabel={
          selectedCustomer
            ? `Customer: ${selectedCustomer.name}`
            : "Assign customer to sale"
        }
      >
        <Text style={styles.customerIcon}>👤</Text>
        <View style={styles.customerInfo}>
          <Text style={styles.customerName} numberOfLines={1}>
            {selectedCustomer ? selectedCustomer.name : "Walk-in Customer"}
          </Text>
          <Text style={styles.customerSub}>
            {selectedCustomer?.phone || "Tap to assign customer / receipt details"}
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      {/* Cart Items List */}
      <ScrollView style={styles.itemsList} contentContainerStyle={styles.itemsContent}>
        {!hasItems ? (
          <View style={styles.emptyCart}>
            <Text style={styles.emptyCartIcon}>🛒</Text>
            <Text style={styles.emptyCartTitle}>Cart is Empty</Text>
            <Text style={styles.emptyCartSubtitle}>
              Tap products in the catalog to add them to this order
            </Text>
          </View>
        ) : (
          items.map((item) => (
            <View key={item.inventoryItem.id} style={styles.itemRow}>
              <View style={styles.itemDetails}>
                <Text style={styles.itemModel}>{item.inventoryItem.model}</Text>
                <Text style={styles.itemImei}>
                  IMEI: {item.inventoryItem.imei || item.inventoryItem.serialNumber || "N/A"}
                </Text>
              </View>
              <View style={styles.itemActions}>
                <Text style={styles.itemPrice}>{formatCurrency(item.salePrice)}</Text>
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => removeItem(item.inventoryItem.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.inventoryItem.model} from cart`}
                >
                  <Text style={styles.removeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Pricing Summary & Checkout Button */}
      <View style={styles.footer}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryVal}>{formatCurrency(subtotal)}</Text>
        </View>

        {discountAmount > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.discountLabel}>Discount Applied</Text>
            <Text style={styles.discountVal}>-{formatCurrency(discountAmount)}</Text>
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Due</Text>
          <Text style={styles.totalVal}>{formatCurrency(totalPreview)}</Text>
        </View>

        <Button
          title={hasItems ? `Checkout • ${formatCurrency(totalPreview)}` : "Select Items to Checkout"}
          variant="primary"
          size="lg"
          disabled={!hasItems}
          onPress={onProceedCheckout}
          style={styles.checkoutBtn}

          accessibilityLabel="Proceed to checkout"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderRadius: IPAD_THEME.radius.lg,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    justifyContent: "space-between",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: IPAD_THEME.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: IPAD_THEME.colors.borderSubtle,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: IPAD_THEME.spacing.sm,
  },
  title: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
  },
  countBadge: {
    backgroundColor: IPAD_THEME.colors.accent,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: IPAD_THEME.radius.full,
  },
  countText: {
    color: "#080c14",
    fontSize: 12,
    fontWeight: "800",
  },
  clearText: {
    color: IPAD_THEME.colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  customerPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    marginHorizontal: IPAD_THEME.spacing.md,
    marginTop: IPAD_THEME.spacing.md,
    padding: IPAD_THEME.spacing.md,
    borderRadius: IPAD_THEME.radius.md,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
  },
  customerIcon: {
    fontSize: 18,
    marginRight: IPAD_THEME.spacing.md,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  customerSub: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  chevron: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 18,
  },
  itemsList: {
    flex: 1,
    paddingHorizontal: IPAD_THEME.spacing.md,
  },
  itemsContent: {
    paddingVertical: IPAD_THEME.spacing.md,
  },
  emptyCart: {
    padding: IPAD_THEME.spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCartIcon: {
    fontSize: 36,
    marginBottom: IPAD_THEME.spacing.sm,
  },
  emptyCartTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  emptyCartSubtitle: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 4,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
    padding: IPAD_THEME.spacing.md,
    marginBottom: IPAD_THEME.spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  itemDetails: {
    flex: 1,
    paddingRight: IPAD_THEME.spacing.sm,
  },
  itemModel: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  itemImei: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    fontFamily: "Courier",
    marginTop: 2,
  },
  itemActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: IPAD_THEME.spacing.md,
  },
  itemPrice: {
    color: IPAD_THEME.colors.accent,
    fontSize: 15,
    fontWeight: "800",
  },
  removeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: IPAD_THEME.colors.dangerMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: {
    color: IPAD_THEME.colors.danger,
    fontSize: 12,
    fontWeight: "800",
  },
  footer: {
    padding: IPAD_THEME.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: IPAD_THEME.colors.borderSubtle,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderBottomLeftRadius: IPAD_THEME.radius.lg,
    borderBottomRightRadius: IPAD_THEME.radius.lg,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  summaryLabel: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
  },
  summaryVal: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  discountLabel: {
    color: IPAD_THEME.colors.success,
    fontSize: 13,
  },
  discountVal: {
    color: IPAD_THEME.colors.success,
    fontSize: 13,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: IPAD_THEME.colors.borderSubtle,
    marginVertical: IPAD_THEME.spacing.sm,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: IPAD_THEME.spacing.md,
  },
  totalLabel: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  totalVal: {
    color: IPAD_THEME.colors.accent,
    fontSize: 22,
    fontWeight: "900",
  },
  checkoutBtn: {
    width: "100%",
  },
});
