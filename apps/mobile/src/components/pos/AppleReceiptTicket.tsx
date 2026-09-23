import React from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { IPAD_THEME } from "../../theme/tokens";
import { useCart } from "../../contexts/CartContext";
import { useCommission } from "../../contexts/CommissionContext";
import { formatCurrency } from "../../utils/formatters";
import { SellerSelectModal } from "./SellerSelectModal";

interface AppleReceiptTicketProps {
  onProceedCheckout: () => void;
  onOpenCustomerSelect: () => void;
  onOpenScanner: () => void;
}

export function AppleReceiptTicket({
  onProceedCheckout,
  onOpenCustomerSelect,
  onOpenScanner,
}: AppleReceiptTicketProps) {
  const {
    items,
    selectedCustomer,
    discountAmount,
    subtotal,
    totalPreview,
    removeItem,
    clearCart,
  } = useCart();
  const { activeSeller, calculateEstimate } = useCommission();
  const [isSellerModalOpen, setIsSellerModalOpen] = React.useState(false);

  const commissionSummary = React.useMemo(() => {
    return calculateEstimate(items);
  }, [calculateEstimate, items]);

  const customerDisplay = selectedCustomer?.name || "Cliente Mostrador";

  return (
    <View style={styles.container}>
      {/* Ticket Header */}
      <View style={styles.header}>
        <View>
          <View style={styles.badgeRow}>
            <Text style={styles.ticketBadge}>TICKET DE VENTA</Text>
            <Text style={styles.itemCountText}>
              {items.length} {items.length === 1 ? "artículo" : "artículos"}
            </Text>
          </View>
          <Text style={styles.ticketTitle}>Detalle de Cobro</Text>
        </View>

        {items.length > 0 && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={clearCart}
            accessibilityRole="button"
            accessibilityLabel="Vaciar ticket"
          >
            <Text style={styles.clearBtnText}>Vaciar</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Participants Bar: Customer + Seller */}
      <View style={styles.participantsRow}>
        {/* Customer Card */}
        <TouchableOpacity
          style={styles.participantCard}
          onPress={onOpenCustomerSelect}
          accessibilityRole="button"
          accessibilityLabel={`Cliente: ${customerDisplay}. Toca para cambiar.`}
        >
          <View style={styles.customerIconCircle}>
            <Text style={styles.customerIcon}>👤</Text>
          </View>
          <View style={styles.participantInfo}>
            <Text style={styles.participantLabel}>CLIENTE</Text>
            <Text style={styles.participantName} numberOfLines={1}>
              {customerDisplay}
            </Text>
          </View>
          <Text style={styles.participantChangeText}>›</Text>
        </TouchableOpacity>

        {/* Seller Card */}
        <TouchableOpacity
          style={styles.participantCard}
          onPress={() => setIsSellerModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Vendedor: ${activeSeller.name}. Toca para cambiar.`}
        >
          <View style={[styles.sellerIconCircle, { backgroundColor: activeSeller.avatarColor || "#6366f1" }]}>
            <Text style={styles.sellerIcon}>🤝</Text>
          </View>
          <View style={styles.participantInfo}>
            <Text style={styles.participantLabel}>VENDEDOR</Text>
            <Text style={styles.participantName} numberOfLines={1}>
              {activeSeller.name}
            </Text>
          </View>
          <Text style={styles.participantChangeText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Items Scrollable List */}
      <View style={styles.itemsContainer}>
        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🛍️</Text>
            <Text style={styles.emptyTitle}>Ticket Vacío</Text>
            <Text style={styles.emptySubtitle}>
              Toca cualquier producto de la cuadrícula o escanea un código para comenzar la venta.
            </Text>
            <TouchableOpacity style={styles.emptyScanBtn} onPress={onOpenScanner}>
              <Text style={styles.emptyScanText}>📷 Escanear con Cámara</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            style={styles.itemsList}
            contentContainerStyle={styles.itemsListContent}
            showsVerticalScrollIndicator={false}
          >
            {items.map((cartItem) => {
              const inv = cartItem.inventoryItem;
              const displayCapacity = inv.capacity || (inv as unknown as { storageSize?: string }).storageSize;
              return (
                <View key={inv.id} style={styles.itemRow}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemModel} numberOfLines={1}>
                      {inv.model}
                    </Text>
                    <View style={styles.itemSpecsRow}>
                      {Boolean(displayCapacity) && (
                        <Text style={styles.itemSpecBadge}>{displayCapacity}</Text>
                      )}
                      {Boolean(inv.carrier) && (
                        <Text style={styles.itemSpecBadge}>{inv.carrier}</Text>
                      )}
                      {Boolean(inv.imei) && (
                        <Text style={styles.itemImeiText}>IMEI: …{inv.imei?.slice(-6)}</Text>
                      )}
                    </View>
                    <Text style={styles.itemUnitRate}>
                      {formatCurrency(cartItem.salePrice)}
                    </Text>
                  </View>

                  {/* Actions: Price and Remove */}
                  <View style={styles.itemActions}>
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => removeItem(inv.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Eliminar ${inv.model} del ticket`}
                    >
                      <Text style={styles.removeText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Quick Scanner Bar */}
      <View style={styles.quickBar}>
        <TouchableOpacity
          style={styles.quickScanBtn}
          onPress={onOpenScanner}
          accessibilityRole="button"
          accessibilityLabel="Abrir escáner de cámara"
        >
          <Text style={styles.quickScanBtnText}>📷 Escanear IMEI / Código</Text>
        </TouchableOpacity>
      </View>

      {/* Financial Summary Box */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryVal}>
            {formatCurrency(subtotal)} MXN
          </Text>
        </View>

        {discountAmount > 0 && (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, styles.discountText]}>Descuento</Text>
            <Text style={[styles.summaryVal, styles.discountText]}>
              -{formatCurrency(discountAmount)} MXN
            </Text>
          </View>
        )}

        <View style={styles.totalRow}>
          <View>
            <Text style={styles.totalLabel}>TOTAL A COBRAR</Text>
            <Text style={styles.currencyBadge}>MXN IVA Incluido</Text>
          </View>
          <Text style={styles.totalVal}>
            {formatCurrency(totalPreview)}
          </Text>
        </View>

        {/* Estimated commission for seller */}
        {commissionSummary.totalCommission > 0 && (
          <View style={styles.commissionSummaryRow}>
            <View style={styles.commissionLabelBox}>
              <Text style={styles.commissionIcon}>💰</Text>
              <Text style={styles.commissionLabel}>
                Comisión Vendedor ({activeSeller.name.split(" ")[0]}):
              </Text>
            </View>
            <Text style={styles.commissionVal}>
              +{formatCurrency(commissionSummary.totalCommission)} MXN
            </Text>
          </View>
        )}

        {/* Primary Checkout Button */}
        <TouchableOpacity
          style={[styles.checkoutBtn, items.length === 0 && styles.checkoutBtnDisabled]}
          onPress={onProceedCheckout}
          disabled={items.length === 0}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Cobrar ${formatCurrency(totalPreview)}`}
        >
          <Text style={styles.checkoutBtnText}>
            {items.length === 0
              ? "Agrega productos para cobrar"
              : `Cobrar ${formatCurrency(totalPreview)} MXN ›`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Seller Select Modal */}
      <SellerSelectModal
        visible={isSellerModalOpen}
        onClose={() => setIsSellerModalOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d131f",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "space-between",
  },
  header: {
    paddingHorizontal: IPAD_THEME.spacing.lg,
    paddingTop: IPAD_THEME.spacing.md,
    paddingBottom: IPAD_THEME.spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  ticketBadge: {
    color: IPAD_THEME.colors.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  itemCountText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  ticketTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 20,
    fontWeight: "900",
  },
  clearBtn: {
    paddingHorizontal: IPAD_THEME.spacing.md,
    paddingVertical: 6,
    borderRadius: IPAD_THEME.radius.sm,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
  },
  clearBtnText: {
    color: "#f87171",
    fontSize: 12,
    fontWeight: "700",
  },
  participantsRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: IPAD_THEME.spacing.lg,
    marginTop: IPAD_THEME.spacing.md,
  },
  participantCard: {
    flex: 1,
    padding: 10,
    borderRadius: IPAD_THEME.radius.lg,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.07)",
    flexDirection: "row",
    alignItems: "center",
  },
  customerIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  customerIcon: {
    fontSize: 13,
  },
  sellerIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  sellerIcon: {
    fontSize: 13,
  },
  participantInfo: {
    flex: 1,
  },
  participantLabel: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  participantName: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 1,
  },
  participantChangeText: {
    color: "#38bdf8",
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 4,
  },
  itemsContainer: {
    flex: 1,
    marginTop: IPAD_THEME.spacing.sm,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: IPAD_THEME.spacing.xl,
  },
  emptyIcon: {
    fontSize: 44,
    marginBottom: IPAD_THEME.spacing.sm,
  },
  emptyTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 4,
  },
  emptySubtitle: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: IPAD_THEME.spacing.lg,
  },
  emptyScanBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: IPAD_THEME.spacing.lg,
    paddingVertical: 10,
    borderRadius: IPAD_THEME.radius.full,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  emptyScanText: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  itemsList: {
    flex: 1,
  },
  itemsListContent: {
    paddingHorizontal: IPAD_THEME.spacing.lg,
    paddingVertical: IPAD_THEME.spacing.xs,
    gap: IPAD_THEME.spacing.sm,
  },
  itemRow: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: IPAD_THEME.radius.lg,
    padding: IPAD_THEME.spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemInfo: {
    flex: 1,
    marginRight: IPAD_THEME.spacing.sm,
  },
  itemModel: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
  itemSpecsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  itemSpecBadge: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  itemImeiText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 10,
    fontFamily: "monospace",
  },
  itemUnitRate: {
    color: "#38bdf8",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
  itemActions: {
    alignItems: "flex-end",
  },
  itemPriceText: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 6,
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: IPAD_THEME.radius.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  stepperBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperText: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  stepperQuantity: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 8,
  },
  removeBtn: {
    width: 26,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255, 255, 255, 0.08)",
  },
  removeText: {
    color: "#f87171",
    fontSize: 12,
    fontWeight: "800",
  },
  quickBar: {
    paddingHorizontal: IPAD_THEME.spacing.lg,
    paddingVertical: 6,
  },
  quickScanBtn: {
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.25)",
    paddingVertical: 8,
    borderRadius: IPAD_THEME.radius.md,
    alignItems: "center",
  },
  quickScanBtnText: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: "700",
  },
  summaryContainer: {
    backgroundColor: "#090d16",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    padding: IPAD_THEME.spacing.lg,
    gap: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  summaryVal: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  discountText: {
    color: "#34d399",
  },
  commissionSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(56, 189, 248, 0.08)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: IPAD_THEME.radius.md,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.2)",
  },
  commissionLabelBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  commissionIcon: {
    fontSize: 12,
  },
  commissionLabel: {
    color: "#38bdf8",
    fontSize: 11,
    fontWeight: "800",
  },
  commissionVal: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: "900",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    paddingTop: IPAD_THEME.spacing.sm,
    marginTop: 2,
  },
  totalLabel: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  currencyBadge: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: "600",
    marginTop: 1,
  },
  totalVal: {
    color: "#38bdf8",
    fontSize: 26,
    fontWeight: "900",
  },
  checkoutBtn: {
    backgroundColor: IPAD_THEME.colors.accent,
    borderRadius: IPAD_THEME.radius.xl,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    shadowColor: IPAD_THEME.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  checkoutBtnDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    shadowOpacity: 0,
  },
  checkoutBtnText: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
});
