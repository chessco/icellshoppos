import React from "react";
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { IPAD_THEME } from "../../theme/tokens";

export type ButtonVariant = "primary" | "secondary" | "success" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  icon,
  style,
  textStyle,
  accessibilityLabel,
}: ButtonProps) {
  const variantStyles = styles[variant] || styles.primary;
  const sizeStyle = sizeStyles[size] || sizeStyles.md;

  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[
        baseStyles.button,
        sizeStyle.button,
        variantStyles.container,
        isDisabled && baseStyles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" || variant === "success" ? "#080c14" : IPAD_THEME.colors.accent}
        />
      ) : (
        <>
          {icon}
          <Text
            style={[
              baseStyles.text,
              sizeStyle.text,
              variantStyles.text,
              icon ? baseStyles.textWithIcon : null,
              textStyle,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const baseStyles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: IPAD_THEME.radius.md,
  },
  text: {
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  textWithIcon: {
    marginLeft: IPAD_THEME.spacing.sm,
  },
  disabled: {
    opacity: 0.45,
  },
});

const sizeStyles = {
  sm: StyleSheet.create({
    button: {
      height: 36,
      paddingHorizontal: IPAD_THEME.spacing.md,
    },
    text: {
      fontSize: 13,
    },
  }),
  md: StyleSheet.create({
    button: {
      height: IPAD_THEME.touchTarget.minHeight,
      paddingHorizontal: IPAD_THEME.spacing.lg,
    },
    text: {
      fontSize: 15,
    },
  }),
  lg: StyleSheet.create({
    button: {
      height: IPAD_THEME.touchTarget.largeHeight,
      paddingHorizontal: IPAD_THEME.spacing.xl,
    },
    text: {
      fontSize: 16,
    },
  }),
};

const styles = {
  primary: StyleSheet.create({
    container: {
      backgroundColor: IPAD_THEME.colors.accent,
    },
    text: {
      color: "#080c14",
    },
  }),
  secondary: StyleSheet.create({
    container: {
      backgroundColor: IPAD_THEME.colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: IPAD_THEME.colors.borderSubtle,
    },
    text: {
      color: IPAD_THEME.colors.textPrimary,
    },
  }),
  success: StyleSheet.create({
    container: {
      backgroundColor: IPAD_THEME.colors.success,
    },
    text: {
      color: "#080c14",
    },
  }),
  danger: StyleSheet.create({
    container: {
      backgroundColor: IPAD_THEME.colors.danger,
    },
    text: {
      color: "#ffffff",
    },
  }),
  ghost: StyleSheet.create({
    container: {
      backgroundColor: "transparent",
    },
    text: {
      color: IPAD_THEME.colors.textSecondary,
    },
  }),
};
