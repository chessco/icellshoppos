import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { IPAD_THEME } from "../theme/tokens";

export function LoginScreen() {
  const { login, isLoading, requires2FA, loginError, baseUrl, setBaseUrl } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [tempUrl, setTempUrl] = useState(baseUrl);

  const handleSignIn = async () => {
    if (!email.trim() || !password) return;
    await login(email.trim(), password, requires2FA ? code.trim() : undefined);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.card}>
        <View style={styles.brandBadge}>
          <Text style={styles.badgeText}>iReader POS</Text>
        </View>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to your Pro Buyer store account</Text>

        {loginError && (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Text style={styles.errorText}>{loginError}</Text>
          </View>
        )}

        {!requires2FA ? (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="operator@icellshop.com"
                placeholderTextColor={IPAD_THEME.colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                accessibilityLabel="Email Address"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={IPAD_THEME.colors.textMuted}
                secureTextEntry
                accessibilityLabel="Password"
              />
            </View>
          </>
        ) : (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Two-Factor Authentication Code</Text>
            <Text style={styles.hint}>Enter the 6-digit code sent to your email.</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={IPAD_THEME.colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              accessibilityLabel="Two Factor Verification Code"
            />
          </View>
        )}

        <TouchableOpacity
          style={[styles.submitButton, isLoading && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel={requires2FA ? "Verify Code" : "Sign In"}
        >
          {isLoading ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <Text style={styles.submitButtonText}>{requires2FA ? "Verify Code" : "Sign In"}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.configToggle}
          onPress={() => setShowConfig(!showConfig)}
          accessibilityRole="button"
        >
          <Text style={styles.configToggleText}>
            {showConfig ? "Hide Server URL" : "Configure Backend URL"}
          </Text>
        </TouchableOpacity>

        {showConfig && (
          <View style={styles.configBox}>
            <Text style={styles.label}>Pro Buyer Server URL</Text>
            <TextInput
              style={styles.input}
              value={tempUrl}
              onChangeText={setTempUrl}
              placeholder="https://pos.icellshop.com"
              placeholderTextColor={IPAD_THEME.colors.textMuted}
              autoCapitalize="none"
              accessibilityLabel="Server Base URL"
            />
            <TouchableOpacity
              style={styles.saveUrlButton}
              onPress={() => setBaseUrl(tempUrl.trim())}
              accessibilityRole="button"
            >
              <Text style={styles.saveUrlText}>Apply Server URL</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: IPAD_THEME.spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderRadius: IPAD_THEME.radius.xl,
    padding: IPAD_THEME.spacing.xxl,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
  },
  brandBadge: {
    alignSelf: "flex-start",
    backgroundColor: IPAD_THEME.colors.accentMuted,
    paddingHorizontal: IPAD_THEME.spacing.md,
    paddingVertical: IPAD_THEME.spacing.xs,
    borderRadius: IPAD_THEME.radius.full,
    marginBottom: IPAD_THEME.spacing.md,
  },
  badgeText: {
    color: IPAD_THEME.colors.accent,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: IPAD_THEME.colors.textPrimary,
    marginBottom: IPAD_THEME.spacing.xs,
  },
  subtitle: {
    fontSize: 15,
    color: IPAD_THEME.colors.textSecondary,
    marginBottom: IPAD_THEME.spacing.xl,
  },
  errorBanner: {
    backgroundColor: IPAD_THEME.colors.dangerMuted,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.danger,
    borderRadius: IPAD_THEME.radius.md,
    padding: IPAD_THEME.spacing.md,
    marginBottom: IPAD_THEME.spacing.lg,
  },
  errorText: {
    color: IPAD_THEME.colors.danger,
    fontSize: 14,
    fontWeight: "600",
  },
  inputGroup: {
    marginBottom: IPAD_THEME.spacing.lg,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: IPAD_THEME.colors.textSecondary,
    marginBottom: IPAD_THEME.spacing.xs,
  },
  hint: {
    fontSize: 12,
    color: IPAD_THEME.colors.textMuted,
    marginBottom: IPAD_THEME.spacing.sm,
  },
  input: {
    height: IPAD_THEME.touchTarget.largeHeight,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    paddingHorizontal: IPAD_THEME.spacing.lg,
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 16,
  },
  codeInput: {
    textAlign: "center",
    letterSpacing: 8,
    fontSize: 22,
    fontWeight: "700",
  },
  submitButton: {
    height: IPAD_THEME.touchTarget.largeHeight,
    backgroundColor: IPAD_THEME.colors.accent,
    borderRadius: IPAD_THEME.radius.md,
    justifyContent: "center",
    alignItems: "center",
    marginTop: IPAD_THEME.spacing.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: "#090d16",
    fontWeight: "700",
    fontSize: 16,
  },
  configToggle: {
    marginTop: IPAD_THEME.spacing.xl,
    alignItems: "center",
  },
  configToggleText: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 13,
    textDecorationLine: "underline",
  },
  configBox: {
    marginTop: IPAD_THEME.spacing.md,
    padding: IPAD_THEME.spacing.md,
    backgroundColor: IPAD_THEME.colors.surfaceElevated,
    borderRadius: IPAD_THEME.radius.md,
  },
  saveUrlButton: {
    marginTop: IPAD_THEME.spacing.sm,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    paddingVertical: IPAD_THEME.spacing.sm,
    borderRadius: IPAD_THEME.radius.sm,
    alignItems: "center",
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
  },
  saveUrlText: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
});
