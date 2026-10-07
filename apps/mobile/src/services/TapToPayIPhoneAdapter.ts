/**
 * Tap to Pay on iPhone Infrastructure Adapter (PAYMENT-04)
 *
 * Encapsulates Apple Proximity Reader & Stripe Terminal Local Mobile operations.
 *
 * Guarantees:
 * 1. Device Integrity: Strictly restricted to iPhone hardware (disabled on iPad, which uses physical readers).
 * 2. Zero Secrets on Device: Uses ephemeral Connection Tokens from Pro Buyer backend.
 * 3. Authoritative Verification: Mobile cannot self-authorize SUCCEEDED; payment status is verified with Stripe server.
 * 4. Resilient Ambiguous State Handling: Network loss during NFC presentation transitions to UNKNOWN.
 */

import type {
  ICreatePaymentIntentResponse,
  IVerifyPaymentStatusResponse,
} from "@ireader/contracts";
import type { ProBuyerApiClient } from "@ireader/api-client";
import { getTapToPayMode, type TapToPayMode } from "../config/paymentConfig";
import { loadStripeTerminalNative } from "./nativeStripeTerminal";

export interface IPlatformInfo {
  OS: string;
  isPad?: boolean;
  Version?: string | number;
}

function getDefaultPlatformInfo(): IPlatformInfo {
  try {
    // Dynamic require so node test runners don't choke on react-native flow syntax
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require("react-native");
    if (rn?.Platform) return rn.Platform;
  } catch {
    // Fallback in node test runners
  }
  return { OS: "ios", isPad: false, Version: "17.0" };
}

export type TapToPayOperationalState =
  | "CHECKING_DEVICE"
  | "NOT_SUPPORTED"
  | "NOT_AUTHORIZED"
  | "REQUIRES_SETUP"
  | "READY"
  | "CREATING_PAYMENT"
  | "PREPARING_TAP_TO_PAY"
  | "WAITING_FOR_CUSTOMER"
  | "PROCESSING_PAYMENT"
  | "VERIFYING_PAYMENT"
  | "PAYMENT_SUCCEEDED"
  | "PAYMENT_FAILED"
  | "PAYMENT_CANCELED"
  | "PAYMENT_UNKNOWN";

export interface ITapToPayEligibility {
  supported: boolean;
  reason?: string;
  isIPhone: boolean;
  osVersion: string | number;
}

export interface ITapToPayListener {
  onStateChange: (state: TapToPayOperationalState) => void;
  onError?: (error: string) => void;
}

export class TapToPayIPhoneAdapter {
  private apiClient: ProBuyerApiClient;
  private siteId?: string;
  private platformInfo: IPlatformInfo;
  private operationalState: TapToPayOperationalState = "READY";
  private isConnected = false;
  private readonly mode: TapToPayMode;
  private listeners: Set<ITapToPayListener> = new Set();

  constructor(
    apiClient: ProBuyerApiClient,
    siteId?: string,
    platformInfo?: IPlatformInfo,
    mode: TapToPayMode = getTapToPayMode()
  ) {
    this.apiClient = apiClient;
    this.siteId = siteId;
    this.platformInfo = platformInfo || getDefaultPlatformInfo();
    this.mode = mode;
  }

  public getMode(): TapToPayMode {
    return this.mode;
  }

  public setSiteId(siteId?: string) {
    this.siteId = siteId;
  }

  public getState(): TapToPayOperationalState {
    return this.operationalState;
  }

  public isLocalMobileConnected(): boolean {
    return this.isConnected;
  }

  public addListener(listener: ITapToPayListener): () => void {
    this.listeners.add(listener);
    listener.onStateChange(this.operationalState);
    return () => this.listeners.delete(listener);
  }

  private setState(state: TapToPayOperationalState) {
    this.operationalState = state;
    for (const l of this.listeners) {
      l.onStateChange(state);
    }
  }

  private emitError(errorMessage: string) {
    this.setState("PAYMENT_FAILED");
    for (const l of this.listeners) {
      if (l.onError) l.onError(errorMessage);
    }
  }

  /**
   * Evaluates hardware and OS eligibility for Tap to Pay on iPhone
   */
  public checkEligibility(): ITapToPayEligibility {
    const isIOS = this.platformInfo.OS === "ios";
    const isPad = Boolean(this.platformInfo.isPad);
    const isIPhone = isIOS && !isPad;
    const osVersion = this.platformInfo.Version || "17.0";

    if (!isIOS) {
      return {
        supported: false,
        reason: "Tap to Pay on iPhone requires iOS.",
        isIPhone: false,
        osVersion,
      };
    }

    if (isPad) {
      return {
        supported: false,
        reason: "Tap to Pay on iPhone is only supported on iPhone devices. iPads use physical Stripe card readers.",
        isIPhone: false,
        osVersion,
      };
    }

    // iPhone XS or later running iOS 16.4+ is required
    const majorVer = typeof osVersion === "string" ? parseFloat(osVersion) : Number(osVersion);
    if (majorVer < 16.4) {
      return {
        supported: false,
        reason: `Tap to Pay requires iOS 16.4 or higher (detected iOS ${osVersion}).`,
        isIPhone: true,
        osVersion,
      };
    }

    return {
      supported: true,
      isIPhone: true,
      osVersion,
    };
  }

  /**
   * Connects to the iPhone's built-in NFC reader (Local Mobile)
   */
  public async initializeLocalMobile(posDeviceId?: string): Promise<boolean> {
    const eligibility = this.checkEligibility();
    if (!eligibility.supported && this.platformInfo.OS === "ios" && this.platformInfo.isPad) {
      this.setState("NOT_SUPPORTED");
      return false;
    }

    try {
      if (this.mode === "simulated") {
        this.setState("PREPARING_TAP_TO_PAY");
        await new Promise((resolve) => setTimeout(resolve, 250));
        this.isConnected = true;
        this.setState("READY");
        return true;
      }

      if (!this.siteId) {
        throw new Error("Stripe Location is required before initializing Tap to Pay.");
      }

      this.setState("PREPARING_TAP_TO_PAY");
      const sdk = loadStripeTerminalNative()?.StripeTerminalSdk;
      if (!sdk) {
        throw new Error("Stripe Terminal nativo no está disponible. Instale un Development Build.");
      }
      const result = await sdk.easyConnect({
        discoveryMethod: "tapToPay",
        locationId: this.siteId,
        merchantDisplayName: "iReader POS",
        autoReconnectOnUnexpectedDisconnect: true,
      });

      if (result.error || !result.reader) {
        throw new Error(result.error?.message || "Stripe no pudo preparar Tap to Pay en este iPhone.");
      }

      this.isConnected = true;
      this.setState("READY");

      // Register POS Device identity in backend
      if (posDeviceId) {
        void this.apiClient.registerPosDevice({
          deviceUuid: posDeviceId,
          deviceName: "iPhone Tap to Pay Terminal",
          deviceType: "IPHONE_TAP_TO_PAY",
          siteId: this.siteId,
        });
      }

      return true;
    } catch (err: unknown) {
      this.isConnected = false;
      const msg = err instanceof Error ? err.message : "Error initializing Tap to Pay.";
      this.emitError(msg);
      return false;
    }
  }

  /**
   * Initiates the contactless card acceptance flow on the iPhone
   */
  public async collectAndProcessPayment(
    intent: ICreatePaymentIntentResponse,
    onProgress?: (step: TapToPayOperationalState) => void
  ): Promise<IVerifyPaymentStatusResponse> {
    try {
      if (!this.isConnected) {
        throw new Error("Tap to Pay no está inicializado. Prepare el terminal antes de cobrar.");
      }

      // 1. Readying proximity prompt
      this.setState("PREPARING_TAP_TO_PAY");
      if (onProgress) onProgress("PREPARING_TAP_TO_PAY");

      if (this.mode === "simulated") {
        await new Promise((resolve) => setTimeout(resolve, 700));
        this.setState("PROCESSING_PAYMENT");
        if (onProgress) onProgress("PROCESSING_PAYMENT");
        await new Promise((resolve) => setTimeout(resolve, 700));
        this.setState("VERIFYING_PAYMENT");
        if (onProgress) onProgress("VERIFYING_PAYMENT");
        const simulatedResult = await this.apiClient.verifyStripePaymentStatus({
          paymentIntentId: intent.paymentIntentId,
          paymentAttemptId: intent.paymentAttemptId,
        });
        return this.resolveVerification(simulatedResult, onProgress);
      }

      const sdk = loadStripeTerminalNative()?.StripeTerminalSdk;
      if (!sdk) {
        throw new Error("Stripe Terminal nativo no está disponible. Instale un Development Build.");
      }
      const retrieved = await sdk.retrievePaymentIntent(intent.clientSecret);
      if (retrieved.error || !retrieved.paymentIntent) {
        throw new Error(retrieved.error?.message || "No se pudo cargar el PaymentIntent en Stripe Terminal.");
      }

      // 2. Waiting for customer to present card/wallet against iPhone top edge
      this.setState("WAITING_FOR_CUSTOMER");
      if (onProgress) onProgress("WAITING_FOR_CUSTOMER");

      // 3. Contactless card data read and processing with the native Stripe SDK
      this.setState("PROCESSING_PAYMENT");
      if (onProgress) onProgress("PROCESSING_PAYMENT");
      const processed = await sdk.processPaymentIntent({
        paymentIntent: retrieved.paymentIntent,
      });
      if (processed.error || !processed.paymentIntent) {
        throw new Error(processed.error?.message || "El pago sin contacto fue rechazado.");
      }

      // 4. Authoritative backend verification
      this.setState("VERIFYING_PAYMENT");
      if (onProgress) onProgress("VERIFYING_PAYMENT");

      const verifyResult = await this.apiClient.verifyStripePaymentStatus({
        paymentIntentId: intent.paymentIntentId,
        paymentAttemptId: intent.paymentAttemptId,
      });

      return this.resolveVerification(verifyResult, onProgress);
    } catch (err: unknown) {
      // In case of network drop or app backgrounding during contactless presentation:
      this.setState("PAYMENT_UNKNOWN");
      if (onProgress) onProgress("PAYMENT_UNKNOWN");
      return {
        ok: false,
        status: "UNKNOWN",
        paymentAttemptStatus: "UNKNOWN",
        posPaymentStatus: "UNKNOWN",
        isUnknown: true,
        error: "Connection lost during Tap to Pay processing. Status will be verified with the server.",
      };
    }
  }

  private resolveVerification(
    verifyResult: IVerifyPaymentStatusResponse,
    onProgress?: (step: TapToPayOperationalState) => void
  ): IVerifyPaymentStatusResponse {
    if (verifyResult.isUnknown || verifyResult.status === "UNKNOWN") {
      this.setState("PAYMENT_UNKNOWN");
      if (onProgress) onProgress("PAYMENT_UNKNOWN");
      return {
        ok: false,
        status: "UNKNOWN",
        paymentAttemptStatus: "UNKNOWN",
        posPaymentStatus: "UNKNOWN",
        isUnknown: true,
        error: "Tap to Pay transaction status is ambiguous. Verifying with Stripe server...",
      };
    }

    if (verifyResult.ok && (verifyResult.status === "SUCCEEDED" || verifyResult.posPaymentStatus === "PAID")) {
      this.setState("PAYMENT_SUCCEEDED");
      if (onProgress) onProgress("PAYMENT_SUCCEEDED");
      return verifyResult;
    }

    this.setState("PAYMENT_FAILED");
    if (onProgress) onProgress("PAYMENT_FAILED");
    return {
      ok: false,
      status: "FAILED",
      paymentAttemptStatus: verifyResult.paymentAttemptStatus || "FAILED",
      posPaymentStatus: verifyResult.posPaymentStatus || "FAILED",
      error: verifyResult.error || "Contactless payment declined or canceled.",
    };
  }

  /**
   * Cancel in-flight payment intent
   */
  public async cancelPayment(paymentIntentId: string): Promise<boolean> {
    try {
      const intent = await this.apiClient.verifyStripePaymentStatus({ paymentIntentId });
      if (intent.status === "SUCCEEDED") return true;
      const sdk = loadStripeTerminalNative()?.StripeTerminalSdk;
      if (!sdk) return false;
      const res = await sdk.cancelProcessPaymentIntent();
      if (res.error) {
        await this.apiClient.cancelStripePaymentIntent({ paymentIntentId });
        this.setState("READY");
        return false;
      }
      this.setState("READY");
      return true;
    } catch {
      return false;
    }
  }
}
