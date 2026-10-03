/**
 * Pro Buyer Mobile - Handoff Inbox Modal (iPhone)
 *
 * Displays incoming cross-device payment requests from iPad POS terminals
 * and executes Tap to Pay acceptance on physical iPhone.
 */

import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { useTerminal } from "../../contexts/TerminalContext";
import { useAuth } from "../../contexts/AuthContext";
import { IPaymentHandoffInfo } from "@ireader/contracts";

export function HandoffInboxModal() {
  const {
    isIPhone,
    isTapToPayEnabled,
    posDeviceId,
    acceptPaymentHandoff,
    rejectPaymentHandoff,
    collectAndProcessTapToPayPayment,
  } = useTerminal();
  const { apiClient } = useAuth();

  const [pendingHandoff, setPendingHandoff] = useState<IPaymentHandoffInfo | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Poll for assigned handoffs when on iPhone
  useEffect(() => {
    if (!isIPhone || !isTapToPayEnabled) return;

    let active = true;
    const interval = setInterval(async () => {
      if (!active || isProcessing) return;
      try {
        const res = await apiClient.getPendingPaymentHandoffs({ targetDeviceId: posDeviceId });
        if (active && res.ok && res.handoffs && res.handoffs.length > 0) {
          const first = res.handoffs[0];
          if (first.status === "ASSIGNED" || first.status === "WAITING_FOR_DEVICE") {
            setPendingHandoff(first);
          }
        }
      } catch {
        // Silently skip transient polling errors
      }
    }, 2500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isIPhone, isTapToPayEnabled, posDeviceId, apiClient, isProcessing]);

  if (!isIPhone || !pendingHandoff) {
    return null;
  }

  const handleAcceptAndCollect = async () => {
    setIsProcessing(true);
    setStatusMessage("Aceptando solicitud...");
    try {
      const acceptRes = await acceptPaymentHandoff(pendingHandoff.id);
      if (!acceptRes.ok || !acceptRes.clientSecret || !acceptRes.paymentIntentId) {
        throw new Error(acceptRes.error || "No se pudo aceptar el cobro.");
      }

      setStatusMessage("Acerque su tarjeta o dispositivo al iPhone...");

      // Execute contactless Tap to Pay collection on iPhone
      const verifyRes = await collectAndProcessTapToPayPayment(
        {
          ok: true,
          paymentIntentId: acceptRes.paymentIntentId,
          clientSecret: acceptRes.clientSecret,
          posPaymentId: acceptRes.handoff.posPaymentId,
          paymentAttemptId: acceptRes.handoff.paymentAttemptId || "",
          amount: acceptRes.handoff.amount,
          currency: acceptRes.handoff.currency,
          status: "PROCESSING",
        },
        (state) => {
          if (state === "WAITING_FOR_CUSTOMER") {
            setStatusMessage("Acerque su tarjeta al iPhone...");
          } else if (state === "PROCESSING_PAYMENT") {
            setStatusMessage("Procesando pago con el banco...");
          } else if (state === "VERIFYING_PAYMENT") {
            setStatusMessage("Verificando con Stripe...");
          }
        }
      );

      if (verifyRes.ok && (verifyRes.status === "SUCCEEDED" || verifyRes.posPaymentStatus === "PAID")) {
        Alert.alert("¡Pago Aprobado!", `Se cobraron $${pendingHandoff.amount.toFixed(2)} MXN con éxito.`);
        setPendingHandoff(null);
      } else {
        Alert.alert("Error de Cobro", verifyRes.error || "No se pudo procesar el pago.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error inesperado.";
      Alert.alert("Error", msg);
    } finally {
      setIsProcessing(false);
      setStatusMessage(null);
      setPendingHandoff(null);
    }
  };

  const handleReject = async () => {
    try {
      await rejectPaymentHandoff(pendingHandoff.id, "Rechazado por operador en iPhone");
      setPendingHandoff(null);
    } catch {
      setPendingHandoff(null);
    }
  };

  return (
    <Modal visible={Boolean(pendingHandoff)} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.badge}>SOLICITUD DE COBRO</Text>
          <Text style={styles.title}>Cobro Solicitado desde iPad</Text>

          {pendingHandoff.sourceDeviceName ? (
            <Text style={styles.subtitle}>Origen: {pendingHandoff.sourceDeviceName}</Text>
          ) : null}

          {pendingHandoff.saleNumber ? (
            <Text style={styles.saleText}>Venta: {pendingHandoff.saleNumber}</Text>
          ) : null}

          <View style={styles.amountContainer}>
            <Text style={styles.currency}>MXN</Text>
            <Text style={styles.amount}>${pendingHandoff.amount.toFixed(2)}</Text>
          </View>

          {isProcessing ? (
            <View style={styles.processingBox}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.processingText}>{statusMessage || "Procesando..."}</Text>
            </View>
          ) : (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.acceptButton]}
                onPress={handleAcceptAndCollect}
              >
                <Text style={styles.acceptButtonText}>Aceptar y Cobrar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.rejectButton]}
                onPress={handleReject}
              >
                <Text style={styles.rejectButtonText}>Rechazar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  badge: {
    fontSize: 12,
    fontWeight: "700",
    color: "#38bdf8",
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f8fafc",
    marginBottom: 4,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    color: "#94a3b8",
    marginBottom: 4,
  },
  saleText: {
    fontSize: 12,
    color: "#cbd5e1",
    marginBottom: 12,
  },
  amountContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    marginVertical: 16,
    backgroundColor: "#0f172a",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  currency: {
    fontSize: 16,
    fontWeight: "600",
    color: "#94a3b8",
    marginRight: 6,
  },
  amount: {
    fontSize: 28,
    fontWeight: "800",
    color: "#22c55e",
  },
  processingBox: {
    alignItems: "center",
    paddingVertical: 16,
  },
  processingText: {
    color: "#f8fafc",
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
  },
  actions: {
    width: "100%",
    gap: 10,
    marginTop: 8,
  },
  button: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  acceptButton: {
    backgroundColor: "#2563eb",
  },
  acceptButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
  rejectButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#475569",
  },
  rejectButtonText: {
    color: "#94a3b8",
    fontWeight: "600",
    fontSize: 14,
  },
});
