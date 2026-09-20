import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { usePosLayout } from "../contexts/PosLayoutContext";
import { IPAD_THEME } from "../theme/tokens";
import { Button } from "../components/ui/Button";

export function SettingsScreen() {
  const { session, baseUrl, setBaseUrl, logout } = useAuth();
  const { layoutMode, setLayoutMode } = usePosLayout();
  const [urlInput, setUrlInput] = useState(baseUrl);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    setBaseUrl(urlInput.trim());
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={true}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.content}>
        <Text style={styles.screenTitle}>Settings & Diagnostics</Text>

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

        {/* Server Config */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pro Buyer API Connection</Text>
          <Text style={styles.sectionSub}>
            Authoritative backend endpoint for inventory, pricing, and checkout operations.
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Base URL</Text>
            <TextInput
              style={styles.input}
              value={urlInput}
              onChangeText={setUrlInput}
              placeholder="http://127.0.0.1:3007"
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
    marginBottom: IPAD_THEME.spacing.xl,
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
});
