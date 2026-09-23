import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  Modal,
  Alert,
} from "react-native";
import { IPAD_THEME } from "../theme/tokens";
import { useCommission } from "../contexts/CommissionContext";
import { formatCurrency } from "../utils/formatters";
import type { CommissionRule, CommissionType, CommissionScope } from "@ireader/contracts";

export function CommissionsScreen() {
  const {
    rules,
    addRule,
    toggleRule,
    deleteRule,
    resetToDefaultRules,
    records,
    clearRecords,
    sellerReports,
    sellers,
    activeSeller,
    setActiveSeller,
  } = useCommission();

  const [activeTab, setActiveTab] = useState<"rules" | "reports">("reports");
  const [isNewRuleModalOpen, setIsNewRuleModalOpen] = useState(false);

  // New Rule Form State
  const [ruleName, setRuleName] = useState("");
  const [ruleScope, setRuleScope] = useState<CommissionScope>("category");
  const [ruleTarget, setRuleTarget] = useState("iphone");
  const [ruleType, setRuleType] = useState<CommissionType>("fixed_per_unit");
  const [ruleFixedAmount, setRuleFixedAmount] = useState("300");
  const [rulePercentage, setRulePercentage] = useState("10");

  const totalCommissionsAll = sellerReports.reduce(
    (acc, s) => acc + s.totalCommissionsEarned,
    0
  );
  const totalSalesAll = sellerReports.reduce((acc, s) => acc + s.grossSalesAmount, 0);
  const totalUnitsAll = sellerReports.reduce((acc, s) => acc + s.totalUnitsSold, 0);

  const handleCreateRule = async () => {
    if (!ruleName.trim()) return;

    await addRule({
      name: ruleName.trim(),
      scope: ruleScope,
      target: ruleTarget.trim().toLowerCase(),
      type: ruleType,
      fixedAmount: Number(ruleFixedAmount) || 0,
      percentage: Number(rulePercentage) || 0,
      enabled: true,
      priority: ruleScope === "product" ? 50 : ruleScope === "model" ? 30 : ruleScope === "category" ? 20 : 1,
    });

    setRuleName("");
    setIsNewRuleModalOpen(false);
  };

  const handleConfirmReset = () => {
    Alert.alert(
      "Restablecer Reglas",
      "¿Deseas restablecer las reglas de comisión predeterminadas (iPhone $300, iPad $200, Accesorios 10% margen)?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Restablecer", style: "destructive", onPress: () => void resetToDefaultRules() },
      ]
    );
  };

  const handleConfirmClear = () => {
    Alert.alert(
      "Corte de Turno",
      "¿Deseas realizar el corte y reiniciar el historial acumulado de comisiones del turno?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Cerrar Turno", style: "destructive", onPress: () => void clearRecords() },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Header & Tab Bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.screenBadge}>MÓDULO DE NEGOCIO</Text>
          <Text style={styles.screenTitle}>Gestión de Comisiones</Text>
        </View>

        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "reports" && styles.tabBtnActive]}
            onPress={() => setActiveTab("reports")}
          >
            <Text style={[styles.tabBtnText, activeTab === "reports" && styles.tabBtnTextActive]}>
              📊 Corte y Reporte por Vendedor
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "rules" && styles.tabBtnActive]}
            onPress={() => setActiveTab("rules")}
          >
            <Text style={[styles.tabBtnText, activeTab === "rules" && styles.tabBtnTextActive]}>
              ⚙️ Reglas y Esquemas ({rules.filter((r) => r.enabled).length} Activas)
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeTab === "reports" ? (
        /* ─────────────── TAB REPORTES Y CORTE DE COMISIONES ─────────────── */
        <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
          {/* KPI Cards Row */}
          <View style={styles.kpiRow}>
            <View style={[styles.kpiCard, styles.kpiCardPrimary]}>
              <Text style={styles.kpiLabel}>COMISIONES TOTALES</Text>
              <Text style={styles.kpiValuePrimary}>{formatCurrency(totalCommissionsAll)} MXN</Text>
              <Text style={styles.kpiFoot}>Acumulado de turno activo</Text>
            </View>

            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>VENTAS BRUTAS</Text>
              <Text style={styles.kpiValue}>{formatCurrency(totalSalesAll)} MXN</Text>
              <Text style={styles.kpiFoot}>{records.length} transacciones registradas</Text>
            </View>

            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>EQUIPOS / UNIDADES</Text>
              <Text style={styles.kpiValue}>{totalUnitsAll} uds.</Text>
              <Text style={styles.kpiFoot}>Promedio comisionable</Text>
            </View>

            <View style={styles.kpiCardAction}>
              <TouchableOpacity
                style={[styles.closeShiftBtn, records.length === 0 && styles.closeShiftBtnDisabled]}
                onPress={handleConfirmClear}
                disabled={records.length === 0}
              >
                <Text style={styles.closeShiftBtnIcon}>✂️</Text>
                <Text style={styles.closeShiftBtnText}>Corte de Turno</Text>
                <Text style={styles.closeShiftBtnSub}>Reiniciar acumulado</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Breakdown By Seller */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>Desglose por Vendedor</Text>
            <Text style={styles.sectionSubHeading}>
              Vendedor de turno activo en POS: <Text style={styles.activeSellerTag}>{activeSeller.name}</Text>
            </Text>
          </View>

          <View style={styles.sellersGrid}>
            {sellers.map((s) => {
              const rep = sellerReports.find((r) => r.sellerId === s.id) || {
                totalSalesCount: 0,
                totalUnitsSold: 0,
                grossSalesAmount: 0,
                totalCommissionsEarned: 0,
              };
              const isTurnActive = activeSeller.id === s.id;

              return (
                <View key={s.id} style={[styles.sellerCard, isTurnActive && styles.sellerCardActive]}>
                  <View style={styles.sellerTop}>
                    <View style={[styles.sellerAvatar, { backgroundColor: s.avatarColor || "#6366f1" }]}>
                      <Text style={styles.sellerAvatarText}>
                        {(s.name || "V")
                          .split(" ")
                          .slice(0, 2)
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.sellerMeta}>
                      <Text style={styles.sellerCardName}>{s.name}</Text>
                      <Text style={styles.sellerCardRole}>{s.role || "Vendedor"}</Text>
                    </View>
                    {isTurnActive ? (
                      <View style={styles.inSessionBadge}>
                        <Text style={styles.inSessionBadgeText}>EN POS</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.switchSellerBtn}
                        onPress={() => setActiveSeller(s)}
                      >
                        <Text style={styles.switchSellerBtnText}>Usar en POS</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.sellerMetricsRow}>
                    <View style={styles.sellerMetricBox}>
                      <Text style={styles.sellerMetricLabel}>Ventas</Text>
                      <Text style={styles.sellerMetricVal}>{rep.totalSalesCount}</Text>
                    </View>
                    <View style={styles.sellerMetricBox}>
                      <Text style={styles.sellerMetricLabel}>Equipos</Text>
                      <Text style={styles.sellerMetricVal}>{rep.totalUnitsSold}</Text>
                    </View>
                    <View style={styles.sellerMetricBox}>
                      <Text style={styles.sellerMetricLabel}>Monto Vendido</Text>
                      <Text style={styles.sellerMetricVal}>{formatCurrency(rep.grossSalesAmount)}</Text>
                    </View>
                  </View>

                  <View style={styles.sellerCommissionBox}>
                    <Text style={styles.sellerCommissionLabel}>COMISIÓN GANADA</Text>
                    <Text style={styles.sellerCommissionVal}>
                      {formatCurrency(rep.totalCommissionsEarned)} MXN
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Recent Commission Transactions Log */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>Historial de Ventas Comisionadas</Text>
            <Text style={styles.sectionSubHeading}>{records.length} transacciones registradas en este turno</Text>
          </View>

          {records.length === 0 ? (
            <View style={styles.emptyRecordsBox}>
              <Text style={styles.emptyRecordsIcon}>📋</Text>
              <Text style={styles.emptyRecordsText}>Aún no hay ventas registradas en este turno.</Text>
              <Text style={styles.emptyRecordsSub}>
                Cada venta completada en el POS acumulará automáticamente la comisión del vendedor aquí.
              </Text>
            </View>
          ) : (
            <View style={styles.recordsList}>
              {records.map((rec) => {
                const dateStr = new Date(rec.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <View key={rec.id} style={styles.recordRow}>
                    <View style={styles.recordLeft}>
                      <View style={styles.recordTimeBadge}>
                        <Text style={styles.recordTimeText}>{dateStr}</Text>
                      </View>
                      <View>
                        <Text style={styles.recordSellerText}>
                          {rec.sellerName} <Text style={styles.recordFolio}>· Folio: {rec.saleNumber || rec.saleId.slice(0, 8)}</Text>
                        </Text>
                        <Text style={styles.recordItemsText}>
                          {rec.items.map((i) => i.model).join(", ")}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.recordRight}>
                      <View style={styles.recordSaleBox}>
                        <Text style={styles.recordSaleLabel}>Venta</Text>
                        <Text style={styles.recordSaleVal}>{formatCurrency(rec.totalSale)}</Text>
                      </View>
                      <View style={styles.recordCommissionBox}>
                        <Text style={styles.recordCommissionLabel}>Comisión</Text>
                        <Text style={styles.recordCommissionVal}>
                          +{formatCurrency(rec.totalCommission)} MXN
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      ) : (
        /* ─────────────── TAB REGLAS Y ESQUEMAS CONFIGURABLES ─────────────── */
        <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
          {/* Rules Action Row */}
          <View style={styles.rulesActionRow}>
            <View>
              <Text style={styles.rulesActionTitle}>Esquemas de Comisión por Producto y Categoría</Text>
              <Text style={styles.rulesActionSubtitle}>
                El motor evalúa las reglas en orden de prioridad para calcular la comisión de cada unidad.
              </Text>
            </View>

            <View style={styles.rulesActionButtons}>
              <TouchableOpacity style={styles.resetBtn} onPress={handleConfirmReset}>
                <Text style={styles.resetBtnText}>↺ Restaurar Valores Iniciales</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.newRuleBtn} onPress={() => setIsNewRuleModalOpen(true)}>
                <Text style={styles.newRuleBtnText}>+ Nueva Regla</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Rules Cards List */}
          <View style={styles.rulesList}>
            {rules.map((rule) => {
              const typeDesc =
                rule.type === "fixed_per_unit"
                  ? `$${rule.fixedAmount} MXN por equipo`
                  : rule.type === "percent_margin"
                  ? `${rule.percentage}% sobre margen de ganancia`
                  : rule.type === "percent_price"
                  ? `${rule.percentage}% sobre precio de venta`
                  : `$${rule.fixedAmount} base + ${rule.percentage}% margen`;

              return (
                <View key={rule.id} style={[styles.ruleCard, !rule.enabled && styles.ruleCardDisabled]}>
                  <View style={styles.ruleCardLeft}>
                    <View style={styles.ruleScopeBadge}>
                      <Text style={styles.ruleScopeText}>{rule.scope.toUpperCase()}</Text>
                    </View>
                    <View style={styles.ruleDetails}>
                      <Text style={styles.ruleNameText}>{rule.name}</Text>
                      <Text style={styles.ruleFormulaText}>
                        Objetivo: <Text style={styles.ruleTargetText}>{rule.target || "Todos"}</Text> · {typeDesc}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.ruleCardRight}>
                    <TouchableOpacity
                      style={[styles.toggleBtn, rule.enabled ? styles.toggleBtnOn : styles.toggleBtnOff]}
                      onPress={() => toggleRule(rule.id)}
                    >
                      <Text style={styles.toggleBtnText}>
                        {rule.enabled ? "✓ ACTIVA" : "INACTIVA"}
                      </Text>
                    </TouchableOpacity>

                    {rules.length > 1 && (
                      <TouchableOpacity
                        style={styles.deleteRuleBtn}
                        onPress={() => deleteRule(rule.id)}
                      >
                        <Text style={styles.deleteRuleText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* Modal para Crear Nueva Regla */}
      <Modal visible={isNewRuleModalOpen} transparent animationType="fade" onRequestClose={() => setIsNewRuleModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nueva Regla de Comisión</Text>
              <TouchableOpacity onPress={() => setIsNewRuleModalOpen(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.formLabel}>Nombre de la Regla *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="ej. Bono iPhone 16 Pro, Fundas 15%..."
                placeholderTextColor={IPAD_THEME.colors.textMuted}
                value={ruleName}
                onChangeText={setRuleName}
              />

              <Text style={styles.formLabel}>Ámbito de Aplicación</Text>
              <View style={styles.pillRow}>
                {(["category", "model", "product", "global"] as CommissionScope[]).map((scope) => (
                  <TouchableOpacity
                    key={scope}
                    style={[styles.scopePill, ruleScope === scope && styles.scopePillActive]}
                    onPress={() => setRuleScope(scope)}
                  >
                    <Text style={[styles.scopePillText, ruleScope === scope && styles.scopePillTextActive]}>
                      {scope === "category" ? "Categoría" : scope === "model" ? "Modelo Específico" : scope === "product" ? "Por SKU/ID" : "Global Base"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {ruleScope !== "global" && (
                <>
                  <Text style={styles.formLabel}>
                    {ruleScope === "category" ? "Categoría (iphone, ipad, mac, watch, accessories)" : ruleScope === "model" ? "Patrón del Modelo (ej. iPhone 15 Pro, S24)" : "SKU o ID del Producto"}
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Objetivo a coincidir..."
                    placeholderTextColor={IPAD_THEME.colors.textMuted}
                    value={ruleTarget}
                    onChangeText={setRuleTarget}
                  />
                </>
              )}

              <Text style={styles.formLabel}>Tipo de Esquema de Comisión</Text>
              <View style={styles.schemeOptionGrid}>
                <TouchableOpacity
                  style={[styles.schemeCard, ruleType === "fixed_per_unit" && styles.schemeCardActive]}
                  onPress={() => setRuleType("fixed_per_unit")}
                >
                  <Text style={styles.schemeCardTitle}>💵 Monto Fijo por Unidad</Text>
                  <Text style={styles.schemeCardDesc}>ej. $300 MXN por cada teléfono vendido</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.schemeCard, ruleType === "percent_margin" && styles.schemeCardActive]}
                  onPress={() => setRuleType("percent_margin")}
                >
                  <Text style={styles.schemeCardTitle}>📈 % sobre Margen (Ganancia)</Text>
                  <Text style={styles.schemeCardDesc}>ej. 10% de (Precio Venta - Costo)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.schemeCard, ruleType === "percent_price" && styles.schemeCardActive]}
                  onPress={() => setRuleType("percent_price")}
                >
                  <Text style={styles.schemeCardTitle}>🏷️ % sobre Precio de Venta</Text>
                  <Text style={styles.schemeCardDesc}>ej. 3% del total cobrado al cliente</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.schemeCard, ruleType === "combined" && styles.schemeCardActive]}
                  onPress={() => setRuleType("combined")}
                >
                  <Text style={styles.schemeCardTitle}>✨ Combinado (Fijo + % Margen)</Text>
                  <Text style={styles.schemeCardDesc}>Monto base + porcentaje de utilidad</Text>
                </TouchableOpacity>
              </View>

              {(ruleType === "fixed_per_unit" || ruleType === "combined") && (
                <>
                  <Text style={styles.formLabel}>Monto Fijo en Pesos ($ MXN)</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="300"
                    placeholderTextColor={IPAD_THEME.colors.textMuted}
                    keyboardType="numeric"
                    value={ruleFixedAmount}
                    onChangeText={setRuleFixedAmount}
                  />
                </>
              )}

              {(ruleType === "percent_margin" || ruleType === "percent_price" || ruleType === "combined") && (
                <>
                  <Text style={styles.formLabel}>Porcentaje (%)</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="10"
                    placeholderTextColor={IPAD_THEME.colors.textMuted}
                    keyboardType="numeric"
                    value={rulePercentage}
                    onChangeText={setRulePercentage}
                  />
                </>
              )}

              <TouchableOpacity
                style={[styles.modalSubmitBtn, !ruleName.trim() && styles.modalSubmitBtnDisabled]}
                onPress={handleCreateRule}
                disabled={!ruleName.trim()}
              >
                <Text style={styles.modalSubmitBtnText}>Guardar y Activar Regla</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#080c14",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 18,
    backgroundColor: "#0d131f",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  screenBadge: {
    color: "#38bdf8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  screenTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 22,
    fontWeight: "900",
  },
  tabsContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: IPAD_THEME.radius.lg,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: IPAD_THEME.radius.md,
  },
  tabBtnActive: {
    backgroundColor: "#1e293b",
  },
  tabBtnText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  tabBtnTextActive: {
    color: "#38bdf8",
    fontWeight: "900",
  },
  contentScroll: {
    flex: 1,
    padding: 24,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: IPAD_THEME.radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  kpiCardPrimary: {
    backgroundColor: "#0f233a",
    borderColor: "rgba(56, 189, 248, 0.4)",
  },
  kpiCardAction: {
    width: 170,
  },
  kpiLabel: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  kpiValue: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 4,
  },
  kpiValuePrimary: {
    color: "#38bdf8",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 4,
  },
  kpiFoot: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  closeShiftBtn: {
    flex: 1,
    backgroundColor: "rgba(244, 63, 94, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.3)",
    borderRadius: IPAD_THEME.radius.xl,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  closeShiftBtnDisabled: {
    opacity: 0.4,
  },
  closeShiftBtnIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  closeShiftBtnText: {
    color: "#f43f5e",
    fontSize: 13,
    fontWeight: "900",
  },
  closeShiftBtnSub: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 10,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 12,
  },
  sectionHeading: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 17,
    fontWeight: "900",
  },
  sectionSubHeading: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  activeSellerTag: {
    color: "#38bdf8",
    fontWeight: "900",
  },
  sellersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 28,
  },
  sellerCard: {
    flexBasis: "31%",
    flexGrow: 1,
    backgroundColor: "#111827",
    borderRadius: IPAD_THEME.radius.xl,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  sellerCardActive: {
    borderColor: "#38bdf8",
    backgroundColor: "#0d1b2e",
  },
  sellerTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  sellerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  sellerAvatarText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  sellerMeta: {
    flex: 1,
  },
  sellerCardName: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
  sellerCardRole: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  inSessionBadge: {
    backgroundColor: "#38bdf8",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: IPAD_THEME.radius.full,
  },
  inSessionBadgeText: {
    color: "#0f172a",
    fontSize: 9,
    fontWeight: "900",
  },
  switchSellerBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: IPAD_THEME.radius.md,
  },
  switchSellerBtnText: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  sellerMetricsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: IPAD_THEME.radius.md,
    padding: 10,
    marginBottom: 12,
  },
  sellerMetricBox: {
    flex: 1,
    alignItems: "center",
  },
  sellerMetricLabel: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 9,
    fontWeight: "700",
  },
  sellerMetricVal: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },
  sellerCommissionBox: {
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    borderRadius: IPAD_THEME.radius.md,
    padding: 10,
    alignItems: "center",
  },
  sellerCommissionLabel: {
    color: "#38bdf8",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  sellerCommissionVal: {
    color: "#38bdf8",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 2,
  },
  emptyRecordsBox: {
    backgroundColor: "#111827",
    borderRadius: IPAD_THEME.radius.xl,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  emptyRecordsIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyRecordsText: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 4,
  },
  emptyRecordsSub: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    maxWidth: 420,
  },
  recordsList: {
    backgroundColor: "#111827",
    borderRadius: IPAD_THEME.radius.xl,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
  },
  recordRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  recordLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  recordTimeBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: IPAD_THEME.radius.md,
  },
  recordTimeText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
  },
  recordSellerText: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
  recordFolio: {
    color: IPAD_THEME.colors.textMuted,
    fontWeight: "600",
    fontSize: 12,
  },
  recordItemsText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  recordRight: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
  },
  recordSaleBox: {
    alignItems: "flex-end",
  },
  recordSaleLabel: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 9,
    fontWeight: "700",
  },
  recordSaleVal: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  recordCommissionBox: {
    alignItems: "flex-end",
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: IPAD_THEME.radius.md,
  },
  recordCommissionLabel: {
    color: "#38bdf8",
    fontSize: 8,
    fontWeight: "900",
  },
  recordCommissionVal: {
    color: "#38bdf8",
    fontSize: 14,
    fontWeight: "900",
  },
  rulesActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  rulesActionTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  rulesActionSubtitle: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  rulesActionButtons: {
    flexDirection: "row",
    gap: 10,
  },
  resetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: IPAD_THEME.radius.md,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  resetBtnText: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  newRuleBtn: {
    backgroundColor: "#38bdf8",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: IPAD_THEME.radius.md,
  },
  newRuleBtnText: {
    color: "#080c14",
    fontSize: 12,
    fontWeight: "900",
  },
  rulesList: {
    gap: 10,
  },
  ruleCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#111827",
    padding: 16,
    borderRadius: IPAD_THEME.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  ruleCardDisabled: {
    opacity: 0.5,
  },
  ruleCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },
  ruleScopeBadge: {
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  ruleScopeText: {
    color: "#38bdf8",
    fontSize: 10,
    fontWeight: "900",
  },
  ruleDetails: {
    flex: 1,
  },
  ruleNameText: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  ruleFormulaText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  ruleTargetText: {
    color: IPAD_THEME.colors.textSecondary,
    fontWeight: "700",
  },
  ruleCardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: IPAD_THEME.radius.full,
  },
  toggleBtnOn: {
    backgroundColor: "rgba(52, 211, 153, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.3)",
  },
  toggleBtnOff: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  toggleBtnText: {
    color: "#34d399",
    fontSize: 11,
    fontWeight: "900",
  },
  deleteRuleBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteRuleText: {
    color: "#f87171",
    fontSize: 12,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 580,
    backgroundColor: "#0f172a",
    borderRadius: IPAD_THEME.radius.xl,
    padding: 24,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.12)",
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 19,
    fontWeight: "900",
  },
  modalCloseText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 16,
    fontWeight: "700",
  },
  formLabel: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 12,
    textTransform: "uppercase",
  },
  modalInput: {
    backgroundColor: "#1e293b",
    borderRadius: IPAD_THEME.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  scopePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: IPAD_THEME.radius.md,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  scopePillActive: {
    borderColor: "#38bdf8",
    backgroundColor: "rgba(56, 189, 248, 0.15)",
  },
  scopePillText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  scopePillTextActive: {
    color: "#38bdf8",
    fontWeight: "900",
  },
  schemeOptionGrid: {
    gap: 8,
  },
  schemeCard: {
    backgroundColor: "#1e293b",
    padding: 12,
    borderRadius: IPAD_THEME.radius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  schemeCardActive: {
    borderColor: "#38bdf8",
    backgroundColor: "rgba(56, 189, 248, 0.12)",
  },
  schemeCardTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  schemeCardDesc: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  modalSubmitBtn: {
    backgroundColor: "#38bdf8",
    paddingVertical: 13,
    borderRadius: IPAD_THEME.radius.lg,
    alignItems: "center",
    marginTop: 20,
    marginBottom: 8,
  },
  modalSubmitBtnDisabled: {
    opacity: 0.4,
  },
  modalSubmitBtnText: {
    color: "#080c14",
    fontSize: 14,
    fontWeight: "900",
  },
});
