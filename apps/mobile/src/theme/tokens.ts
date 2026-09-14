/**
 * iReader Multiplatform Architecture v2.0 - Core Apple Tokens
 *
 * Design tokens for typography, surfaces, borders, states, and iPad touch dimensions
 * complying with Apple Human Interface Guidelines (HIG).
 */

export const IPAD_THEME = {
  colors: {
    background: "#080c14",
    surfacePrimary: "#0f172a",
    surfaceSecondary: "#1e293b",
    surfaceElevated: "#273549",
    borderSubtle: "#334155",
    borderFocus: "#38bdf8",

    textPrimary: "#f8fafc",
    textSecondary: "#94a3b8",
    textMuted: "#64748b",

    accent: "#38bdf8",
    accentMuted: "rgba(56, 189, 248, 0.15)",
    success: "#22c55e",
    successMuted: "rgba(34, 197, 94, 0.15)",
    warning: "#f59e0b",
    warningMuted: "rgba(245, 158, 11, 0.15)",
    danger: "#ef4444",
    dangerMuted: "rgba(239, 68, 68, 0.15)",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
    full: 9999,
  },
  touchTarget: {
    minHeight: 44, // Apple HIG minimum touch target
    largeHeight: 52,
  },
};
