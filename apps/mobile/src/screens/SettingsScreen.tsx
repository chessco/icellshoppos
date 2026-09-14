import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { IPAD_THEME } from "../theme/tokens";
import { Button } from "../components/ui/Button";

export function SettingsScreen() {
  const { session, baseUrl, setBaseUrl, logout } = useAuth();
  const [urlInput, setUrlInput] = useState(baseUrl);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    setBaseUrl(urlInput.trim());
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.screenTitle}>Settings & Diagnostics</Text>

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
              placeholder="http://127.0.0.1:3000"
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.background,
    padding: IPAD_THEME.spacing.xxl,
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
});
