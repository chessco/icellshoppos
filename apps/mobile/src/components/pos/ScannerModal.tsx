import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { IPAD_THEME } from "../../theme/tokens";
import { Button } from "../ui/Button";
import {
  MobileScannerCapability,
  type ScanMatchResult,
  type ScanMatchFailureReason,
} from "../../capabilities/ScannerCapability";
import type {
  IInventoryListItem,
  SmartScanCandidateItem,
} from "@ireader/contracts";
import type { ProBuyerApiClient } from "@ireader/api-client";
import AppleVisionOcr from "apple-vision-ocr";

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
  onProductConfirmed?: (item: IInventoryListItem) => void;
  apiClient?: ProBuyerApiClient;
}

export function ScannerModal({
  visible,
  onClose,
  onScanResult,
  onSearchManually,
  onProductConfirmed,
  apiClient,
}: ScannerModalProps) {
  const [manualCode, setManualCode] = useState("");
  const [hasScanned, setHasScanned] = useState(false);
  const [unmatchedInfo, setUnmatchedInfo] = useState<UnmatchedCodeState | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const scanner = React.useMemo(() => new MobileScannerCapability(), []);
  const cameraRef = React.useRef<CameraView>(null);

  // Smart Scanner OCR & Product Resolution State
  const [isOcrMode, setIsOcrMode] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [isSearchingOcr, setIsSearchingOcr] = useState(false);
  const [ocrStatusMessage, setOcrStatusMessage] = useState<string | null>(null);
  const [identifiedProduct, setIdentifiedProduct] = useState<IInventoryListItem | null>(null);
  const [candidateProducts, setCandidateProducts] = useState<SmartScanCandidateItem[]>([]);

  useEffect(() => {
    if (visible) {
      setHasScanned(false);
      setManualCode("");
      setUnmatchedInfo(null);
      setIsOcrMode(false);
      setOcrText("");
      setIsSearchingOcr(false);
      setOcrStatusMessage(null);
      setIdentifiedProduct(null);
      setCandidateProducts([]);
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
    if (hasScanned || !result.data || unmatchedInfo || isSearchingOcr || identifiedProduct) return;
    setHasScanned(true);
    handleProcessCode(result.data);
  };

  const handleProcessOcr = async (textToProcess: string) => {
    const trimmed = textToProcess.trim();
    if (!trimmed) return;

    setIsSearchingOcr(true);
    setUnmatchedInfo(null);

    const parsedOcr = scanner.parseOcrText(trimmed);

    // 1. If parsed as explicit identifier (IMEI or Serial found on label), use direct lookup
    if (parsedOcr.isIdentifier && parsedOcr.identifierValue) {
      setIsSearchingOcr(false);
      setIsOcrMode(false);
      handleProcessCode(parsedOcr.identifierValue);
      return;
    }

    // 2. Query authoritative Pro Buyer catalog search
    if (apiClient) {
      try {
        const res = await apiClient.searchSmartCatalog({
          scanType: "OCR_TEXT",
          rawText: trimmed,
          parsedIdentifiers: {
            imei: parsedOcr.identifierType === "IMEI" ? parsedOcr.identifierValue : undefined,
            serial: parsedOcr.identifierType === "SERIAL" ? parsedOcr.identifierValue : undefined,
            sku: parsedOcr.identifierType === "SKU" ? parsedOcr.identifierValue : undefined,
            model: parsedOcr.model,
            partNumber: parsedOcr.partNumber,
            brand: parsedOcr.brand,
          },
        });

        setIsSearchingOcr(false);

        if (res.ok && res.data) {
          if (res.data.matchType === "CANDIDATE" || res.data.matchType === "EXACT") {
            const product = res.data.resolvedItem || res.data.candidates[0]?.rawItem;
            if (product) {
              setIdentifiedProduct(product);
              return;
            }
          }

          if (res.data.matchType === "AMBIGUOUS" && res.data.candidates.length > 0) {
            setCandidateProducts(res.data.candidates);
            return;
          }
        }

        // Not found or error
        setUnmatchedInfo({
          raw: trimmed,
          type: "OCR_TEXT",
          normalized: trimmed,
          reason: "NOT_FOUND",
          errorMessage: res.error,
        });
      } catch (err) {
        setIsSearchingOcr(false);
        setUnmatchedInfo({
          raw: trimmed,
          type: "OCR_TEXT",
          normalized: trimmed,
          reason: "ERROR",
          errorMessage: err instanceof Error ? err.message : "Error buscando en catálogo",
        });
      }
    } else {
      // Fallback if no apiClient: pass to manual search
      setIsSearchingOcr(false);
      onSearchManually?.(trimmed);
      onClose();
    }
  };

  const handleRetry = () => {
    setUnmatchedInfo(null);
    setIdentifiedProduct(null);
    setCandidateProducts([]);
    setHasScanned(false);
    setManualCode("");
    setOcrText("");
    setIsOcrMode(false);
    setIsSearchingOcr(false);
    setOcrStatusMessage(null);
  };

  const handleConfirmProduct = () => {
    if (!identifiedProduct) return;
    if (onProductConfirmed) {
      onProductConfirmed(identifiedProduct);
    } else {
      const code = identifiedProduct.imei || identifiedProduct.sku || identifiedProduct.id;
      handleProcessCode(code);
    }
    handleRetry();
    onClose();
  };

  const handleTriggerOcr = async () => {
    // If native Apple Vision module is available (Development Build on iPad)
    if (AppleVisionOcr.isAvailable()) {
      if (!cameraRef.current) return;
      try {
        setIsSearchingOcr(true);
        setOcrStatusMessage("LEYENDO ETIQUETA...");

        const t0 = Date.now();
        const photo = await cameraRef.current.takePictureAsync({
          skipProcessing: true,
          quality: 0.8,
        });
        const tCapture = Date.now() - t0;

        if (!photo?.uri) {
          throw new Error("No se pudo capturar la imagen de la cámara.");
        }

        const t1 = Date.now();
        const { rawText, lines } = await AppleVisionOcr.recognizeText(photo.uri);
        const tOcr = Date.now() - t1;
        const tTotal = Date.now() - t0;

        console.log(
          `[SmartScanner Native OCR] Capture: ${tCapture}ms | Vision: ${tOcr}ms | Total: ${tTotal}ms | Lines: ${lines.length}`
        );

        if (!rawText || !rawText.trim()) {
          setOcrStatusMessage("NO SE DETECTÓ TEXTO");
          setIsSearchingOcr(false);
          setUnmatchedInfo({
            raw: "",
            type: "OCR_TEXT",
            normalized: "No se detectó texto en la etiqueta",
            reason: "NOT_FOUND",
            errorMessage: "Asegúrese de enfocar la etiqueta con buena iluminación e intente de nuevo.",
          });
          return;
        }

        setOcrStatusMessage("TEXTO DETECTADO");
        await handleProcessOcr(rawText);
      } catch (err) {
        setIsSearchingOcr(false);
        setOcrStatusMessage("ERROR DE OCR");
        setUnmatchedInfo({
          raw: "",
          type: "OCR_TEXT",
          normalized: "Error de lectura OCR",
          reason: "ERROR",
          errorMessage: err instanceof Error ? err.message : "Error desconocido al procesar con Apple Vision",
        });
      }
    } else {
      // Expo Go fallback: Toggle manual label text entry drawer
      setIsOcrMode(!isOcrMode);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <View style={styles.header}>
                <Text style={styles.title}>📷 Smart Scanner (Barcode • QR • OCR)</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close scanner">
                  <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* ─── 1. OBLIGATORY OCR PRODUCT CONFIRMATION CARD ─────────────── */}
              {identifiedProduct ? (
                <View style={styles.confirmedContainer}>
                  <View style={styles.confirmedBadge}>
                    <Text style={styles.confirmedIconText}>📦</Text>
                  </View>

                  <Text style={styles.confirmedTag}>PRODUCTO IDENTIFICADO</Text>
                  <Text style={styles.confirmedTitle} numberOfLines={2}>
                    {identifiedProduct.model}
                  </Text>

                  <View style={styles.confirmedPriceBox}>
                    <Text style={styles.confirmedPriceLabel}>PRECIO POS</Text>
                    <Text style={styles.confirmedPriceValue}>
                      ${Number(identifiedProduct.price || 0).toLocaleString("es-MX", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      {identifiedProduct.costCurrency || "MXN"}
                    </Text>
                  </View>

                  <View style={styles.confirmedDetailsBox}>
                    {Boolean(identifiedProduct.capacity || identifiedProduct.color) && (
                      <Text style={styles.confirmedDetailText}>
                        {[identifiedProduct.capacity, identifiedProduct.color].filter(Boolean).join(" • ")}
                      </Text>
                    )}
                    {Boolean(identifiedProduct.sku) && (
                      <Text style={styles.confirmedSkuText}>SKU: {identifiedProduct.sku}</Text>
                    )}
                    <Text style={styles.confirmedNoticeText}>
                      Verifique que el accesorio/equipo físico coincida antes de añadir al carrito.
                    </Text>
                  </View>

                  <View style={styles.confirmedActions}>
                    <Button
                      title="➕ Agregar al Carrito"
                      variant="primary"
                      size="lg"
                      onPress={handleConfirmProduct}
                      accessibilityLabel="Agregar al carrito"
                    />
                    <Button
                      title="🔄 Reintentar / Otra etiqueta"
                      variant="secondary"
                      size="md"
                      onPress={handleRetry}
                      accessibilityLabel="Reintentar"
                    />
                    <Button
                      title="Cerrar"
                      variant="ghost"
                      size="md"
                      onPress={onClose}
                      accessibilityLabel="Cerrar"
                    />
                  </View>
                </View>
              ) : candidateProducts.length > 0 ? (
                /* ─── 2. AMBIGUOUS MULTIPLE CANDIDATES RESOLUTION ────────────── */
                <View style={styles.candidatesContainer}>
                  <View style={styles.candidatesHeader}>
                    <Text style={styles.candidatesTitle}>🔍 Coincidencias de Catálogo</Text>
                    <Text style={styles.candidatesDesc}>
                      Se encontraron {candidateProducts.length} productos coincidentes para la etiqueta. Seleccione el correcto:
                    </Text>
                  </View>

                  <ScrollView style={styles.candidatesList} showsVerticalScrollIndicator={false}>
                    {candidateProducts.map((cand) => (
                      <View key={cand.id} style={styles.candidateCard}>
                        <View style={styles.candidateInfo}>
                          <Text style={styles.candidateModel} numberOfLines={2}>
                            {cand.model}
                          </Text>
                          {Boolean(cand.capacity || cand.color) && (
                            <Text style={styles.candidateSpecs}>
                              {[cand.capacity, cand.color].filter(Boolean).join(" • ")}
                            </Text>
                          )}
                          <Text style={styles.candidatePrice}>
                            ${cand.price.toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN
                          </Text>
                          {Boolean(cand.matchReason) && (
                            <Text style={styles.candidateReason}>{cand.matchReason}</Text>
                          )}
                        </View>
                        <Button
                          title="Seleccionar"
                          variant="primary"
                          size="sm"
                          onPress={() => {
                            if (cand.rawItem) {
                              setIdentifiedProduct(cand.rawItem);
                              setCandidateProducts([]);
                            }
                          }}
                        />
                      </View>
                    ))}
                  </ScrollView>

                  <View style={styles.candidatesActions}>
                    <Button
                      title="🔄 Reintentar escaneo"
                      variant="secondary"
                      size="md"
                      onPress={handleRetry}
                    />
                    <Button
                      title="Cerrar"
                      variant="ghost"
                      size="md"
                      onPress={onClose}
                    />
                  </View>
                </View>
              ) : unmatchedInfo ? (
                /* ─── 3. UNMATCHED FEEDBACK STATE ────────────────────────────── */
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
                      {unmatchedInfo.type === "QR_RAW"
                        ? "CÓDIGO QR / RAW"
                        : unmatchedInfo.type === "OCR_TEXT"
                        ? "LECTURA ETIQUETA / OCR"
                        : unmatchedInfo.type}
                    </Text>
                    <Text style={styles.codeSnippetValue} numberOfLines={2} ellipsizeMode="middle">
                      {unmatchedInfo.normalized}
                    </Text>
                  </View>

                  <Text style={styles.unmatchedDesc}>
                    {unmatchedInfo.reason === "ERROR"
                      ? `No fue posible validar debido a un error de conexión: ${unmatchedInfo.errorMessage || "Verifique su red."}`
                      : unmatchedInfo.reason === "LOADING"
                      ? "El catálogo de inventario aún se está cargando. Espere un momento e intente de nuevo."
                      : `No se encontró ningún producto activo en la sucursal para "${unmatchedInfo.normalized}".`}
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
                /* ─── 4. LIVE VIEWFINDER AND OCR TRIGGER SECTION ────────────── */
                <>
                  <View style={styles.viewfinder}>
                    {permission?.granted ? (
                      <CameraView
                        ref={cameraRef}
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
                        {hasScanned
                          ? "Procesando código..."
                          : "Apunta a código de barras o QR"}
                      </Text>
                    </View>
                  </View>

                  {/* Smart OCR Action Trigger */}
                  <View style={styles.ocrTriggerBox}>
                    <TouchableOpacity
                      style={styles.ocrButton}
                      onPress={handleTriggerOcr}
                      activeOpacity={0.8}
                      disabled={isSearchingOcr}
                    >
                      {isSearchingOcr ? (
                        <ActivityIndicator color={IPAD_THEME.colors.accent} size="small" />
                      ) : (
                        <Text style={styles.ocrButtonIcon}>⚡</Text>
                      )}
                      <View style={styles.ocrButtonTexts}>
                        <Text style={styles.ocrButtonTitle}>
                          {ocrStatusMessage || "Leer Etiqueta / Texto (OCR)"}
                        </Text>
                        <Text style={styles.ocrButtonSubtitle}>
                          {AppleVisionOcr.isAvailable()
                            ? "Apple Vision nativo (Captura instantánea de etiqueta)"
                            : "Para accesorios, cables y productos sin código de barras"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* OCR Input Drawer (When OCR Mode is Active) */}
                  {isOcrMode && (
                    <View style={styles.ocrDrawer}>
                      <Text style={styles.ocrDrawerLabel}>
                        🏷️ Texto de Etiqueta (Apple Vision / OCR)
                      </Text>
                      <Text style={styles.ocrDrawerHint}>
                        Ingrese o pegue el texto impreso en la caja o etiqueta del producto:
                      </Text>
                      <TextInput
                        style={styles.ocrInput}
                        value={ocrText}
                        onChangeText={setOcrText}
                        placeholder="ej. Apple 20W USB-C Power Adapter"
                        placeholderTextColor={IPAD_THEME.colors.textMuted}
                        autoCapitalize="sentences"
                        onSubmitEditing={() => handleProcessOcr(ocrText)}
                        returnKeyType="search"
                      />
                      <View style={styles.ocrActionsRow}>
                        <Button
                          title={isSearchingOcr ? "Buscando en catálogo..." : "🔎 Buscar Producto por OCR"}
                          variant="primary"
                          onPress={() => handleProcessOcr(ocrText)}
                          disabled={!ocrText.trim() || isSearchingOcr}
                        />
                        <Button
                          title="Cancelar"
                          variant="ghost"
                          onPress={() => {
                            setIsOcrMode(false);
                            setOcrText("");
                          }}
                        />
                      </View>
                    </View>
                  )}

                  {/* Manual input fallback */}
                  <View style={styles.manualSection}>
                    <Text style={styles.manualLabel}>Manual Code Entry / Bluetooth Gun</Text>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.input}
                        value={manualCode}
                        onChangeText={setManualCode}
                        placeholder="Type IMEI, Serial, or SKU..."
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
  // ─── Obligatory Product Confirmation Card Styles ─────────────────────────
  confirmedContainer: {
    padding: IPAD_THEME.spacing.xl,
    alignItems: "center",
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.lg,
    borderWidth: 1.5,
    borderColor: IPAD_THEME.colors.accent,
    marginBottom: IPAD_THEME.spacing.md,
  },
  confirmedBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderWidth: 2,
    borderColor: IPAD_THEME.colors.success,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: IPAD_THEME.spacing.sm,
  },
  confirmedIconText: {
    fontSize: 28,
  },
  confirmedTag: {
    fontSize: 12,
    fontWeight: "800",
    color: IPAD_THEME.colors.accent,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  confirmedTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: IPAD_THEME.colors.textPrimary,
    textAlign: "center",
    marginBottom: IPAD_THEME.spacing.sm,
  },
  confirmedPriceBox: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    paddingVertical: IPAD_THEME.spacing.sm,
    paddingHorizontal: IPAD_THEME.spacing.xl,
    borderRadius: IPAD_THEME.radius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    marginBottom: IPAD_THEME.spacing.sm,
  },
  confirmedPriceLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: IPAD_THEME.colors.textMuted,
    letterSpacing: 0.8,
  },
  confirmedPriceValue: {
    fontSize: 24,
    fontWeight: "900",
    color: IPAD_THEME.colors.success,
    marginTop: 2,
  },
  confirmedDetailsBox: {
    alignItems: "center",
    marginBottom: IPAD_THEME.spacing.lg,
  },
  confirmedDetailText: {
    fontSize: 14,
    fontWeight: "600",
    color: IPAD_THEME.colors.textSecondary,
    marginBottom: 2,
  },
  confirmedSkuText: {
    fontSize: 12,
    fontWeight: "600",
    color: IPAD_THEME.colors.textMuted,
    fontFamily: "Courier",
    marginBottom: 6,
  },
  confirmedNoticeText: {
    fontSize: 11,
    color: IPAD_THEME.colors.textMuted,
    textAlign: "center",
    fontStyle: "italic",
  },
  confirmedActions: {
    width: "100%",
    gap: IPAD_THEME.spacing.sm,
  },
  // ─── Candidates Selector Styles ──────────────────────────────────────────
  candidatesContainer: {
    padding: IPAD_THEME.spacing.md,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.lg,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    maxHeight: 460,
  },
  candidatesHeader: {
    marginBottom: IPAD_THEME.spacing.md,
  },
  candidatesTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: IPAD_THEME.colors.textPrimary,
    marginBottom: 4,
  },
  candidatesDesc: {
    fontSize: 13,
    color: IPAD_THEME.colors.textSecondary,
    lineHeight: 18,
  },
  candidatesList: {
    maxHeight: 260,
    marginBottom: IPAD_THEME.spacing.md,
  },
  candidateCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    padding: IPAD_THEME.spacing.md,
    borderRadius: IPAD_THEME.radius.md,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    marginBottom: IPAD_THEME.spacing.sm,
    gap: IPAD_THEME.spacing.md,
  },
  candidateInfo: {
    flex: 1,
  },
  candidateModel: {
    fontSize: 14,
    fontWeight: "700",
    color: IPAD_THEME.colors.textPrimary,
    marginBottom: 2,
  },
  candidateSpecs: {
    fontSize: 12,
    color: IPAD_THEME.colors.textMuted,
    marginBottom: 2,
  },
  candidatePrice: {
    fontSize: 14,
    fontWeight: "800",
    color: IPAD_THEME.colors.success,
  },
  candidateReason: {
    fontSize: 11,
    color: IPAD_THEME.colors.accent,
    marginTop: 2,
  },
  candidatesActions: {
    gap: IPAD_THEME.spacing.xs,
  },
  // ─── Smart OCR Trigger & Drawer Styles ───────────────────────────────────
  ocrTriggerBox: {
    marginBottom: IPAD_THEME.spacing.md,
  },
  ocrButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    borderWidth: 1.5,
    borderColor: IPAD_THEME.colors.accent,
    borderRadius: IPAD_THEME.radius.md,
    paddingVertical: IPAD_THEME.spacing.sm,
    paddingHorizontal: IPAD_THEME.spacing.md,
    gap: IPAD_THEME.spacing.sm,
  },
  ocrButtonIcon: {
    fontSize: 22,
  },
  ocrButtonTexts: {
    flex: 1,
  },
  ocrButtonTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: IPAD_THEME.colors.textPrimary,
  },
  ocrButtonSubtitle: {
    fontSize: 11,
    color: IPAD_THEME.colors.textSecondary,
    marginTop: 1,
  },
  ocrDrawer: {
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    padding: IPAD_THEME.spacing.md,
    marginBottom: IPAD_THEME.spacing.md,
  },
  ocrDrawerLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: IPAD_THEME.colors.accent,
    marginBottom: 2,
  },
  ocrDrawerHint: {
    fontSize: 11,
    color: IPAD_THEME.colors.textMuted,
    marginBottom: IPAD_THEME.spacing.sm,
  },
  ocrInput: {
    height: IPAD_THEME.touchTarget.minHeight,
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderRadius: IPAD_THEME.radius.md,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    paddingHorizontal: IPAD_THEME.spacing.md,
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 14,
    marginBottom: IPAD_THEME.spacing.sm,
  },
  ocrActionsRow: {
    flexDirection: "row",
    gap: IPAD_THEME.spacing.sm,
    alignItems: "center",
  },
});
