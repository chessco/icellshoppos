import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { BackendSaleCreatedResponse } from "@ireader/contracts";
import { IPAD_THEME } from "../../theme/tokens";
import { Button } from "../ui/Button";
import { MobilePrinterService } from "../../services/PrinterService";

interface SaleConfirmationProps {
  sale: BackendSaleCreatedResponse;
  onNewSale: () => void;
}

export function SaleConfirmation({ sale, onNewSale }: SaleConfirmationProps) {
  const printerService = React.useMemo(() => new MobilePrinterService(), []);

  const handleReprintReceipt = () => {
    void printerService.printReceipt({
      saleId: sale.saleId || sale.saleNumber || "POS-SALE",
      totalAmount: typeof sale.total === "number" ? sale.total : 0,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.checkCircle}>
          <Text style={styles.checkIcon}>✓</Text>
        </View>

        <Text style={styles.title}>Sale Confirmed!</Text>
        <Text style={styles.subtitle}>
          The transaction was successfully recorded by Pro Buyer Backend.
        </Text>

        <View style={styles.detailsCard}>
          <View style={styles.row}>
            <Text style={styles.label}>Sale Reference</Text>
            <Text style={styles.valRef}>
              {sale.saleId || sale.saleNumber || "RECORDED"}
            </Text>
          </View>

          {sale.total !== undefined && (
            <View style={styles.row}>
              <Text style={styles.label}>Total Charged</Text>
              <Text style={styles.valTotal}>${Number(sale.total).toFixed(2)}</Text>
            </View>
          )}

          <View style={styles.row}>
            <Text style={styles.label}>Authority</Text>
            <Text style={styles.valAuth}>BACKEND VERIFIED</Text>
          </View>
        </View>

        <View style={styles.buttonStack}>
          <Button
            title="🖨️ Reprint Thermal Receipt"
            variant="secondary"
            size="lg"
            onPress={handleReprintReceipt}
            accessibilityLabel="Reprint Thermal Receipt"
          />
          <Button
            title="Start Next POS Sale →"
            variant="primary"
            size="lg"
            onPress={onNewSale}
            accessibilityLabel="Start Next POS Sale"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: IPAD_THEME.spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 540,
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderRadius: IPAD_THEME.radius.xl,
    padding: IPAD_THEME.spacing.xxxl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
  },
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: IPAD_THEME.colors.successMuted,
    borderWidth: 2,
    borderColor: IPAD_THEME.colors.success,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: IPAD_THEME.spacing.lg,
  },
  checkIcon: {
    color: IPAD_THEME.colors.success,
    fontSize: 36,
    fontWeight: "900",
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: IPAD_THEME.colors.textPrimary,
    marginBottom: IPAD_THEME.spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: IPAD_THEME.colors.textSecondary,
    textAlign: "center",
    marginBottom: IPAD_THEME.spacing.xl,
    lineHeight: 20,
  },
  detailsCard: {
    width: "100%",
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.lg,
    padding: IPAD_THEME.spacing.lg,
    marginBottom: IPAD_THEME.spacing.xl,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: IPAD_THEME.spacing.xs,
  },
  label: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 14,
  },
  valRef: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "Courier",
  },
  valTotal: {
    color: IPAD_THEME.colors.accent,
    fontSize: 20,
    fontWeight: "900",
  },
  valAuth: {
    color: IPAD_THEME.colors.success,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  buttonStack: {
    width: "100%",
    gap: IPAD_THEME.spacing.md,
  },
});
