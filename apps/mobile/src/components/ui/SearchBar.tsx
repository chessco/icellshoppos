import React from "react";
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from "react-native";
import { IPAD_THEME } from "../../theme/tokens";

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onClear?: () => void;
  onScanPress?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function SearchBar({
  value,
  onChangeText,
  onClear,
  onScanPress,
  placeholder = "Scan barcode, IMEI, serial, or search model...",
  autoFocus = false,
}: SearchBarProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.searchIcon}>🔍</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={IPAD_THEME.colors.textMuted}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
        accessibilityLabel="Search and scan input"
      />
      {value.length > 0 && (
        <TouchableOpacity
          style={styles.clearBtn}
          onPress={() => {
            onChangeText("");
            onClear?.();
          }}
          accessibilityRole="button"
          accessibilityLabel="Clear search input"
        >
          <Text style={styles.clearText}>✕</Text>
        </TouchableOpacity>
      )}
      {onScanPress && (
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={onScanPress}
          accessibilityRole="button"
          accessibilityLabel="Open camera scanner"
        >
          <Text style={styles.scanBtnText}>📷 Scan</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    borderRadius: IPAD_THEME.radius.lg,
    paddingHorizontal: IPAD_THEME.spacing.md,
    height: IPAD_THEME.touchTarget.largeHeight,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: IPAD_THEME.spacing.sm,
    color: IPAD_THEME.colors.textMuted,
  },
  input: {
    flex: 1,
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 15,
    height: "100%",
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: IPAD_THEME.spacing.sm,
  },
  clearText: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  scanBtn: {
    backgroundColor: IPAD_THEME.colors.accentMuted,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.accent,
    paddingHorizontal: IPAD_THEME.spacing.md,
    paddingVertical: IPAD_THEME.spacing.xs,
    borderRadius: IPAD_THEME.radius.sm,
  },
  scanBtnText: {
    color: IPAD_THEME.colors.accent,
    fontSize: 13,
    fontWeight: "700",
  },
});
