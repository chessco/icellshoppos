/**
 * Loads Stripe Terminal only when a native Development Build is explicitly
 * requested. This keeps Expo Go usable in simulated mode.
 */
export interface NativeStripeTerminalModule {
  StripeTerminalProvider?: React.ComponentType<{
    children: React.ReactNode;
    tokenProvider: () => Promise<string>;
    logLevel?: "none" | "verbose" | "error" | "warning";
  }>;
  StripeTerminalSdk?: {
    easyConnect: (params: Record<string, unknown>) => Promise<{ reader?: unknown; error?: { message?: string } }>;
    retrievePaymentIntent: (clientSecret: string) => Promise<{ paymentIntent?: unknown; error?: { message?: string } }>;
    processPaymentIntent: (params: Record<string, unknown>) => Promise<{ paymentIntent?: unknown; error?: { message?: string } }>;
    cancelProcessPaymentIntent: () => Promise<{ error?: { message?: string } }>;
  };
}

import type React from "react";

export function loadStripeTerminalNative(): NativeStripeTerminalModule | null {
  try {
    // Keep the native package out of Expo Go's static Metro graph. It is
    // loaded only by a native build when real mode is explicitly enabled.
    // eslint-disable-next-line no-eval
    const dynamicRequire = eval("require") as (moduleName: string) => NativeStripeTerminalModule;
    return dynamicRequire("@stripe/stripe-terminal-react-native");
  } catch {
    return null;
  }
}
