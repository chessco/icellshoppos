import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import { CartProvider } from "./src/contexts/CartContext";
import { LoginScreen } from "./src/screens/LoginScreen";
import { MainAppShell } from "./src/screens/MainAppShell";
import { IPAD_THEME } from "./src/theme/tokens";

function AppContent() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
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
    <CartProvider>
      <MainAppShell />
    </CartProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppContent />
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
