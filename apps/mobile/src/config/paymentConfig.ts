export type TapToPayMode = "simulated" | "real";
export type StripeTerminalMode = "simulated" | "real";

/**
 * Safe-by-default build configuration.
 * Expo public variables are build-time configuration, not secrets.
 */
export function getTapToPayMode(): TapToPayMode {
  return process.env.EXPO_PUBLIC_TAP_TO_PAY_MODE === "real" ? "real" : "simulated";
}

export function getStripeTerminalMode(): StripeTerminalMode {
  return process.env.EXPO_PUBLIC_STRIPE_TERMINAL_MODE === "real" ? "real" : "simulated";
}
