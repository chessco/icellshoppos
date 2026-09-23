import React, { useState, useEffect } from "react";
import {
  View,
  StatusBar,
  useWindowDimensions,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IPAD_THEME } from "../theme/tokens";
import { IPadSidebar, type NavigationDestination } from "../components/navigation/iPadSidebar";
import { IPadHeader } from "../components/navigation/iPadHeader";
import { PosMasterScreen } from "./PosMasterScreen";
import { InventoryScreen } from "./InventoryScreen";
import { SalesHistoryScreen } from "./SalesHistoryScreen";
import { SettingsScreen } from "./SettingsScreen";
import { CommissionsScreen } from "./CommissionsScreen";
import { QuickMessagesModal } from "../components/messaging/QuickMessagesModal";
import { MobileScannerCapability } from "../capabilities/ScannerCapability";
import type { ConnectivityState } from "../components/ui/ConnectivityBadge";
import { useAuth } from "../contexts/AuthContext";

export function MainAppShell() {
  const { width } = useWindowDimensions();
  const { session, apiClient } = useAuth();

  const activeMembership =
    session?.memberships?.find((m) => m.organizationId === session?.activeOrganizationId) ||
    session?.memberships?.[0];
  const role = session?.isSuperadmin ? "superadmin" : (activeMembership?.role || "staff");
  const canManageCommissions = role === "admin" || role === "superadmin";

  // In portrait orientation (< 1024px), sidebar is completely hidden to provide 100% full screen width
  // and opens as a floating overlay drawer when tapping the hamburger button.
  const isPortrait = width < IPAD_THEME.breakpoints.regular;

  const [currentTab, setCurrentTab] = useState<NavigationDestination>("pos");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    width < IPAD_THEME.breakpoints.wide
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isMessagesOpen, setIsMessagesOpen] = useState(false);
  const [connectivityState, setConnectivityState] = useState<ConnectivityState>("ONLINE");
  const [scannerStatus, setScannerStatus] = useState("CHECKING");

  // Open messaging modal when selected from sidebar
  useEffect(() => {
    if (currentTab === "messages") {
      setIsMessagesOpen(true);
      setCurrentTab("pos");
    }
  }, [currentTab]);

  // Fallback to POS if user does not have permission to view commissions
  useEffect(() => {
    if (currentTab === "commissions" && !canManageCommissions) {
      setCurrentTab("pos");
    }
  }, [currentTab, canManageCommissions]);

  const scanner = React.useMemo(() => new MobileScannerCapability(), []);

  // Monitor scanner permission & capability status
  useEffect(() => {
    void scanner.getStatus().then(setScannerStatus);
  }, [scanner]);

  // Adjust sidebar state on screen rotation / resizing
  useEffect(() => {
    if (!isPortrait) {
      setIsDrawerOpen(false);
    }
  }, [isPortrait]);

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
      case "commissions":
        return "Gestión de Comisiones";
      case "messages":
        return "Mensajería Luxury & WA";
      case "settings":
        return "System Settings";
    }
  };

  const handleToggleSidebar = () => {
    if (isPortrait) {
      setIsDrawerOpen((prev) => !prev);
    } else {
      setIsSidebarCollapsed((prev) => !prev);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <View style={styles.container}>
        {/* Landscape Mode: Apple-style Persistent Sidebar */}
        {!isPortrait && (
          <IPadSidebar
            currentTab={currentTab}
            onSelectTab={setCurrentTab}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          />
        )}

        {/* Portrait Mode: Floating Overlay Drawer (Hides completely for 100% screen space) */}
        {isPortrait && (
          <Modal
            visible={isDrawerOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setIsDrawerOpen(false)}
          >
            <View style={styles.drawerBackdrop}>
              <TouchableOpacity
                style={StyleSheet.absoluteFill}
                activeOpacity={1}
                onPress={() => setIsDrawerOpen(false)}
              />
              <SafeAreaView style={styles.drawerSheet} edges={["top", "bottom", "left"]}>
                <IPadSidebar
                  currentTab={currentTab}
                  onSelectTab={(tab) => {
                    setCurrentTab(tab);
                    setIsDrawerOpen(false);
                  }}
                  isCollapsed={false}
                  onClose={() => setIsDrawerOpen(false)}
                />
              </SafeAreaView>
            </View>
          </Modal>
        )}

        {/* Main Content Area (Now 100% of iPad width in portrait!) */}
        <View style={styles.mainArea}>
          <IPadHeader
            title={getScreenTitle()}
            connectivityState={connectivityState}
            onRetryConnection={checkConnectivity}
            scannerStatus={scannerStatus}
            onToggleSidebar={handleToggleSidebar}
            onOpenMessages={() => setIsMessagesOpen(true)}
            unreadMessagesCount={1}
          />

          <View style={styles.screenHost}>
            {currentTab === "pos" && (
              <PosMasterScreen
                connectivityState={connectivityState}
                onRefreshConnectivity={checkConnectivity}
                scannerStatus={scannerStatus}
                onOpenMessages={() => setIsMessagesOpen(true)}
              />
            )}
            {currentTab === "inventory" && <InventoryScreen />}
            {currentTab === "sales" && <SalesHistoryScreen />}
            {currentTab === "commissions" && <CommissionsScreen />}
            {currentTab === "settings" && <SettingsScreen />}
          </View>
        </View>
      </View>

      {/* iPad Floating Luxury Messages Modal */}
      <QuickMessagesModal
        visible={isMessagesOpen}
        onClose={() => setIsMessagesOpen(false)}
      />
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
  drawerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    flexDirection: "row",
  },
  drawerSheet: {
    height: "100%",
    width: IPAD_THEME.sidebar.expandedWidth,
    backgroundColor: IPAD_THEME.colors.sidebarBackground,
    shadowColor: "#000",
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 24,
  },
});
