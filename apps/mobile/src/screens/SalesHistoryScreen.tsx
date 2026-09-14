import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { IPAD_THEME } from "../theme/tokens";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";

interface SaleRecord {
  saleId: string;
  soldAt: string;
  customer?: string;
  customerType?: string;
  customerEmail?: string;
  customerWhatsapp?: string;
  paymentMethod?: string;
  notes?: string;
  soldBy?: string;
  lines: Array<{
    id: string;
    imei?: string;
    serialNumber?: string;
    model: string;
    capacity?: string;
    color?: string;
    salePrice: string | number;
    status?: string;
  }>;
}

export function SalesHistoryScreen() {
  const { apiClient } = useAuth();
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchSales = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await apiClient.getSalesHistory();
      if (res.ok) {
        setSales((res.data as SaleRecord[]) || []);
      } else {
        setErrorMessage(res.error || "Failed to load sales history");
      }
    } catch {
      setErrorMessage("Network error loading sales history");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchSales();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>Store Sales Records</Text>
          <Text style={styles.subtitle}>
            Authoritative transactional sales history recorded on Pro Buyer backend.
          </Text>
        </View>
        <Button
          title="↻ Refresh"
          variant="secondary"
          onPress={fetchSales}
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={IPAD_THEME.colors.accent} />
          <Text style={styles.loadingText}>Fetching sales from server...</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Button title="Retry" variant="primary" onPress={fetchSales} />
        </View>
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(s) => s.saleId}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const total = item.lines.reduce(
              (sum, l) => sum + (typeof l.salePrice === "number" ? l.salePrice : parseFloat(String(l.salePrice || 0)) || 0),
              0
            );

            const formattedDate = new Date(item.soldAt).toLocaleString();

            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.refRow}>
                    <Text style={styles.saleRef}>{item.saleId}</Text>
                    <Badge label={item.paymentMethod || "PAID"} variant="success" />
                  </View>
                  <Text style={styles.saleTotal}>${total.toFixed(2)}</Text>
                </View>

                <View style={styles.customerRow}>
                  <Text style={styles.customerName}>
                    👤 {item.customer || "Walk-in Customer"}
                  </Text>
                  <Text style={styles.soldAt}>{formattedDate}</Text>
                </View>

                {item.customerWhatsapp ? (
                  <Text style={styles.contact}>📱 {item.customerWhatsapp}</Text>
                ) : null}

                <View style={styles.divider} />

                <Text style={styles.itemsHeader}>Items ({item.lines.length}):</Text>
                {item.lines.map((l) => (
                  <View key={l.id} style={styles.lineRow}>
                    <Text style={styles.lineModel}>
                      {l.model} {[l.capacity, l.color].filter(Boolean).join(" • ")}
                    </Text>
                    <Text style={styles.linePrice}>${Number(l.salePrice).toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>🧾</Text>
              <Text style={styles.emptyTitle}>No Sales Recorded Yet</Text>
              <Text style={styles.emptySubtitle}>
                Completed POS sales will appear here with full backend audit records.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.background,
    padding: IPAD_THEME.spacing.xxl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: IPAD_THEME.spacing.xl,
  },
  screenTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 24,
    fontWeight: "900",
  },
  subtitle: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  listContent: {
    gap: IPAD_THEME.spacing.md,
  },
  card: {
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderRadius: IPAD_THEME.radius.lg,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    padding: IPAD_THEME.spacing.lg,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: IPAD_THEME.spacing.xs,
  },
  refRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: IPAD_THEME.spacing.sm,
  },
  saleRef: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    fontFamily: "Courier",
  },
  saleTotal: {
    color: IPAD_THEME.colors.accent,
    fontSize: 20,
    fontWeight: "900",
  },
  customerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  customerName: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  soldAt: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 12,
  },
  contact: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: IPAD_THEME.colors.borderSubtle,
    marginVertical: IPAD_THEME.spacing.sm,
  },
  itemsHeader: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  lineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  lineModel: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 13,
  },
  linePrice: {
    color: IPAD_THEME.colors.accent,
    fontSize: 13,
    fontWeight: "700",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: IPAD_THEME.spacing.xxl,
  },
  loadingText: {
    color: IPAD_THEME.colors.textSecondary,
    marginTop: IPAD_THEME.spacing.md,
  },
  errorText: {
    color: IPAD_THEME.colors.danger,
    marginBottom: IPAD_THEME.spacing.md,
  },
  emptyIcon: {
    fontSize: 42,
    marginBottom: IPAD_THEME.spacing.md,
  },
  emptyTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  emptySubtitle: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 13,
    textAlign: "center",
  },
});
