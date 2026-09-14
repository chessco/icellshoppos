import React from "react";
import { View, Text, StyleSheet, type ViewStyle, type TextStyle } from "react-native";
import { IPAD_THEME } from "../../theme/tokens";

export type BadgeVariant = "default" | "success" | "warning" | "danger" | "accent";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Badge({ label, variant = "default", style, textStyle }: BadgeProps) {
  const variantStyles = styles[variant] || styles.default;

  return (
    <View style={[styles.badge, variantStyles.container, style]}>
      <Text style={[styles.text, variantStyles.text, textStyle]}>{label}</Text>
    </View>
  );
}

const styles = {
  badge: {
    paddingHorizontal: IPAD_THEME.spacing.sm,
    paddingVertical: 3,
    borderRadius: IPAD_THEME.radius.sm,
    borderWidth: 1,
    alignSelf: "flex-start" as const,
  },
  text: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 0.3,
  },
  default: StyleSheet.create({
    container: {
      backgroundColor: IPAD_THEME.colors.surfaceSecondary,
      borderColor: IPAD_THEME.colors.borderSubtle,
    },
    text: {
      color: IPAD_THEME.colors.textSecondary,
    },
  }),
  success: StyleSheet.create({
    container: {
      backgroundColor: IPAD_THEME.colors.successMuted,
      borderColor: IPAD_THEME.colors.success,
    },
    text: {
      color: IPAD_THEME.colors.success,
    },
  }),
  warning: StyleSheet.create({
    container: {
      backgroundColor: IPAD_THEME.colors.warningMuted,
      borderColor: IPAD_THEME.colors.warning,
    },
    text: {
      color: IPAD_THEME.colors.warning,
    },
  }),
  danger: StyleSheet.create({
    container: {
      backgroundColor: IPAD_THEME.colors.dangerMuted,
      borderColor: IPAD_THEME.colors.danger,
    },
    text: {
      color: IPAD_THEME.colors.danger,
    },
  }),
  accent: StyleSheet.create({
    container: {
      backgroundColor: IPAD_THEME.colors.accentMuted,
      borderColor: IPAD_THEME.colors.accent,
    },
    text: {
      color: IPAD_THEME.colors.accent,
    },
  }),
};
