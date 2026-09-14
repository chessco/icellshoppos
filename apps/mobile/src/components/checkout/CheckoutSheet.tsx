import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import { useCart } from "../../contexts/CartContext";
import { CheckoutApplicationService, normalizeWhatsappPhone } from "@ireader/application";
import type { BackendSaleCreatedResponse } from "@ireader/contracts";
import { IPAD_THEME } from "../../theme/tokens";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { MobilePrinterService } from "../../services/PrinterService";

interface CheckoutSheetProps {
  onSuccess: (result: BackendSaleCreatedResponse) => void;
  onCancel: () => void;
}

const PAYMENT_METHODS = [
  { id: "Cash", label: "Cash", icon: "💵", description: "Direct cash payment in store" },
  { id: "Card", label: "Card / POS", icon: "💳", description: "External POS / Terminal payment" },
  { id: "Transfer", label: "SPEI / Bank", icon: "🏦", description: "Electronic bank transfer" },
  { id: "Credit", label: "Store Credit", icon: "📝", description: "Charge to customer credit balance" },
  { id: "Other", label: "Other", icon: "🏷️", description: "Trade-in or custom split" },
] as const;

export function CheckoutSheet({ onSuccess, onCancel }: CheckoutSheetProps) {
  const { apiClient, session } = useAuth();
  const {
    items,
    selectedCustomer,
    discountAmount,
    subtotal,
    totalPreview,
    clearCart,
  } = useCart();

  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [customerName, setCustomerName] = useState(selectedCustomer?.name || "");
  const [customerPhone, setCustomerPhone] = useState(selectedCustomer?.phone || "");
  const [customerEmail, setCustomerEmail] = useState(selectedCustomer?.email || "");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkoutService = React.useMemo(
    () => new CheckoutApplicationService(apiClient),
    [apiClient]
  );

  const printerService = React.useMemo(() => new MobilePrinterService(), []);

  const handleCompleteSale = async () => {
    // 1. Guard against double-tap / concurrent submission
    if (isSubmitting) return;

    if (!items || items.length === 0) {
      setErrorMessage("Cannot complete checkout: Cart is empty.");
      return;
    }

    if (!customerName.trim()) {
      setErrorMessage("Customer name is required for authoritative record.");
      return;
    }

    const phoneNorm = normalizeWhatsappPhone(customerPhone);
    if (!phoneNorm.valid) {
      setErrorMessage(phoneNorm.error || "Customer WhatsApp with country code is required.");
      return;
    }

    if (paymentMethod === "Credit" && !selectedCustomer?.creditEnabled) {
      setErrorMessage(
        "Credit payment requires a registered customer with Credit Enabled by admin."
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const salePayload = {
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim().toLowerCase() || undefined,
      customerWhatsapp: phoneNorm.normalized,
      sendReceiptEmail: Boolean(customerEmail.trim()),
      paymentMethod,
      paymentBreakdown: { [paymentMethod]: totalPreview },
      notes: notes.trim() || undefined,
      soldBy: session?.email || "iPad POS",
      items: items.map((i) => ({
        inventoryItemId: i.inventoryItem.id,
        imei: i.inventoryItem.imei || i.inventoryItem.serialNumber || i.inventoryItem.id,
        salePrice: i.salePrice,
      })),
    };

    try {
      const res = await checkoutService.processBackendSale(salePayload);
      if (!res.ok || !res.data) {
        setErrorMessage(res.error || "Failed to process sale on server.");
        return;
      }

      // Print thermal receipt stub asynchronously (separate failure boundary)
      void printerService.printReceipt({
        saleId: res.data.saleId || res.data.saleNumber || "POS-SALE",
        customerName: customerName.trim(),
        items: items.map((i) => ({
          model: i.inventoryItem.model,
          imei: i.inventoryItem.imei || undefined,
          salePrice: i.salePrice,
        })),
        totalAmount: totalPreview,
        paymentMethod,
        createdAt: new Date().toISOString(),
      });

      clearCart();
      onSuccess(res.data);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Network error during checkout. Please verify connection and retry."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Finalize POS Sale</Text>
          <Text style={styles.subtitle}>
            Order containing {items.length} device{items.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onCancel}
          style={styles.cancelBtn}
          accessibilityRole="button"
          accessibilityLabel="Cancel checkout"
        >
          <Text style={styles.cancelText}>✕ Cancel</Text>
        </TouchableOpacity>
      </View>

      {errorMessage && (
        <View style={styles.errorAlert} accessibilityRole="alert">
          <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
        </View>
      )}

      {/* 2-Column Split inside Sheet on iPad */}
      <View style={styles.grid}>
        {/* Left Column: Order Review */}
        <View style={styles.colLeft}>
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Order Summary</Text>
            {items.map((it) => (
              <View key={it.inventoryItem.id} style={styles.itemRow}>
                <View style={styles.itemMeta}>
                  <Text style={styles.itemModel}>{it.inventoryItem.model}</Text>
                  <Text style={styles.itemImei}>
                    IMEI: {it.inventoryItem.imei || it.inventoryItem.serialNumber || "—"}
                  </Text>
                </View>
                <Text style={styles.itemPrice}>${it.salePrice.toFixed(2)}</Text>
              </View>
            ))}

            <View style={styles.divider} />

            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Subtotal</Text>
              <Text style={styles.calcVal}>${subtotal.toFixed(2)}</Text>
            </View>

            {discountAmount > 0 && (
              <View style={styles.calcRow}>
                <Text style={styles.discountLabel}>Discount</Text>
                <Text style={styles.discountVal}>-${discountAmount.toFixed(2)}</Text>
              </View>
            )}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Due</Text>
              <Text style={styles.totalVal}>${totalPreview.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Right Column: Customer & Payment Method */}
        <View style={styles.colRight}>
          {/* Customer Details */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardHeader}>Customer / Receipt Info</Text>
              {selectedCustomer?.creditEnabled && (
                <Badge label="CREDIT APPROVED" variant="success" />
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Customer Full Name *</Text>
              <TextInput
                style={styles.input}
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="Full Name"
                placeholderTextColor={IPAD_THEME.colors.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>WhatsApp Phone (with country code) *</Text>
              <TextInput
                style={styles.input}
                value={customerPhone}
                onChangeText={setCustomerPhone}
                placeholder="+52 55 1234 5678"
                placeholderTextColor={IPAD_THEME.colors.textMuted}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email Receipt (Optional)</Text>
              <TextInput
                style={styles.input}
                value={customerEmail}
                onChangeText={setCustomerEmail}
                placeholder="customer@domain.com"
                placeholderTextColor={IPAD_THEME.colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Payment Method */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Select Payment Method</Text>
            <View style={styles.paymentGrid}>
              {PAYMENT_METHODS.map((m) => {
                const isSelected = paymentMethod === m.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.paymentBtn, isSelected && styles.paymentBtnSelected]}
                    onPress={() => setPaymentMethod(m.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Payment method ${m.label}`}
                  >
                    <Text style={styles.paymentIcon}>{m.icon}</Text>
                    <Text
                      style={[
                        styles.paymentText,
                        isSelected && styles.paymentTextSelected,
                      ]}
                    >
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Internal Notes / POS Reference</Text>
              <TextInput
                style={styles.input}
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. Card Auth #12345 or Transfer Ref"
                placeholderTextColor={IPAD_THEME.colors.textMuted}
              />
            </View>
          </View>

          {/* Complete Button */}
          <Button
            title={`Confirm & Charge $${totalPreview.toFixed(2)}`}
            variant="success"
            size="lg"
            loading={isSubmitting}
            onPress={handleCompleteSale}
            style={styles.completeBtn}
            accessibilityLabel={`Confirm and charge $${totalPreview.toFixed(2)}`}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.background,
  },
  content: {
    padding: IPAD_THEME.spacing.xxl,
    maxWidth: 1080,
    alignSelf: "center",
    width: "100%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: IPAD_THEME.spacing.xl,
  },
  title: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 26,
    fontWeight: "900",
  },
  subtitle: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 14,
    marginTop: 2,
  },
  cancelBtn: {
    paddingHorizontal: IPAD_THEME.spacing.md,
    paddingVertical: IPAD_THEME.spacing.sm,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
  },
  cancelText: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 14,
    fontWeight: "700",
  },
  errorAlert: {
    backgroundColor: IPAD_THEME.colors.dangerMuted,
    borderColor: IPAD_THEME.colors.danger,
    borderWidth: 1,
    borderRadius: IPAD_THEME.radius.md,
    padding: IPAD_THEME.spacing.md,
    marginBottom: IPAD_THEME.spacing.lg,
  },
  errorText: {
    color: IPAD_THEME.colors.danger,
    fontSize: 14,
    fontWeight: "700",
  },
  grid: {
    flexDirection: "row",
    gap: IPAD_THEME.spacing.xl,
  },
  colLeft: {
    flex: 1,
  },
  colRight: {
    flex: 1.2,
    gap: IPAD_THEME.spacing.lg,
  },
  card: {
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderRadius: IPAD_THEME.radius.lg,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    padding: IPAD_THEME.spacing.lg,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: IPAD_THEME.spacing.md,
  },
  cardHeader: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: IPAD_THEME.spacing.xs,
  },
  itemMeta: {
    flex: 1,
  },
  itemModel: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  itemImei: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    fontFamily: "Courier",
  },
  itemPrice: {
    color: IPAD_THEME.colors.accent,
    fontSize: 15,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: IPAD_THEME.colors.borderSubtle,
    marginVertical: IPAD_THEME.spacing.md,
  },
  calcRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  calcLabel: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
  },
  calcVal: {
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
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: IPAD_THEME.spacing.sm,
  },
  totalLabel: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 17,
    fontWeight: "800",
  },
  totalVal: {
    color: IPAD_THEME.colors.accent,
    fontSize: 24,
    fontWeight: "900",
  },
  inputGroup: {
    marginBottom: IPAD_THEME.spacing.md,
  },
  inputLabel: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: IPAD_THEME.spacing.xs,
    textTransform: "uppercase",
  },
  input: {
    height: IPAD_THEME.touchTarget.minHeight,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    paddingHorizontal: IPAD_THEME.spacing.md,
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 14,
  },
  paymentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: IPAD_THEME.spacing.sm,
    marginBottom: IPAD_THEME.spacing.md,
  },
  paymentBtn: {
    flexBasis: "30%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: IPAD_THEME.spacing.xs,
    height: IPAD_THEME.touchTarget.minHeight,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    borderRadius: IPAD_THEME.radius.md,
    paddingHorizontal: IPAD_THEME.spacing.sm,
  },
  paymentBtnSelected: {
    backgroundColor: IPAD_THEME.colors.accent,
    borderColor: IPAD_THEME.colors.accent,
  },
  paymentIcon: {
    fontSize: 16,
  },
  paymentText: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  paymentTextSelected: {
    color: "#080c14",
  },
  completeBtn: {
    marginTop: IPAD_THEME.spacing.sm,
  },
});
