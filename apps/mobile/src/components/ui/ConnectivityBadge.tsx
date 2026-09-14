import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { IPAD_THEME } from "../../theme/tokens";

export type ConnectivityState = "ONLINE" | "LOADING" | "OFFLINE" | "SYNC_ERROR";

interface ConnectivityBadgeProps {
  state: ConnectivityState;
  onRetry?: () => void;
}

export function ConnectivityBadge({ state, onRetry }: ConnectivityBadgeProps) {
  const isOnline = state === "ONLINE";
  const isOffline = state === "OFFLINE";
  const isSyncError = state === "SYNC_ERROR";
  const isLoading = state === "LOADING";

  const getLabel = () => {
    switch (state) {
      case "ONLINE":
        return "ONLINE";
      case "LOADING":
        return "SYNCING...";
      case "OFFLINE":
        return "OFFLINE";
      case "SYNC_ERROR":
        return "SYNC ERROR";
    }
  };

  const getDotColor = () => {
    switch (state) {
      case "ONLINE":
        return IPAD_THEME.colors.success;
      case "LOADING":
        return IPAD_THEME.colors.accent;
      case "OFFLINE":
        return IPAD_THEME.colors.danger;
      case "SYNC_ERROR":
        return IPAD_THEME.colors.warning;
    }
  };

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.container,
          isOnline && styles.onlineBg,
          isOffline && styles.offlineBg,
          isSyncError && styles.syncErrorBg,
          isLoading && styles.loadingBg,
        ]}
      >
        <View style={[styles.dot, { backgroundColor: getDotColor() }]} />
        <Text
          style={[
            styles.label,
            isOnline && styles.onlineText,
            isOffline && styles.offlineText,
            isSyncError && styles.syncErrorText,
            isLoading && styles.loadingText,
          ]}
        >
          {getLabel()}
        </Text>
      </View>
      {(isOffline || isSyncError) && onRetry && (
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry connection"
        >
          <Text style={styles.retryText}>↻ Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: IPAD_THEME.spacing.xs,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: IPAD_THEME.spacing.md,
    paddingVertical: 4,
    borderRadius: IPAD_THEME.radius.sm,
    borderWidth: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  onlineBg: {
    backgroundColor: IPAD_THEME.colors.successMuted,
    borderColor: "rgba(34, 197, 94, 0.4)",
  },
  onlineText: {
    color: IPAD_THEME.colors.success,
  },
  offlineBg: {
    backgroundColor: IPAD_THEME.colors.dangerMuted,
    borderColor: "rgba(239, 68, 68, 0.4)",
  },
  offlineText: {
    color: IPAD_THEME.colors.danger,
  },
  syncErrorBg: {
    backgroundColor: IPAD_THEME.colors.warningMuted,
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  syncErrorText: {
    color: IPAD_THEME.colors.warning,
  },
  loadingBg: {
    backgroundColor: IPAD_THEME.colors.accentMuted,
    borderColor: "rgba(56, 189, 248, 0.4)",
  },
  loadingText: {
    color: IPAD_THEME.colors.accent,
  },
  retryBtn: {
    paddingHorizontal: IPAD_THEME.spacing.sm,
    paddingVertical: 4,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.sm,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
  },
  retryText: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 11,
    fontWeight: "700",
  },
});
