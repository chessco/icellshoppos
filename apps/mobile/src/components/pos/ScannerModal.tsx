import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
} from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { IPAD_THEME } from "../../theme/tokens";
import { Button } from "../ui/Button";
import {
  MobileScannerCapability,
  type ScanMatchResult,
  type ScanMatchFailureReason,
} from "../../capabilities/ScannerCapability";

export interface UnmatchedCodeState {
  raw: string;
  type: string;
  normalized: string;
  reason: ScanMatchFailureReason;
  errorMessage?: string;
}

interface ScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanResult: (raw: string, type: string, normalized: string) => ScanMatchResult | void;
  onSearchManually?: (query: string) => void;
}

export function ScannerModal({
  visible,
  onClose,
  onScanResult,
  onSearchManually,
}: ScannerModalProps) {
  const [manualCode, setManualCode] = useState("");
  const [hasScanned, setHasScanned] = useState(false);
  const [unmatchedInfo, setUnmatchedInfo] = useState<UnmatchedCodeState | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const scanner = React.useMemo(() => new MobileScannerCapability(), []);

  useEffect(() => {
    if (visible) {
      setHasScanned(false);
      setManualCode("");
      setUnmatchedInfo(null);
      if (!permission?.granted) {
        void requestPermission();
      }
    }
  }, [visible]);

  const handleProcessCode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    // Prevent duplicate processing if already showing feedback for this code
    if (unmatchedInfo && unmatchedInfo.raw === trimmed) {
      return;
    }

    const parsed = scanner.parseScannedCode(trimmed);
    const res = onScanResult(trimmed, parsed.type, parsed.normalizedValue);

    const isMatch = res && typeof res === "object" && "matched" in res ? res.matched : Boolean(res);

    if (isMatch) {
      setUnmatchedInfo(null);
      setManualCode("");
      onClose();
    } else {
      setHasScanned(true); // Disable camera scanning loop
      setUnmatchedInfo({
        raw: trimmed,
        type: parsed.type,
        normalized: parsed.normalizedValue,
        reason: (typeof res === "object" && res && res.reason) || "NOT_FOUND",
        errorMessage: typeof res === "object" && res ? res.errorMessage : undefined,
      });
    }
  };

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (hasScanned || !result.data || unmatchedInfo) return;
    setHasScanned(true);
    handleProcessCode(result.data);
  };

  const handleRetry = () => {
    setUnmatchedInfo(null);
    setHasScanned(false);
    setManualCode("");
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <View style={styles.header}>
                <Text style={styles.title}>📷 Scan Device / Barcode</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close scanner">
                  <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
              </View>

              {unmatchedInfo ? (
                /* Unmatched Feedback State */
                <View style={styles.unmatchedContainer}>
                  <View style={styles.unmatchedBadge}>
                    <Text style={styles.unmatchedIconText}>
                      {unmatchedInfo.reason === "ERROR"
                        ? "⚠️"
                        : unmatchedInfo.reason === "LOADING"
                        ? "⏳"
                        : "🔍"}
                    </Text>
                  </View>

                  <Text style={styles.unmatchedTitle}>
                    {unmatchedInfo.reason === "ERROR"
                      ? "Inventario no disponible"
                      : unmatchedInfo.reason === "LOADING"
                      ? "Sincronizando inventario"
                      : "Producto no encontrado"}
                  </Text>

                  <View style={styles.codeSnippetBox}>
                    <Text style={styles.codeSnippetType}>
                      {unmatchedInfo.type === "QR_RAW" ? "CÓDIGO QR / RAW" : unmatchedInfo.type}
                    </Text>
                    <Text style={styles.codeSnippetValue} numberOfLines={2} ellipsizeMode="middle">
                      {unmatchedInfo.normalized}
                    </Text>
                  </View>

                  <Text style={styles.unmatchedDesc}>
                    {unmatchedInfo.reason === "ERROR"
                      ? `No fue posible validar el código debido a un error de conexión: ${unmatchedInfo.errorMessage || "Verifique su red."}`
                      : unmatchedInfo.reason === "LOADING"
                      ? "El catálogo de inventario aún se está cargando. Espere un momento e intente de nuevo."
                      : `El código ${unmatchedInfo.normalized} no corresponde a ningún equipo disponible en la sucursal.`}
                  </Text>

                  <View style={styles.unmatchedActions}>
                    <Button
                      title="🔄 Escanear de nuevo"
                      variant="primary"
                      size="lg"
                      onPress={handleRetry}
                      accessibilityLabel="Escanear de nuevo"
                    />

                    {onSearchManually && (
                      <Button
                        title="🔎 Búsqueda manual en catálogo"
                        variant="secondary"
                        size="md"
                        onPress={() => {
                          const query = unmatchedInfo.normalized;
                          handleRetry();
                          onSearchManually(query);
                        }}
                        accessibilityLabel="Búsqueda manual en catálogo"
                      />
                    )}

                    <Button
                      title="Cerrar"
                      variant="ghost"
                      size="md"
                      onPress={onClose}
                      accessibilityLabel="Cerrar escáner"
                    />
                  </View>
                </View>
              ) : (
                /* Live Viewfinder and Manual Input Section */
                <>
                  <View style={styles.viewfinder}>
                    {permission?.granted ? (
                      <CameraView
                        style={StyleSheet.absoluteFill}
                        facing="back"
                        barcodeScannerSettings={{
                          barcodeTypes: [
                            "qr",
                            "code128",
                            "code39",
                            "ean13",
                            "ean8",
                            "upc_a",
                            "upc_e",
                            "code93",
                            "itf14",
                            "pdf417",
                            "datamatrix",
                          ],
                        }}
                        onBarcodeScanned={hasScanned ? undefined : handleBarcodeScanned}
                      />
                    ) : (
                      <View style={styles.permissionPrompt}>
                        <Text style={styles.permissionText}>Camera access required to scan</Text>
                        <Button
                          title="Enable Camera"
                          variant="secondary"
                          onPress={() => void requestPermission()}
                        />
                      </View>
                    )}

                    {/* Reticle Overlay */}
                    <View style={styles.reticle} pointerEvents="none">
                      <View style={[styles.corner, styles.tl]} />
                      <View style={[styles.corner, styles.tr]} />
                      <View style={[styles.corner, styles.bl]} />
                      <View style={[styles.corner, styles.br]} />
                      <Text style={styles.reticleText}>
                        {hasScanned ? "Processing..." : "Point camera at IMEI or Barcode"}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.helperText}>
                    Supports 15-digit IMEIs, Apple Serial Numbers (10-12 chars), SKUs, and QR codes.
                  </Text>

                  {/* Manual input fallback */}
                  <View style={styles.manualSection}>
                    <Text style={styles.manualLabel}>Manual Code Entry / Bluetooth Gun</Text>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.input}
                        value={manualCode}
                        onChangeText={setManualCode}
                        placeholder="Type or paste code..."
                        placeholderTextColor={IPAD_THEME.colors.textMuted}
                        autoCapitalize="characters"
                        onSubmitEditing={() => handleProcessCode(manualCode)}
                        returnKeyType="done"
                      />
                      <Button
                        title="Process"
                        variant="primary"
                        onPress={() => handleProcessCode(manualCode)}
                        disabled={!manualCode.trim()}
                      />
                    </View>
                  </View>
                </>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
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
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: IPAD_THEME.spacing.md,
  },
  title: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 20,
    fontWeight: "800",
  },
  closeBtn: {
    padding: IPAD_THEME.spacing.xs,
  },
  closeText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 16,
  },
  viewfinder: {
    height: 220,
    backgroundColor: "#000000",
    borderRadius: IPAD_THEME.radius.lg,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: IPAD_THEME.spacing.md,
    overflow: "hidden",
  },
  reticle: {
    width: 260,
    height: 140,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 20,
    height: 20,
    borderColor: IPAD_THEME.colors.accent,
  },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  reticleText: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  helperText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 12,
    textAlign: "center",
    marginBottom: IPAD_THEME.spacing.lg,
  },
  manualSection: {
    borderTopWidth: 1,
    borderTopColor: IPAD_THEME.colors.borderSubtle,
    paddingTop: IPAD_THEME.spacing.md,
  },
  manualLabel: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: IPAD_THEME.spacing.xs,
  },
  inputRow: {
    flexDirection: "row",
    gap: IPAD_THEME.spacing.sm,
  },
  input: {
    flex: 1,
    height: IPAD_THEME.touchTarget.minHeight,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    paddingHorizontal: IPAD_THEME.spacing.md,
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 15,
  },
  permissionPrompt: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    alignItems: "center",
    padding: IPAD_THEME.spacing.md,
    gap: IPAD_THEME.spacing.sm,
    backgroundColor: "#000000",
    zIndex: 1,
  },
  permissionText: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
  },
  unmatchedContainer: {
    padding: IPAD_THEME.spacing.lg,
    alignItems: "center",
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.lg,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    marginBottom: IPAD_THEME.spacing.md,
  },
  unmatchedBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderWidth: 1.5,
    borderColor: IPAD_THEME.colors.warning,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: IPAD_THEME.spacing.sm,
  },
  unmatchedIconText: {
    fontSize: 28,
  },
  unmatchedTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: IPAD_THEME.colors.textPrimary,
    marginBottom: IPAD_THEME.spacing.xs,
    textAlign: "center",
  },
  codeSnippetBox: {
    width: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    borderRadius: IPAD_THEME.radius.md,
    padding: IPAD_THEME.spacing.md,
    marginVertical: IPAD_THEME.spacing.sm,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  codeSnippetType: {
    fontSize: 11,
    fontWeight: "800",
    color: IPAD_THEME.colors.accent,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  codeSnippetValue: {
    fontSize: 16,
    fontWeight: "700",
    color: IPAD_THEME.colors.textPrimary,
    fontFamily: "Courier",
    textAlign: "center",
  },
  unmatchedDesc: {
    fontSize: 13,
    color: IPAD_THEME.colors.textSecondary,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: IPAD_THEME.spacing.lg,
  },
  unmatchedActions: {
    width: "100%",
    gap: IPAD_THEME.spacing.sm,
  },
});
