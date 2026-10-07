import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useAuth, PROD_BACKEND_URL } from "../contexts/AuthContext";
import { usePosLayout } from "../contexts/PosLayoutContext";
import { IPAD_THEME } from "../theme/tokens";
import { Button } from "../components/ui/Button";
import { useTerminal } from "../contexts/TerminalContext";
import type { IDiscoveredReader } from "../services/StripeTerminalAdapter";

export function SettingsScreen() {
  const { session, baseUrl, setBaseUrl, logout, apiClient } = useAuth();
  const { layoutMode, setLayoutMode } = usePosLayout();
  const {
    capabilities,
    discoveredReaders,
    connectedReader,
    defaultReaderId,
    readerHealth,
    isDiscovering,
    discoverReaders,
    connectReader,
    setDefaultReader,
    checkReaderStatus,
  } = useTerminal();
  const [urlInput, setUrlInput] = useState(baseUrl);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [readerNames, setReaderNames] = useState<Record<string, string>>({});
  const [readerMessage, setReaderMessage] = useState<string | null>(null);

  const handleSave = () => {
    setBaseUrl(urlInput.trim());
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleDiscoverReaders = async () => {
    setReaderMessage(null);
    const readers = await discoverReaders();
    setReaderNames((current) => {
      const next = { ...current };
      readers.forEach((reader) => {
        if (!next[reader.id]) next[reader.id] = reader.label || reader.deviceType;
      });
      return next;
    });
    setReaderMessage(readers.length ? `${readers.length} terminal(es) encontrado(s).` : "No se encontraron terminales.");
  };

  const handleSaveReaderName = async (reader: IDiscoveredReader) => {
    const label = readerNames[reader.id]?.trim() || reader.label || reader.deviceType;
    const result = await apiClient.registerStripeReader({
      stripeReaderId: reader.stripeReaderId || reader.id,
      label,
      serialNumber: reader.serialNumber,
      deviceType: reader.deviceType,
      stripeLocationId: capabilities.stripeLocationId || undefined,
    });
    setReaderMessage(result.ok ? `Nombre guardado para ${label}.` : result.error || "No se pudo guardar el nombre.");
  };

  const handleUseAsDefault = async (reader: IDiscoveredReader) => {
    await setDefaultReader(reader);
    const connected = await connectReader(reader);
    setReaderMessage(
      connected
        ? `Terminal predeterminada y lista: ${readerNames[reader.id] || reader.label || reader.deviceType}.`
        : "La terminal quedó como predeterminada, pero no está lista para cobrar."
    );
  };

  const handleCheckReaderStatus = async (reader: IDiscoveredReader) => {
    const status = await checkReaderStatus(reader);
    const labels = { NO_READER: "sin terminal", OFFLINE: "fuera de línea", ONLINE: "en línea", READY: "lista para cobrar" };
    setReaderMessage(`${readerNames[reader.id] || reader.label || reader.deviceType}: ${labels[status]}.`);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={true}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.content}>
        <View style={styles.settingsTitleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.screenTitle}>Settings & Diagnostics</Text>
            <Text style={styles.settingsTerminalHint}>Terminales Stripe: configura lectores y verifica cuál está lista para cobrar.</Text>
          </View>
          <TouchableOpacity
            style={styles.topReaderButton}
            onPress={() => void handleDiscoverReaders()}
            disabled={isDiscovering}
            accessibilityRole="button"
            accessibilityLabel="Buscar terminales Stripe"
          >
            <Text style={styles.topReaderButtonText}>{isDiscovering ? "Buscando..." : "🔎 Terminales Stripe"}</Text>
          </TouchableOpacity>
        </View>

        {/* POS Mode Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Modo de Interfaz Punto de Venta (POS)</Text>
          <Text style={styles.sectionSub}>
            Selecciona la experiencia visual predeterminada para el operador. También puedes alternar en cualquier momento desde la barra superior.
          </Text>

          <View style={styles.layoutModeCards}>
            <TouchableOpacity
              style={[styles.modeCard, layoutMode === "apple_touch" && styles.modeCardActive]}
              onPress={() => setLayoutMode("apple_touch")}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Activar Modo Táctil Apple"
            >
              <Text style={styles.modeCardIcon}>📱</Text>
              <View style={styles.modeCardContent}>
                <Text style={[styles.modeCardTitle, layoutMode === "apple_touch" && styles.modeCardTitleActive]}>
                  Modo Táctil Apple (Recomendado)
                </Text>
                <Text style={styles.modeCardDesc}>
                  Tarjetas táctiles de producto, categorías superiores (iPhone, iPad, Mac...) y ticket de cobro interactivo lateral.
                </Text>
              </View>
              {layoutMode === "apple_touch" && <Text style={styles.modeCheck}>✓ Activo</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeCard, layoutMode === "classic" && styles.modeCardActive]}
              onPress={() => setLayoutMode("classic")}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Activar Modo Catálogo Web Clásico"
            >
              <Text style={styles.modeCardIcon}>🖥️</Text>
              <View style={styles.modeCardContent}>
                <Text style={[styles.modeCardTitle, layoutMode === "classic" && styles.modeCardTitleActive]}>
                  Modo Catálogo Web (Clásico)
                </Text>
                <Text style={styles.modeCardDesc}>
                  Parrilla tradicional con buscador detallado, filtros por chips y panel lateral deslizable de detalle.
                </Text>
              </View>
              {layoutMode === "classic" && <Text style={styles.modeCheck}>✓ Activo</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* Stripe Terminal Management */}
        <View style={styles.section}>
          <View style={styles.readerSectionHeader}>
            <View style={styles.readerSectionHeaderText}>
              <Text style={styles.sectionTitle}>Terminales Stripe</Text>
              <Text style={styles.sectionSub}>
                Busca terminales, asigna un nombre y selecciona cuál usará este iPad por defecto.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.readerActionButton}
              onPress={() => void handleDiscoverReaders()}
              disabled={isDiscovering}
            >
              <Text style={styles.readerActionText}>{isDiscovering ? "Buscando..." : "Buscar terminales"}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.readerHealthRow}>
            <Text style={styles.infoKey}>Estado actual</Text>
            <Text style={[styles.infoVal, readerHealth === "READY" && styles.readerReadyText]}>
              {readerHealth === "READY" ? "LISTA PARA COBRAR" : readerHealth}
            </Text>
          </View>

          {readerMessage && <Text style={styles.readerMessage}>{readerMessage}</Text>}

          {discoveredReaders.length === 0 ? (
            <Text style={styles.readerEmptyText}>Presiona “Buscar terminales” para comenzar.</Text>
          ) : (
            discoveredReaders.map((reader) => {
              const readerName = readerNames[reader.id] || reader.label || reader.deviceType;
              const isDefault = defaultReaderId === reader.id;
              const isConnected = connectedReader?.id === reader.id;
              return (
                <View key={reader.id} style={[styles.readerConfigRow, isDefault && styles.readerConfigRowActive]}>
                  <View style={styles.readerConfigInfo}>
                    <Text style={styles.readerDeviceText}>{readerName}</Text>
                    <Text style={styles.readerMetaText}>
                      {reader.deviceType} · S/N {reader.serialNumber} · {reader.status}
                    </Text>
                    <TextInput
                      style={styles.readerNameInput}
                      value={readerNames[reader.id] || readerName}
                      onChangeText={(value) => setReaderNames((current) => ({ ...current, [reader.id]: value }))}
                      placeholder="Nombre de la terminal"
                      placeholderTextColor={IPAD_THEME.colors.textMuted}
                    />
                  </View>
                  <View style={styles.readerConfigActions}>
                    <TouchableOpacity style={styles.smallReaderButton} onPress={() => void handleSaveReaderName(reader)}>
                      <Text style={styles.smallReaderButtonText}>Guardar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallReaderButton, isDefault && styles.smallReaderButtonActive]}
                      onPress={() => void handleUseAsDefault(reader)}
                    >
                      <Text style={styles.smallReaderButtonText}>{isDefault ? "Predeterminada" : "Usar aquí"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.smallReaderButton} onPress={() => void handleCheckReaderStatus(reader)}>
                      <Text style={styles.smallReaderButtonText}>{isConnected ? "Verificar" : "Estado"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Server Config */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pro Buyer API Connection</Text>
          <Text style={styles.sectionSub}>
            Authoritative backend endpoint for inventory, pricing, checkout, and customer messaging.
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginVertical: 12 }}>
            <TouchableOpacity
              style={[styles.presetBtn, urlInput === PROD_BACKEND_URL && styles.presetBtnActive]}
              onPress={() => {
                setUrlInput(PROD_BACKEND_URL);
                setBaseUrl(PROD_BACKEND_URL);
                setSavedSuccess(true);
                setTimeout(() => setSavedSuccess(false), 2000);
              }}
            >
              <Text style={[styles.presetBtnText, urlInput === PROD_BACKEND_URL && styles.presetBtnTextActive]}>
                🌐 Producción Cloud (probuyer.pitayacode.io)
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Base URL</Text>
            <TextInput
              style={styles.input}
              value={urlInput}
              onChangeText={setUrlInput}
              placeholder="https://..."
              placeholderTextColor={IPAD_THEME.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Button
            title={savedSuccess ? "✓ Base URL Saved" : "Save Backend URL"}
            variant="primary"
            onPress={handleSave}
          />
        </View>

        {/* Operator Session */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Operator Session</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Active User</Text>
            <Text style={styles.infoVal}>{session?.email || "N/A"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Organization ID</Text>
            <Text style={styles.infoVal}>{session?.activeOrganizationId || "Default"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Client Platform</Text>
            <Text style={styles.infoVal}>iPadOS / React Native (Expo SDK 52)</Text>
          </View>

          <Button
            title="Sign Out of iReader"
            variant="danger"
            onPress={() => void logout()}
            style={styles.logoutBtn}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.background,
  },
  scrollContent: {
    padding: IPAD_THEME.spacing.xxl,
    paddingBottom: IPAD_THEME.spacing.xxl * 3,
  },
  content: {
    maxWidth: 680,
    alignSelf: "center",
    width: "100%",
  },
  screenTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 26,
    fontWeight: "900",
    marginBottom: IPAD_THEME.spacing.xs,
  },
  settingsTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: IPAD_THEME.spacing.lg,
    marginBottom: IPAD_THEME.spacing.xl,
  },
  settingsTerminalHint: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  topReaderButton: {
    minHeight: IPAD_THEME.touchTarget.minHeight,
    paddingHorizontal: IPAD_THEME.spacing.lg,
    borderRadius: IPAD_THEME.radius.md,
    backgroundColor: IPAD_THEME.colors.accentMuted,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  topReaderButtonText: {
    color: IPAD_THEME.colors.accent,
    fontSize: 13,
    fontWeight: "900",
  },
  section: {
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderRadius: IPAD_THEME.radius.lg,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    padding: IPAD_THEME.spacing.xl,
    marginBottom: IPAD_THEME.spacing.xl,
  },
  sectionTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 4,
  },
  sectionSub: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
    marginBottom: IPAD_THEME.spacing.lg,
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: IPAD_THEME.spacing.md,
  },
  label: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: IPAD_THEME.spacing.xs,
    textTransform: "uppercase",
  },
  input: {
    height: IPAD_THEME.touchTarget.minHeight,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    paddingHorizontal: IPAD_THEME.spacing.md,
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 15,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: IPAD_THEME.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  infoKey: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 14,
  },
  infoVal: {
    color: IPAD_THEME.colors.textPrimary,
    fontWeight: "700",
    fontSize: 14,
  },
  logoutBtn: {
    marginTop: IPAD_THEME.spacing.lg,
  },
  layoutModeCards: {
    gap: IPAD_THEME.spacing.md,
  },
  modeCard: {
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.lg,
    padding: IPAD_THEME.spacing.lg,
    borderWidth: 1.5,
    borderColor: IPAD_THEME.colors.borderSubtle,
    flexDirection: "row",
    alignItems: "center",
  },
  modeCardActive: {
    borderColor: IPAD_THEME.colors.accent,
    backgroundColor: "rgba(56, 189, 248, 0.08)",
  },
  modeCardIcon: {
    fontSize: 28,
    marginRight: IPAD_THEME.spacing.md,
  },
  modeCardContent: {
    flex: 1,
  },
  modeCardTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  modeCardTitleActive: {
    color: IPAD_THEME.colors.accent,
  },
  modeCardDesc: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  modeCheck: {
    color: IPAD_THEME.colors.accent,
    fontSize: 13,
    fontWeight: "800",
    marginLeft: IPAD_THEME.spacing.md,
  },
  readerSectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: IPAD_THEME.spacing.md,
  },
  readerSectionHeaderText: {
    flex: 1,
  },
  readerActionButton: {
    minHeight: IPAD_THEME.touchTarget.minHeight,
    paddingHorizontal: IPAD_THEME.spacing.md,
    borderRadius: IPAD_THEME.radius.md,
    backgroundColor: IPAD_THEME.colors.accentMuted,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  readerActionText: {
    color: IPAD_THEME.colors.accent,
    fontSize: 12,
    fontWeight: "800",
  },
  readerHealthRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: IPAD_THEME.spacing.sm,
    marginBottom: IPAD_THEME.spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  readerReadyText: {
    color: IPAD_THEME.colors.success,
  },
  readerMessage: {
    color: IPAD_THEME.colors.accent,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: IPAD_THEME.spacing.sm,
  },
  readerEmptyText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 13,
  },
  readerConfigRow: {
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    padding: IPAD_THEME.spacing.md,
    marginBottom: IPAD_THEME.spacing.sm,
  },
  readerConfigRowActive: {
    borderColor: IPAD_THEME.colors.accent,
    backgroundColor: "rgba(56, 189, 248, 0.08)",
  },
  readerConfigInfo: {
    marginBottom: IPAD_THEME.spacing.sm,
  },
  readerDeviceText: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
  readerMetaText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  readerNameInput: {
    height: IPAD_THEME.touchTarget.minHeight,
    marginTop: IPAD_THEME.spacing.sm,
    backgroundColor: IPAD_THEME.colors.background,
    borderRadius: IPAD_THEME.radius.sm,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    paddingHorizontal: IPAD_THEME.spacing.sm,
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 13,
  },
  readerConfigActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: IPAD_THEME.spacing.sm,
  },
  smallReaderButton: {
    minHeight: 38,
    paddingHorizontal: IPAD_THEME.spacing.sm,
    borderRadius: IPAD_THEME.radius.sm,
    backgroundColor: IPAD_THEME.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  smallReaderButtonActive: {
    backgroundColor: IPAD_THEME.colors.accent,
    borderColor: IPAD_THEME.colors.accent,
  },
  smallReaderButtonText: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 11,
    fontWeight: "800",
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: IPAD_THEME.radius.md,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: IPAD_THEME.colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  presetBtnActive: {
    borderColor: IPAD_THEME.colors.accent,
    backgroundColor: "rgba(56, 189, 248, 0.12)",
  },
  presetBtnText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  presetBtnTextActive: {
    color: IPAD_THEME.colors.accent,
  },
});
