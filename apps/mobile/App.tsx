import React, { useCallback } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import { CartProvider } from "./src/contexts/CartContext";
import { LoginScreen } from "./src/screens/LoginScreen";
import { MainAppShell } from "./src/screens/MainAppShell";
import { IPAD_THEME } from "./src/theme/tokens";

import { PosLayoutProvider } from "./src/contexts/PosLayoutContext";

import { CommissionProvider } from "./src/contexts/CommissionContext";

import { TerminalProvider } from "./src/contexts/TerminalContext";
import { getTapToPayMode } from "./src/config/paymentConfig";
import { loadStripeTerminalNative } from "./src/services/nativeStripeTerminal";

function AppContent() {
  const { session, isRestoringSession } = useAuth();

  if (isRestoringSession) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={IPAD_THEME.colors.accent} />
      </View>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <TerminalProvider>
      <CartProvider>
        <CommissionProvider>
          <PosLayoutProvider>
            <MainAppShell />
          </PosLayoutProvider>
        </CommissionProvider>
      </CartProvider>
    </TerminalProvider>
  );
}

function StripeTerminalRoot({ children }: { children: React.ReactElement }) {
  if (getTapToPayMode() !== "real") {
    return children;
  }

  const nativeStripe = loadStripeTerminalNative();
  const StripeTerminalProvider = nativeStripe?.StripeTerminalProvider;
  if (!StripeTerminalProvider) {
    return children;
  }

  const { apiClient } = useAuth();
  const tokenProvider = useCallback(async () => {
    const response = await apiClient.getStripeConnectionToken();
    if (!response.ok || !response.secret) {
      throw new Error(response.error || "No se pudo obtener el Connection Token de Stripe.");
    }
    return response.secret;
  }, [apiClient]);

  return (
    <StripeTerminalProvider tokenProvider={tokenProvider} logLevel="none">
      {children}
    </StripeTerminalProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StripeTerminalRoot>
          <AppContent />
        </StripeTerminalRoot>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
