import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { IPAD_THEME } from "../../theme/tokens";
import { useAuth } from "../../contexts/AuthContext";

export type NavigationDestination = "pos" | "inventory" | "sales" | "settings";

interface NavigationItem {
  id: NavigationDestination;
  title: string;
  icon: string;
  badge?: number;
}

const NAV_ITEMS: NavigationItem[] = [
  { id: "pos", title: "Point of Sale", icon: "💳" },
  { id: "inventory", title: "Inventory", icon: "📦" },
  { id: "sales", title: "Sales History", icon: "🧾" },
  { id: "settings", title: "Settings", icon: "⚙️" },
];

interface IPadSidebarProps {
  currentTab: NavigationDestination;
  onSelectTab: (tab: NavigationDestination) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function IPadSidebar({
  currentTab,
  onSelectTab,
  isCollapsed = false,
  onToggleCollapse,
}: IPadSidebarProps) {
  const { session, logout } = useAuth();

  return (
    <View style={[styles.container, isCollapsed && styles.containerCollapsed]}>
      {/* Brand Header */}
      <View style={[styles.header, isCollapsed && styles.headerCollapsed]}>
        <View style={styles.brandIconContainer}>
          <Text style={styles.brandLogoText}>⚡</Text>
        </View>
        {!isCollapsed && (
          <View style={styles.brandTextContainer}>
            <Text style={styles.appName}>iReader</Text>
            <Text style={styles.appSub}>Pro Buyer POS</Text>
          </View>
        )}
      </View>

      {/* Navigation List */}
      <View style={styles.navSection}>
        {NAV_ITEMS.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.navItem,
                isActive && styles.navItemActive,
                isCollapsed && styles.navItemCollapsed,
              ]}
              onPress={() => onSelectTab(item.id)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={item.title}
            >
              <Text style={[styles.navIcon, isActive && styles.navIconActive]}>
                {item.icon}
              </Text>
              {!isCollapsed && (
                <Text style={[styles.navTitle, isActive && styles.navTitleActive]}>
                  {item.title}
                </Text>
              )}
              {!isCollapsed && isActive && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* User / Org Footer */}
      <View style={[styles.footer, isCollapsed && styles.footerCollapsed]}>
        {!isCollapsed && (
          <View style={styles.userInfo}>
            <Text style={styles.userEmail} numberOfLines={1}>
              {session?.email || "Cashier POS"}
            </Text>
            <Text style={styles.userRole}>
              {session?.memberships?.[0]?.role || (session?.isSuperadmin ? "Superadmin" : "Store Operator")}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.logoutButton, isCollapsed && styles.logoutButtonCollapsed]}
          onPress={() => void logout()}
          accessibilityRole="button"
          accessibilityLabel="Sign out of iReader"
        >
          <Text style={styles.logoutIcon}>🚪</Text>
          {!isCollapsed && <Text style={styles.logoutText}>Sign Out</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: IPAD_THEME.sidebar.expandedWidth,
    backgroundColor: IPAD_THEME.colors.sidebarBackground,
    borderRightWidth: 1,
    borderRightColor: IPAD_THEME.colors.borderSubtle,
    justifyContent: "space-between",
  },
  containerCollapsed: {
    width: IPAD_THEME.sidebar.collapsedWidth,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: IPAD_THEME.spacing.lg,
    paddingTop: IPAD_THEME.spacing.xl,
    paddingBottom: IPAD_THEME.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  headerCollapsed: {
    paddingHorizontal: IPAD_THEME.spacing.md,
    justifyContent: "center",
  },
  brandIconContainer: {
    width: 36,
    height: 36,
    borderRadius: IPAD_THEME.radius.md,
    backgroundColor: IPAD_THEME.colors.accentMuted,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  brandLogoText: {
    fontSize: 18,
    color: IPAD_THEME.colors.accent,
  },
  brandTextContainer: {
    marginLeft: IPAD_THEME.spacing.md,
  },
  appName: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  appSub: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  navSection: {
    flex: 1,
    paddingVertical: IPAD_THEME.spacing.lg,
    paddingHorizontal: IPAD_THEME.spacing.sm,
    gap: IPAD_THEME.spacing.xs,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    height: IPAD_THEME.touchTarget.minHeight,
    paddingHorizontal: IPAD_THEME.spacing.md,
    borderRadius: IPAD_THEME.radius.md,
    position: "relative",
  },
  navItemCollapsed: {
    justifyContent: "center",
    paddingHorizontal: 0,
  },
  navItemActive: {
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
  },
  navIcon: {
    fontSize: 18,
    marginRight: IPAD_THEME.spacing.md,
  },
  navIconActive: {
    transform: [{ scale: 1.1 }],
  },
  navTitle: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  navTitleActive: {
    color: IPAD_THEME.colors.textPrimary,
    fontWeight: "700",
  },
  activeIndicator: {
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: IPAD_THEME.colors.accent,
    position: "absolute",
    right: 8,
  },
  footer: {
    padding: IPAD_THEME.spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
    gap: IPAD_THEME.spacing.sm,
  },
  footerCollapsed: {
    padding: IPAD_THEME.spacing.sm,
    alignItems: "center",
  },
  userInfo: {
    paddingHorizontal: IPAD_THEME.spacing.xs,
  },
  userEmail: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  userRole: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    paddingHorizontal: IPAD_THEME.spacing.sm,
    borderRadius: IPAD_THEME.radius.sm,
    backgroundColor: IPAD_THEME.colors.dangerMuted,
  },
  logoutButtonCollapsed: {
    width: 38,
    justifyContent: "center",
    paddingHorizontal: 0,
  },
  logoutIcon: {
    fontSize: 14,
  },
  logoutText: {
    color: IPAD_THEME.colors.danger,
    fontSize: 12,
    fontWeight: "700",
    marginLeft: IPAD_THEME.spacing.sm,
  },
});
