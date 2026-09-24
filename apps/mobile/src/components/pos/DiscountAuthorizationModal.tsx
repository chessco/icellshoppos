import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { IPAD_THEME } from "../../theme/tokens";
import { useAuth } from "../../contexts/AuthContext";
import { useCart } from "../../contexts/CartContext";
import { formatCurrency } from "../../utils/formatters";

interface DiscountAuthorizationModalProps {
  visible: boolean;
  onClose: () => void;
}

const PRESET_AMOUNTS = [100, 200, 300, 500, 1000];
const PRESET_REASONS = [
  "Cliente Frecuente",
  "Compra Mayoreo",
  "Detalle Estético",
  "Ajuste Comercial",
  "Promoción Mostrador",
];

export function DiscountAuthorizationModal({
  visible,
  onClose,
}: DiscountAuthorizationModalProps) {
  const { apiClient } = useAuth();
  const {
    items,
    subtotal,
    selectedCustomer,
    activeDiscountAuth,
    setActiveDiscountAuth,
    setDiscountAmount,
    clearDiscount,
    checkDiscountStatus,
  } = useCart();

  const [requestedAmount, setRequestedAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const numericRequested = parseFloat(requestedAmount.replace(/[^0-9.]/g, "")) || 0;

  const handleRequestAuthorization = async () => {
    if (numericRequested <= 0) {
      setErrorMessage("Ingresa un monto de descuento mayor a $0.");
      return;
    }
    if (numericRequested > subtotal) {
      setErrorMessage(`El descuento no puede superar el subtotal (${formatCurrency(subtotal)}).`);
      return;
    }
    if (!reason.trim()) {
      setErrorMessage("Especifica el motivo de la solicitud de descuento.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessNotice(null);

    try {
      const draftSaleId = `IPAD-${Date.now()}`;
      const payload = {
        draftSaleId,
        requestedDiscount: Math.round(numericRequested),
        reason: reason.trim(),
        customerName: selectedCustomer?.name || "Cliente Mostrador",
        customerEmail: selectedCustomer?.email,
        customerWhatsapp: selectedCustomer?.phone,
        items: items.map((i) => ({
          inventoryItemId: i.inventoryItem.id,
          salePrice: Math.round(i.salePrice),
        })),
      };

      const res = await apiClient.requestDiscountAuthorization(payload);
      if (!res.ok || !res.data) {
        setErrorMessage(res.error || "No se pudo enviar la solicitud de autorización.");
        return;
      }

      const created = res.data;
      const approved = Number(created.approvedDiscount) || 0;

      setActiveDiscountAuth({
        id: created.id,
        status: created.status,
        requestedDiscount: Number(created.requestedDiscount) || numericRequested,
        approvedDiscount: approved,
        reason: created.reason || reason.trim(),
        responseNote: created.responseNote,
        draftSaleId: created.draftSaleId || draftSaleId,
      });

      if (created.status === "APPROVED" || created.status === "PARTIAL") {
        setDiscountAmount(approved);
      }

      if (res.agentTriggered) {
        setSuccessNotice(
          `✅ Solicitud enviada. Notificación enviada al autorizador por ${formatCurrency(numericRequested)}. Esperando respuesta.`
        );
      } else if (res.agentError) {
        setSuccessNotice(
          `⚠️ Solicitud registrada por ${formatCurrency(numericRequested)}, pero hubo demora en el envío: ${res.agentError}. El autorizador puede revisarla en el sistema.`
        );
      } else {
        setSuccessNotice(
          `Solicitud de autorización enviada por ${formatCurrency(numericRequested)}. Esperando confirmación.`
        );
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Error de conexión al solicitar descuento."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyApproved = () => {
    if (activeDiscountAuth?.status === "APPROVED" || activeDiscountAuth?.status === "PARTIAL") {
      setDiscountAmount(activeDiscountAuth.approvedDiscount);
    }
    onClose();
  };

  const handleReset = () => {
    clearDiscount();
    setRequestedAmount("");
    setReason("");
    setErrorMessage(null);
    setSuccessNotice(null);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.badge}>AUTORIZACIÓN DE DESCUENTO</Text>
              <Text style={styles.title}>Autorización de Descuento</Text>
              <Text style={styles.subtitle}>
                Solicita aprobación remota al administrador en tiempo real
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* Subtotal Banner */}
            <View style={styles.subtotalBanner}>
              <Text style={styles.subtotalLabel}>Subtotal de la Venta:</Text>
              <Text style={styles.subtotalValue}>{formatCurrency(subtotal)} MXN</Text>
            </View>

            {/* Error & Success Alerts */}
            {errorMessage && (
              <View style={styles.errorAlert}>
                <Text style={styles.errorAlertText}>⚠️ {errorMessage}</Text>
              </View>
            )}

            {successNotice && (
              <View style={styles.successAlert}>
                <Text style={styles.successAlertText}>{successNotice}</Text>
              </View>
            )}

            {/* ACTIVE AUTHORIZATION STATUS CARD */}
            {activeDiscountAuth && (
              <View
                style={[
                  styles.statusCard,
                  activeDiscountAuth.status === "PENDING" && styles.statusCardPending,
                  activeDiscountAuth.status === "APPROVED" && styles.statusCardApproved,
                  activeDiscountAuth.status === "PARTIAL" && styles.statusCardPartial,
                  activeDiscountAuth.status === "REJECTED" && styles.statusCardRejected,
                ]}
              >
                <View style={styles.statusHeaderRow}>
                  <Text style={styles.statusBadgeText}>
                    {activeDiscountAuth.status === "PENDING" && "⏳ PENDIENTE DE REVISIÓN"}
                    {activeDiscountAuth.status === "APPROVED" && "✅ DESCUENTO APROBADO"}
                    {activeDiscountAuth.status === "PARTIAL" && "ℹ️ APROBACIÓN PARCIAL"}
                    {activeDiscountAuth.status === "REJECTED" && "❌ SOLICITUD RECHAZADA"}
                  </Text>
                  <Text style={styles.statusAmountText}>
                    {activeDiscountAuth.status === "REJECTED"
                      ? "$0 MXN"
                      : `${formatCurrency(activeDiscountAuth.approvedDiscount || activeDiscountAuth.requestedDiscount)} MXN`}
                  </Text>
                </View>

                {activeDiscountAuth.status === "PENDING" && (
                  <View style={styles.pendingDetails}>
                    <Text style={styles.pendingText}>
                      Mensaje de autorización enviado al administrador. El sistema verifica automáticamente cuando responde.
                    </Text>
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={styles.refreshBtn}
                        onPress={() => void checkDiscountStatus()}
                      >
                        <Text style={styles.refreshBtnText}>🔄 Consultar Estado Ahora</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.cancelAuthBtn}
                        onPress={handleReset}
                      >
                        <Text style={styles.cancelAuthBtnText}>Cancelar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {(activeDiscountAuth.status === "APPROVED" || activeDiscountAuth.status === "PARTIAL") && (
                  <View style={styles.approvedDetails}>
                    <Text style={styles.approvedText}>
                      {activeDiscountAuth.status === "PARTIAL"
                        ? `Aprobado por ${formatCurrency(activeDiscountAuth.approvedDiscount)} de ${formatCurrency(activeDiscountAuth.requestedDiscount)} solicitados.`
                        : `Monto autorizado: ${formatCurrency(activeDiscountAuth.approvedDiscount)} MXN.`}
                    </Text>
                    {activeDiscountAuth.responseNote && (
                      <Text style={styles.noteText}>
                        Nota del autorizador: &quot;{activeDiscountAuth.responseNote}&quot;
                      </Text>
                    )}
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={styles.applyBtn}
                        onPress={handleApplyApproved}
                      >
                        <Text style={styles.applyBtnText}>✓ Aplicar al Cobro</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.cancelAuthBtn}
                        onPress={handleReset}
                      >
                        <Text style={styles.cancelAuthBtnText}>Quitar Descuento</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {activeDiscountAuth.status === "REJECTED" && (
                  <View style={styles.rejectedDetails}>
                    <Text style={styles.rejectedText}>
                      La solicitud de {formatCurrency(activeDiscountAuth.requestedDiscount)} fue declinada por el autorizador.
                    </Text>
                    {activeDiscountAuth.responseNote && (
                      <Text style={styles.noteText}>
                        Motivo: &quot;{activeDiscountAuth.responseNote}&quot;
                      </Text>
                    )}
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={styles.retryBtn}
                        onPress={() => {
                          clearDiscount();
                          setRequestedAmount("");
                        }}
                      >
                        <Text style={styles.retryBtnText}>Intentar Otro Monto</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.cancelAuthBtn}
                        onPress={handleReset}
                      >
                        <Text style={styles.cancelAuthBtnText}>Continuar sin Descuento</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* NEW REQUEST FORM (Shown when no active auth or rejected) */}
            {(!activeDiscountAuth || activeDiscountAuth.status === "REJECTED") && (
              <View style={styles.formContainer}>
                {/* Desired Discount Input */}
                <Text style={styles.fieldLabel}>Monto de Descuento Solicitado (MXN) *</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="Ej. 300"
                  placeholderTextColor="#64748b"
                  value={requestedAmount}
                  onChangeText={setRequestedAmount}
                />

                {/* Preset Chips */}
                <View style={styles.chipRow}>
                  {PRESET_AMOUNTS.map((amt) => (
                    <TouchableOpacity
                      key={amt}
                      style={[
                        styles.presetChip,
                        numericRequested === amt && styles.presetChipActive,
                      ]}
                      onPress={() => setRequestedAmount(String(amt))}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          numericRequested === amt && styles.presetChipTextActive,
                        ]}
                      >
                        +{formatCurrency(amt)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Reason Input */}
                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
                  Motivo de la Solicitud *
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="¿Por qué se solicita este descuento?"
                  placeholderTextColor="#64748b"
                  value={reason}
                  onChangeText={setReason}
                />

                {/* Preset Reason Chips */}
                <View style={styles.chipRow}>
                  {PRESET_REASONS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[
                        styles.reasonChip,
                        reason === r && styles.reasonChipActive,
                      ]}
                      onPress={() => setReason(r)}
                    >
                      <Text
                        style={[
                          styles.reasonChipText,
                          reason === r && styles.reasonChipTextActive,
                        ]}
                      >
                        {r}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Submit Button */}
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    (isSubmitting || numericRequested <= 0 || !reason.trim()) &&
                      styles.submitBtnDisabled,
                  ]}
                  onPress={handleRequestAuthorization}
                  disabled={isSubmitting || numericRequested <= 0 || !reason.trim()}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.submitBtnText}>
                      📱 Solicitar Autorización al Administrador
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 580,
    maxHeight: "90%",
    backgroundColor: "#0d131f",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 32,
    elevation: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    paddingBottom: 14,
  },
  badge: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "#60a5fa",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ffffff",
  },
  subtitle: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtnText: {
    color: "#cbd5e1",
    fontSize: 16,
    fontWeight: "600",
  },
  scrollBody: {
    flexGrow: 0,
  },
  subtotalBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    marginBottom: 16,
  },
  subtotalLabel: {
    fontSize: 13,
    color: "#cbd5e1",
    fontWeight: "500",
  },
  subtotalValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#f8fafc",
  },
  errorAlert: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  errorAlertText: {
    color: "#fca5a5",
    fontSize: 12,
    fontWeight: "500",
  },
  successAlert: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.4)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  successAlertText: {
    color: "#86efac",
    fontSize: 12,
    fontWeight: "500",
  },
  statusCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  statusCardPending: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  statusCardApproved: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderColor: "rgba(34, 197, 94, 0.4)",
  },
  statusCardPartial: {
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    borderColor: "rgba(59, 130, 246, 0.4)",
  },
  statusCardRejected: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.4)",
  },
  statusHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#f8fafc",
  },
  statusAmountText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#ffffff",
  },
  pendingDetails: {
    marginTop: 4,
  },
  pendingText: {
    fontSize: 12,
    color: "#fcd34d",
    lineHeight: 18,
  },
  approvedDetails: {
    marginTop: 4,
  },
  approvedText: {
    fontSize: 12,
    color: "#86efac",
    lineHeight: 18,
  },
  rejectedDetails: {
    marginTop: 4,
  },
  rejectedText: {
    fontSize: 12,
    color: "#fca5a5",
    lineHeight: 18,
  },
  noteText: {
    fontSize: 11,
    color: "#cbd5e1",
    fontStyle: "italic",
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  refreshBtn: {
    backgroundColor: "#f59e0b",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  refreshBtnText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "700",
  },
  applyBtn: {
    backgroundColor: "#22c55e",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  applyBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  retryBtn: {
    backgroundColor: "#ef4444",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  retryBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  cancelAuthBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  cancelAuthBtnText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
  },
  formContainer: {
    marginTop: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#cbd5e1",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "#ffffff",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  presetChip: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  presetChipActive: {
    backgroundColor: "rgba(96, 165, 250, 0.2)",
    borderColor: "#60a5fa",
  },
  presetChipText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
  },
  presetChipTextActive: {
    color: "#93c5fd",
  },
  reasonChip: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reasonChipActive: {
    backgroundColor: "rgba(168, 85, 247, 0.2)",
    borderColor: "#c084fc",
  },
  reasonChipText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "500",
  },
  reasonChipTextActive: {
    color: "#e9d5ff",
  },
  submitBtn: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
});
