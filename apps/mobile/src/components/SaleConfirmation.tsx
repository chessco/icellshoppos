import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { BackendSaleCreatedResponse } from "@ireader/contracts";
import { IPAD_THEME } from "../theme/tokens.js";

interface SaleConfirmationProps {
  sale: BackendSaleCreatedResponse;
  onNewSale: () => void;
}

export function SaleConfirmation({ sale, onNewSale }: SaleConfirmationProps) {
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
            <Text style={styles.value}>{sale.saleId || sale.saleNumber || "Recorded"}</Text>
          </View>

          {sale.total !== undefined && (
            <View style={styles.row}>
              <Text style={styles.label}>Total Charged</Text>
              <Text style={styles.totalValue}>${Number(sale.total).toFixed(2)}</Text>
            </View>
          )}

          <View style={styles.row}>
            <Text style={styles.label}>Status</Text>
            <Text style={styles.statusSuccess}>AUTHORITATIVE / COMPLETED</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.newSaleButton}
          onPress={onNewSale}
          accessibilityRole="button"
          accessibilityLabel="Start New Sale"
        >
          <Text style={styles.newSaleButtonText}>Start Next Sale</Text>
        </TouchableOpacity>
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
    maxWidth: 520,
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderRadius: IPAD_THEME.radius.xl,
    padding: IPAD_THEME.spacing.xxl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: IPAD_THEME.colors.successMuted,
    borderWidth: 2,
    borderColor: IPAD_THEME.colors.success,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: IPAD_THEME.spacing.md,
  },
  checkIcon: {
    color: IPAD_THEME.colors.success,
    fontSize: 32,
    fontWeight: "800",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: IPAD_THEME.colors.textPrimary,
    marginBottom: IPAD_THEME.spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: IPAD_THEME.colors.textSecondary,
    textAlign: "center",
    marginBottom: IPAD_THEME.spacing.xl,
  },
  detailsCard: {
    width: "100%",
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
    padding: IPAD_THEME.spacing.lg,
    marginBottom: IPAD_THEME.spacing.xl,
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
  value: {
    color: IPAD_THEME.colors.textPrimary,
    fontWeight: "600",
    fontSize: 14,
  },
  totalValue: {
    color: IPAD_THEME.colors.accent,
    fontWeight: "800",
    fontSize: 18,
  },
  statusSuccess: {
    color: IPAD_THEME.colors.success,
    fontWeight: "700",
    fontSize: 12,
  },
  newSaleButton: {
    width: "100%",
    height: IPAD_THEME.touchTarget.largeHeight,
    backgroundColor: IPAD_THEME.colors.accent,
    borderRadius: IPAD_THEME.radius.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  newSaleButtonText: {
    color: "#080c14",
    fontSize: 16,
    fontWeight: "700",
  },
});
