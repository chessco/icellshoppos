export type TapToPayMode = "simulated" | "real";

/**
 * Safe-by-default build configuration.
 * Expo public variables are build-time configuration, not secrets.
 */
export function getTapToPayMode(): TapToPayMode {
  return process.env.EXPO_PUBLIC_TAP_TO_PAY_MODE === "real" ? "real" : "simulated";
}
