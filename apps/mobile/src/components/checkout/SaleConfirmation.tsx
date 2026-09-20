import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { BackendSaleCreatedResponse } from "@ireader/contracts";
import { IPAD_THEME } from "../../theme/tokens";
import { Button } from "../ui/Button";
import { MobilePrinterService } from "../../services/PrinterService";
import { formatCurrency } from "../../utils/formatters";

interface SaleConfirmationProps {
  sale: BackendSaleCreatedResponse | null;
  onNewSale: () => void;
}

export function SaleConfirmation({ sale, onNewSale }: SaleConfirmationProps) {
  const printerService = React.useMemo(() => new MobilePrinterService(), []);

  if (!sale) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Venta Registrada</Text>
          <Text style={styles.subtitle}>La transacción fue registrada exitosamente.</Text>
          <View style={styles.buttonStack}>
            <Button
              title="Continuar al POS →"
              variant="primary"
              size="lg"
              onPress={onNewSale}
              accessibilityLabel="Continuar al POS"
            />
          </View>
        </View>
      </View>
    );
  }

  const handleReprintReceipt = () => {
    void printerService.printReceipt({
      saleId: sale.saleId || sale.saleNumber || "POS-SALE",
      customerName: sale.customer?.name,
      items: sale.items?.map((item) => ({
        model: item.model || "Device",
        imei: item.imei,
        salePrice: item.salePrice,
      })),
      totalAmount: typeof sale.total === "number" ? sale.total : Number(sale.total) || 0,
      paymentMethod: sale.paymentMethod,
      createdAt: sale.createdAt || new Date().toISOString(),
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
              <Text style={styles.valTotal}>{formatCurrency(sale.total)}</Text>
            </View>
          )}

          <View style={styles.row}>
            <Text style={styles.label}>Authority</Text>
            <Text style={styles.valAuth}>BACKEND VERIFIED</Text>
          </View>

          {sale.items && sale.items.length > 0 && (
            <View style={styles.itemsDivider}>
              <Text style={styles.itemsHeading}>Sold Items ({sale.items.length})</Text>
              {sale.items.map((item, idx) => (
                <View key={item.id || item.inventoryItemId || idx} style={styles.itemRow}>
                  <View style={styles.itemMain}>
                    <Text style={styles.itemModel} numberOfLines={1}>
                      {item.model || "Device"}
                      {item.capacity ? ` ${item.capacity}` : ""}
                      {item.color ? ` (${item.color})` : ""}
                    </Text>
                    {item.imei ? (
                      <Text style={styles.itemImei}>IMEI: {item.imei}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.itemPrice}>
                    {formatCurrency(item.salePrice)}
                  </Text>
                </View>
              ))}
            </View>
          )}
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
  itemsDivider: {
    marginTop: IPAD_THEME.spacing.md,
    paddingTop: IPAD_THEME.spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  itemsHeading: {
    fontSize: 12,
    fontWeight: "700",
    color: IPAD_THEME.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: IPAD_THEME.spacing.sm,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: IPAD_THEME.spacing.xs,
  },
  itemMain: {
    flex: 1,
    marginRight: IPAD_THEME.spacing.sm,
  },
  itemModel: {
    fontSize: 14,
    fontWeight: "600",
    color: IPAD_THEME.colors.textPrimary,
  },
  itemImei: {
    fontSize: 11,
    color: IPAD_THEME.colors.textMuted,
    fontFamily: "Courier",
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: IPAD_THEME.colors.textPrimary,
  },
  buttonStack: {
    width: "100%",
    gap: IPAD_THEME.spacing.md,
  },
});
