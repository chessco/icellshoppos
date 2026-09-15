import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import { CheckoutApplicationService } from "@ireader/application";
import type { BackendSaleCreatedResponse } from "@ireader/contracts";
import { IPAD_THEME } from "../theme/tokens";
import { MobilePrinterService } from "../services/PrinterService";

interface CheckoutViewProps {
  onSuccess: (result: BackendSaleCreatedResponse) => void;
  onCancel: () => void;
}

const PAYMENT_METHODS = ["Cash", "Card", "Transfer", "Credit", "Other"] as const;

export function CheckoutView({ onSuccess, onCancel }: CheckoutViewProps) {
  const { apiClient, session } = useAuth();
  const { items, totalPreview, clearCart } = useCart();

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkoutService = React.useMemo(
    () => new CheckoutApplicationService(apiClient),
    [apiClient]
  );

  const printerService = React.useMemo(() => new MobilePrinterService(), []);

  const handleCompleteSale = async () => {
    if (isSubmitting) return; // Prevent double tap/duplicate request
    if (!items || items.length === 0) {
      setErrorMessage("Cannot complete checkout: Cart is empty.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const salePayload = {
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim().toLowerCase() || undefined,
      customerWhatsapp: customerWhatsapp.trim(),
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
        setErrorMessage(res.error || "Failed to process sale on server");
        return;
      }

      // Trigger printer capability stub
      void printerService.printReceipt({
        saleId: res.data.saleId || res.data.saleNumber || "SALE-POS",
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
      setErrorMessage(err instanceof Error ? err.message : "Error processing checkout");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.title}>POS Checkout</Text>
        <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {errorMessage && (
        <View style={styles.errorCard} accessibilityRole="alert">
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      {/* Cart Summary */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Order Summary ({items.length} items)</Text>
        {items.map((it) => (
          <View key={it.inventoryItem.id} style={styles.itemRow}>
            <View>
              <Text style={styles.itemModel}>{it.inventoryItem.model}</Text>
              <Text style={styles.itemImei}>IMEI: {it.inventoryItem.imei || "N/A"}</Text>
            </View>
            <Text style={styles.itemPrice}>${it.salePrice.toFixed(2)}</Text>
          </View>
        ))}
        <View style={styles.totalDivider} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Due (Backend Authoritative)</Text>
          <Text style={styles.totalValue}>${totalPreview.toFixed(2)}</Text>
        </View>
      </View>

      {/* Customer Information */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Customer Information</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Full Name *</Text>
          <TextInput
            style={styles.input}
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="Jane Doe"
            placeholderTextColor={IPAD_THEME.colors.textMuted}
            accessibilityLabel="Customer Full Name"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>WhatsApp Phone (with country code) *</Text>
          <TextInput
            style={styles.input}
            value={customerWhatsapp}
            onChangeText={setCustomerWhatsapp}
            placeholder="+525512345678"
            placeholderTextColor={IPAD_THEME.colors.textMuted}
            keyboardType="phone-pad"
            accessibilityLabel="Customer WhatsApp"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Email (Optional Receipt)</Text>
          <TextInput
            style={styles.input}
            value={customerEmail}
            onChangeText={setCustomerEmail}
            placeholder="customer@domain.com"
            placeholderTextColor={IPAD_THEME.colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            accessibilityLabel="Customer Email"
          />
        </View>
      </View>

      {/* Payment Method */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Payment Method</Text>
        <View style={styles.methodsRow}>
          {PAYMENT_METHODS.map((m) => {
            const selected = paymentMethod === m;
            return (
              <TouchableOpacity
                key={m}
                style={[styles.methodBtn, selected && styles.methodBtnSelected]}
                onPress={() => setPaymentMethod(m)}
                accessibilityRole="button"
                accessibilityLabel={`Payment method ${m}`}
              >
                <Text style={[styles.methodText, selected && styles.methodTextSelected]}>
                  {m}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Complete Button */}
      <TouchableOpacity
        style={[styles.completeButton, isSubmitting && styles.buttonDisabled]}
        onPress={handleCompleteSale}
        disabled={isSubmitting}
        accessibilityRole="button"
        accessibilityLabel="Complete Sale"
      >
        {isSubmitting ? (
          <ActivityIndicator color="#080c14" />
        ) : (
          <Text style={styles.completeButtonText}>
            Confirm & Charge ${totalPreview.toFixed(2)}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.background,
  },
  scrollContent: {
    padding: IPAD_THEME.spacing.xl,
    maxWidth: 800,
    alignSelf: "center",
    width: "100%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: IPAD_THEME.spacing.lg,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: IPAD_THEME.colors.textPrimary,
  },
  cancelBtn: {
    padding: IPAD_THEME.spacing.sm,
  },
  cancelText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 15,
  },
  errorCard: {
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
    fontWeight: "600",
  },
  sectionCard: {
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderRadius: IPAD_THEME.radius.lg,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    padding: IPAD_THEME.spacing.lg,
    marginBottom: IPAD_THEME.spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: IPAD_THEME.colors.textPrimary,
    marginBottom: IPAD_THEME.spacing.md,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: IPAD_THEME.spacing.xs,
  },
  itemModel: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  itemImei: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 13,
  },
  itemPrice: {
    color: IPAD_THEME.colors.accent,
    fontSize: 15,
    fontWeight: "700",
  },
  totalDivider: {
    height: 1,
    backgroundColor: IPAD_THEME.colors.borderSubtle,
    marginVertical: IPAD_THEME.spacing.md,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: IPAD_THEME.colors.textPrimary,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: "800",
    color: IPAD_THEME.colors.accent,
  },
  inputGroup: {
    marginBottom: IPAD_THEME.spacing.md,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: IPAD_THEME.colors.textSecondary,
    marginBottom: IPAD_THEME.spacing.xs,
  },
  input: {
    height: IPAD_THEME.touchTarget.minHeight,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    paddingHorizontal: IPAD_THEME.spacing.md,
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 15,
  },
  methodsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: IPAD_THEME.spacing.sm,
  },
  methodBtn: {
    paddingHorizontal: IPAD_THEME.spacing.lg,
    paddingVertical: IPAD_THEME.spacing.sm,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
  },
  methodBtnSelected: {
    backgroundColor: IPAD_THEME.colors.accent,
    borderColor: IPAD_THEME.colors.accent,
  },
  methodText: {
    color: IPAD_THEME.colors.textPrimary,
    fontWeight: "600",
    fontSize: 14,
  },
  methodTextSelected: {
    color: "#080c14",
    fontWeight: "700",
  },
  completeButton: {
    height: IPAD_THEME.touchTarget.largeHeight,
    backgroundColor: IPAD_THEME.colors.success,
    borderRadius: IPAD_THEME.radius.lg,
    justifyContent: "center",
    alignItems: "center",
    marginTop: IPAD_THEME.spacing.sm,
    marginBottom: IPAD_THEME.spacing.xxl,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  completeButtonText: {
    color: "#080c14",
    fontSize: 17,
    fontWeight: "800",
  },
});
