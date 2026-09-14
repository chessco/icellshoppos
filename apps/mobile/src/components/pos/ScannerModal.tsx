import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
} from "react-native";
import { IPAD_THEME } from "../../theme/tokens";
import { Button } from "../ui/Button";
import { MobileScannerCapability } from "../../capabilities/ScannerCapability";

interface ScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanResult: (raw: string, type: string, normalized: string) => void;
}

export function ScannerModal({ visible, onClose, onScanResult }: ScannerModalProps) {
  const [manualCode, setManualCode] = useState("");
  const scanner = React.useMemo(() => new MobileScannerCapability(), []);

  const handleProcessCode = (code: string) => {
    if (!code.trim()) return;
    const parsed = scanner.parseScannedCode(code);
    onScanResult(code, parsed.type, parsed.normalizedValue);
    setManualCode("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <View style={styles.header}>
                <Text style={styles.title}>📷 Scan Device / Barcode</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Viewfinder simulation box */}
              <View style={styles.viewfinder}>
                <View style={styles.reticle}>
                  <View style={[styles.corner, styles.tl]} />
                  <View style={[styles.corner, styles.tr]} />
                  <View style={[styles.corner, styles.bl]} />
                  <View style={[styles.corner, styles.br]} />
                  <Text style={styles.reticleText}>Point camera at IMEI or Barcode</Text>
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
                    autoFocus
                  />
                  <Button
                    title="Process"
                    variant="primary"
                    onPress={() => handleProcessCode(manualCode)}
                    disabled={!manualCode.trim()}
                  />
                </View>
              </View>
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
});
