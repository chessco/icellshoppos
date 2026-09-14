import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { AuthProvider, useAuth } from "./src/contexts/AuthContext.js";
import { CartProvider } from "./src/contexts/CartContext.js";
import { LoginScreen } from "./src/screens/LoginScreen.js";
import { PosMasterScreen } from "./src/screens/PosMasterScreen.js";
import { IPAD_THEME } from "./src/theme/tokens.js";

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
      <PosMasterScreen />
    </CartProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
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
