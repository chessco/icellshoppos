import React, { useState, useEffect } from "react";
import { View, StatusBar, useWindowDimensions, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IPAD_THEME } from "../theme/tokens";
import { IPadSidebar, type NavigationDestination } from "../components/navigation/iPadSidebar";
import { IPadHeader } from "../components/navigation/iPadHeader";
import { PosMasterScreen } from "./PosMasterScreen";
import { InventoryScreen } from "./InventoryScreen";
import { SalesHistoryScreen } from "./SalesHistoryScreen";
import { SettingsScreen } from "./SettingsScreen";
import { MobileScannerCapability } from "../capabilities/ScannerCapability";
import type { ConnectivityState } from "../components/ui/ConnectivityBadge";
import { useAuth } from "../contexts/AuthContext";

export function MainAppShell() {
  const { width } = useWindowDimensions();
  const { apiClient } = useAuth();

  const [currentTab, setCurrentTab] = useState<NavigationDestination>("pos");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    width < IPAD_THEME.breakpoints.wide
  );
  const [connectivityState, setConnectivityState] = useState<ConnectivityState>("ONLINE");
  const [scannerStatus, setScannerStatus] = useState("CHECKING");

  const scanner = React.useMemo(() => new MobileScannerCapability(), []);

  // Monitor scanner permission & capability status
  useEffect(() => {
    void scanner.getStatus().then(setScannerStatus);
  }, [scanner]);

  // Adjust sidebar automatically on screen rotation/resizing
  useEffect(() => {
    if (width < IPAD_THEME.breakpoints.regular) {
      setIsSidebarCollapsed(true);
    }
  }, [width]);

  const checkConnectivity = async () => {
    setConnectivityState("LOADING");
    try {
      const res = await apiClient.me();
      if (res.ok) {
        setConnectivityState("ONLINE");
      } else {
        setConnectivityState("SYNC_ERROR");
      }
    } catch {
      setConnectivityState("OFFLINE");
    }
  };

  const getScreenTitle = () => {
    switch (currentTab) {
      case "pos":
        return "Point of Sale";
      case "inventory":
        return "Inventory Catalog";
      case "sales":
        return "Sales History";
      case "settings":
        return "System Settings";
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <View style={styles.container}>
        {/* Apple-style Persistent Sidebar */}
        <IPadSidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />

        {/* Main Content Area */}
        <View style={styles.mainArea}>
          <IPadHeader
            title={getScreenTitle()}
            connectivityState={connectivityState}
            onRetryConnection={checkConnectivity}
            scannerStatus={scannerStatus}
            onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
          />

          <View style={styles.screenHost}>
            {currentTab === "pos" && (
              <PosMasterScreen
                connectivityState={connectivityState}
                onRefreshConnectivity={checkConnectivity}
                scannerStatus={scannerStatus}
              />
            )}
            {currentTab === "inventory" && <InventoryScreen />}
            {currentTab === "sales" && <SalesHistoryScreen />}
            {currentTab === "settings" && <SettingsScreen />}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.sidebarBackground,
  },
  container: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: IPAD_THEME.colors.background,
  },
  mainArea: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: IPAD_THEME.colors.background,
  },
  screenHost: {
    flex: 1,
  },
});
