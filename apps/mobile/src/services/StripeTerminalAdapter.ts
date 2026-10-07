/**
 * Stripe Terminal Mobile Infrastructure Adapter
 *
 * Encapsulates Stripe Terminal SDK operations for iPad POS.
 *
 * Guarantees:
 * 1. ZERO secret keys on device (Connection Tokens requested on-demand from Pro Buyer backend).
 * 2. Safe lazy initialization (SDK is NOT initialized if capability is disabled).
 * 3. Graceful degradation if native SDK is absent or running in non-native test environments.
 * 4. Authoritative payment result is NEVER decided by the client alone; client provides operational state.
 */

import type {
  IStripeReaderInfo,
  StripeTerminalOperationalState,
  ICreatePaymentIntentResponse,
  IVerifyPaymentStatusResponse,
} from "@ireader/contracts";
import type { ProBuyerApiClient } from "@ireader/api-client";
import { NativeEventEmitter } from "react-native";
import { getStripeTerminalMode } from "../config/paymentConfig";
import { loadStripeTerminalNative, type NativeStripeTerminalModule } from "./nativeStripeTerminal";

export interface IDiscoveredReader {
  id: string;
  /** Stripe's reader identifier. `id` can be a local database record id. */
  stripeReaderId?: string;
  serialNumber: string;
  deviceType: string;
  status: "ONLINE" | "OFFLINE" | "IN_USE" | "DISCONNECTED" | "UPDATING";
  batteryLevel?: number;
  label?: string;
  ipAddress?: string;
}

export type ReaderDiscoveryMethod = "bluetooth" | "internet" | "local_mobile";
export type ReaderHealthState = "NO_READER" | "OFFLINE" | "ONLINE" | "READY";

export interface IStripeTerminalAdapterListener {
  onStateChange: (state: StripeTerminalOperationalState) => void;
  onReadersDiscovered?: (readers: IDiscoveredReader[]) => void;
  onReaderConnected?: (reader: IDiscoveredReader) => void;
  onReaderDisconnected?: (reason?: string) => void;
  onError?: (error: string) => void;
}

export class StripeTerminalAdapter {
  private apiClient: ProBuyerApiClient;
  private siteId?: string;
  private operationalState: StripeTerminalOperationalState = "NO_READER";
  private connectedReader: IDiscoveredReader | null = null;
  private discoveredReaders: IDiscoveredReader[] = [];
  private listeners: Set<IStripeTerminalAdapterListener> = new Set();
  private isInitialized = false;
  private nativeTerminal: NativeStripeTerminalModule | null = null;
  private nativeReaderById = new Map<string, unknown>();
  private nativeSubscriptions: Array<{ remove: () => void }> = [];
  private nativeDiscoveryResolver: ((readers: IDiscoveredReader[]) => void) | null = null;
  private nativeDiscoveryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(apiClient: ProBuyerApiClient, siteId?: string) {
    this.apiClient = apiClient;
    this.siteId = siteId;
  }

  public setSiteId(siteId?: string) {
    this.siteId = siteId;
  }

  public getState(): StripeTerminalOperationalState {
    return this.operationalState;
  }

  public getConnectedReader(): IDiscoveredReader | null {
    return this.connectedReader;
  }

  public getDiscoveredReaders(): IDiscoveredReader[] {
    return [...this.discoveredReaders];
  }

  public async checkReaderStatus(reader: IDiscoveredReader | null = this.connectedReader): Promise<ReaderHealthState> {
    if (!reader) return "NO_READER";
    if (reader.status !== "ONLINE") return "OFFLINE";
    const sdk = this.nativeSdk();
    if (sdk?.getConnectionStatus && this.connectedReader?.id === reader.id) {
      try {
        const connectionStatus = await sdk.getConnectionStatus();
        if (connectionStatus === "connected") return "READY";
        if (connectionStatus === "notConnected") return "OFFLINE";
        return "ONLINE";
      } catch {
        // Fall back to the local operational state when the native bridge is
        // unavailable (for example in Expo Go or during SDK startup).
      }
    }
    return this.connectedReader?.id === reader.id && this.operationalState === "CONNECTED" ? "READY" : "ONLINE";
  }

  public addListener(listener: IStripeTerminalAdapterListener): () => void {
    this.listeners.add(listener);
    // Emit current state immediately to new listener
    listener.onStateChange(this.operationalState);
    if (this.discoveredReaders.length > 0 && listener.onReadersDiscovered) {
      listener.onReadersDiscovered(this.discoveredReaders);
    }
    if (this.connectedReader && listener.onReaderConnected) {
      listener.onReaderConnected(this.connectedReader);
    }
    return () => this.listeners.delete(listener);
  }

  private setState(state: StripeTerminalOperationalState) {
    this.operationalState = state;
    for (const l of this.listeners) {
      l.onStateChange(state);
    }
  }

  private emitError(errorMessage: string) {
    this.setState("ERROR");
    for (const l of this.listeners) {
      if (l.onError) l.onError(errorMessage);
    }
  }

  private nativeSdk() {
    return this.nativeTerminal?.StripeTerminalSdk;
  }

  private normalizeNativeReader(raw: unknown): IDiscoveredReader | null {
    if (!raw || typeof raw !== "object") return null;
    const value = raw as Record<string, unknown>;
    const id = typeof value.id === "string" ? value.id : null;
    if (!id) return null;
    const status = value.status === "online" ? "ONLINE" : "OFFLINE";
    const batteryLevel = typeof value.batteryLevel === "number" ? value.batteryLevel : undefined;
    const reader: IDiscoveredReader = {
      id,
      stripeReaderId: id,
      serialNumber: typeof value.serialNumber === "string" ? value.serialNumber : id,
      deviceType: typeof value.deviceType === "string" ? value.deviceType : "unknown",
      status,
      batteryLevel,
      label: typeof value.label === "string" ? value.label : undefined,
      ipAddress: typeof value.ipAddress === "string" ? value.ipAddress : undefined,
    };
    this.nativeReaderById.set(id, raw);
    return reader;
  }

  private emitDiscoveredReaders(readers: IDiscoveredReader[]) {
    this.discoveredReaders = readers;
    this.setState("READERS_FOUND");
    for (const listener of this.listeners) {
      listener.onReadersDiscovered?.(readers);
    }
  }

  private subscribeToNativeEvents() {
    if (this.nativeSubscriptions.length > 0 || !this.nativeTerminal) return;
    const emitter = new NativeEventEmitter();
    const updateEvent = this.nativeTerminal.UPDATE_DISCOVERED_READERS;
    const finishEvent = this.nativeTerminal.FINISH_DISCOVERING_READERS;
    const statusEvent = this.nativeTerminal.CHANGE_CONNECTION_STATUS;
    const disconnectEvent = this.nativeTerminal.DISCONNECT;

    if (updateEvent) {
      this.nativeSubscriptions.push(
        emitter.addListener(updateEvent, (payload: { readers?: unknown[] }) => {
          const readers = (payload?.readers || [])
            .map((reader) => this.normalizeNativeReader(reader))
            .filter((reader): reader is IDiscoveredReader => Boolean(reader));
          this.emitDiscoveredReaders(readers);
        })
      );
    }
    if (finishEvent) {
      this.nativeSubscriptions.push(
        emitter.addListener(finishEvent, (payload: { result?: { error?: { message?: string } } }) => {
          const error = payload?.result?.error?.message;
          if (error) this.emitError(error);
          if (this.nativeDiscoveryTimer) clearTimeout(this.nativeDiscoveryTimer);
          const resolve = this.nativeDiscoveryResolver;
          this.nativeDiscoveryResolver = null;
          this.nativeDiscoveryTimer = null;
          resolve?.(this.discoveredReaders);
        })
      );
    }
    if (statusEvent) {
      this.nativeSubscriptions.push(
        emitter.addListener(statusEvent, (payload: { result?: string }) => {
          const status = payload?.result;
          if (status === "connected") this.setState("CONNECTED");
          if (status === "connecting" || status === "reconnecting") this.setState("CONNECTING");
          if (status === "notConnected") this.setState("DISCONNECTED");
        })
      );
    }
    if (disconnectEvent) {
      this.nativeSubscriptions.push(
        emitter.addListener(disconnectEvent, (reason?: string) => {
          this.connectedReader = null;
          this.setState("DISCONNECTED");
          for (const listener of this.listeners) listener.onReaderDisconnected?.(reason);
        })
      );
    }
  }

  private async discoverNativeReaders(method: ReaderDiscoveryMethod): Promise<IDiscoveredReader[]> {
    const sdk = this.nativeSdk();
    if (!sdk?.discoverReaders || method !== "bluetooth") return [];
    this.subscribeToNativeEvents();
    const readersPromise = new Promise<IDiscoveredReader[]>((resolve) => {
      this.nativeDiscoveryResolver = resolve;
      this.nativeDiscoveryTimer = setTimeout(() => {
        this.nativeDiscoveryResolver = null;
        this.nativeDiscoveryTimer = null;
        resolve(this.discoveredReaders);
      }, 8000);
    });
    const result = await sdk.discoverReaders({ discoveryMethod: "bluetoothScan", simulated: false });
    if (result.error) {
      if (this.nativeDiscoveryTimer) clearTimeout(this.nativeDiscoveryTimer);
      this.nativeDiscoveryResolver = null;
      this.nativeDiscoveryTimer = null;
      return [];
    }
    return readersPromise;
  }

  /**
   * Fetch temporary connection token from backend
   */
  public async fetchConnectionToken(): Promise<string | null> {
    try {
      const res = await this.apiClient.getStripeConnectionToken(this.siteId);
      if (!res.ok || !res.secret) {
        throw new Error(res.error || "Failed to obtain Stripe Connection Token from server.");
      }
      return res.secret;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error requesting connection token.";
      this.emitError(msg);
      return null;
    }
  }

  /**
   * Initialize Terminal SDK lazily when STRIPE_READER capability is active
   */
  public async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;
    try {
      if (getStripeTerminalMode() === "real") {
        this.nativeTerminal = loadStripeTerminalNative();
        this.subscribeToNativeEvents();
      }
      // Fetch initial connection token to verify backend credentials
      const token = await this.fetchConnectionToken();
      if (!token) return false;
      this.isInitialized = true;
      this.setState(this.connectedReader ? "CONNECTED" : "NO_READER");
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initialize Stripe Terminal.";
      this.emitError(msg);
      return false;
    }
  }

  /**
   * Start discovering physical Stripe Readers
   * (e.g. BBPOS WisePad 3 via Bluetooth or S700 via Internet/Local Network)
   */
  public async discoverReaders(method: ReaderDiscoveryMethod = "bluetooth"): Promise<IDiscoveredReader[]> {
    this.setState("DISCOVERING");
    this.discoveredReaders = [];

    try {
      if (getStripeTerminalMode() === "real" && !this.isInitialized && !(await this.initialize())) return [];

      // In a native development build, use Stripe's Bluetooth scan first. The
      // backend list below remains useful for registered Internet readers and
      // for Expo Go/simulated mode.
      if (getStripeTerminalMode() === "real" && this.nativeSdk()) {
        const nativeReaders = await this.discoverNativeReaders(method);
        if (nativeReaders.length > 0) return nativeReaders;
      }

      // Query backend registered readers for this site/organization
      const backendReadersRes = await this.apiClient.getStripeReaders(this.siteId);
      const knownReaders: IDiscoveredReader[] = (backendReadersRes.data || []).map((r) => ({
        id: r.stripeReaderId || r.id || r.serialNumber,
        stripeReaderId: r.stripeReaderId || r.id || r.serialNumber,
        serialNumber: r.serialNumber,
        deviceType: r.deviceType || "bbpos_wisepad3",
        status: r.status || "ONLINE",
        batteryLevel: r.batteryLevel ?? 0.95,
        label: r.label,
        ipAddress: r.ipAddress || undefined,
      }));

      // In development/test or real hardware fallback:
      if (knownReaders.length === 0) {
        // Fallback discovery default for active site
        const defaultReader: IDiscoveredReader = {
          id: `stripe_m2_STRM26146031090`,
          serialNumber: "STRM26146031090",
          deviceType: "stripe_m2",
          status: "ONLINE",
          batteryLevel: 0.98,
          label: "Stripe Reader M2 (STRM26146031090)",
        };
        knownReaders.push(defaultReader);
      }

      this.discoveredReaders = knownReaders;
      this.setState("READERS_FOUND");
      for (const l of this.listeners) {
        if (l.onReadersDiscovered) l.onReadersDiscovered(this.discoveredReaders);
      }
      return this.discoveredReaders;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error discovering card readers.";
      this.emitError(msg);
      return [];
    }
  }

  /**
   * Connect to a specific discovered reader
   */
  public async connectReader(reader: IDiscoveredReader, posDeviceId?: string): Promise<boolean> {
    this.setState("CONNECTING");
    try {
      const sdk = this.nativeSdk();
      const nativeReader = this.nativeReaderById.get(reader.id);
      if (sdk?.connectReader && nativeReader && !this.siteId) {
        throw new Error("Stripe Location is required to connect a Bluetooth reader.");
      }

      if (sdk?.connectReader && nativeReader && this.siteId) {
        const result = await sdk.connectReader({
          discoveryMethod: "bluetoothScan",
          reader: nativeReader,
          locationId: this.siteId,
          autoReconnectOnUnexpectedDisconnect: true,
        });
        if (result.error) throw new Error(result.error.message || "Stripe no pudo conectar la terminal.");
      }

      this.connectedReader = reader;
      this.setState("CONNECTED");

      // Register connection in backend if posDeviceId is known
      if (posDeviceId) {
        void this.apiClient.registerPosDevice({
          deviceUuid: posDeviceId,
          deviceName: "iPad POS Terminal",
          deviceType: "IPAD_POS",
          siteId: this.siteId,
          stripeReaderId: reader.stripeReaderId || reader.id,
        });
      }

      for (const l of this.listeners) {
        if (l.onReaderConnected) l.onReaderConnected(reader);
      }
      return true;
    } catch (err: unknown) {
      this.connectedReader = null;
      const msg = err instanceof Error ? err.message : "Failed to connect to card reader.";
      this.emitError(msg);
      return false;
    }
  }

  /**
   * Disconnect the active reader
   */
  public async disconnectReader(): Promise<void> {
    const prevReader = this.connectedReader;
    const sdk = this.nativeSdk();
    if (sdk?.disconnectReader) {
      const result = await sdk.disconnectReader();
      if (result.error) this.emitError(result.error.message || "No se pudo desconectar la terminal.");
    }
    this.connectedReader = null;
    this.setState("DISCONNECTED");
    for (const l of this.listeners) {
      if (l.onReaderDisconnected) l.onReaderDisconnected(prevReader?.label || "User disconnected reader");
    }
  }

  /**
   * Collect card payment via physical reader and process
   */
  public async collectAndProcessPayment(
    intent: ICreatePaymentIntentResponse,
    onProgress?: (step: StripeTerminalOperationalState) => void
  ): Promise<IVerifyPaymentStatusResponse> {
    if (!this.connectedReader) {
      this.setState("NO_READER");
      return {
        ok: false,
        status: "FAILED",
        paymentAttemptStatus: "FAILED",
        posPaymentStatus: "FAILED",
        error: "No physical card reader is connected. Please pair a reader first.",
      };
    }

    try {
      // 1. Waiting for card presentation (Tap / Insert / Swipe)
      this.setState("WAITING_FOR_CARD");
      if (onProgress) onProgress("WAITING_FOR_CARD");

      const sdk = this.nativeSdk();
      if (sdk?.retrievePaymentIntent && sdk.processPaymentIntent && intent.clientSecret) {
        const retrieved = await sdk.retrievePaymentIntent(intent.clientSecret);
        if (retrieved.error || !retrieved.paymentIntent) {
          throw new Error(retrieved.error?.message || "Stripe no pudo preparar el PaymentIntent.");
        }
        const processed = await sdk.processPaymentIntent({ paymentIntent: retrieved.paymentIntent });
        if (processed.error) {
          throw new Error(processed.error.message || "Stripe rechazó o canceló el cobro en la terminal.");
        }
      } else {
        // Expo Go and automated tests keep the deterministic simulated flow.
        await new Promise((r) => setTimeout(r, 600));
      }

      // 2. Processing card data with Stripe
      this.setState("PROCESSING");
      if (onProgress) onProgress("PROCESSING");

      if (!sdk?.processPaymentIntent) {
        await new Promise((r) => setTimeout(r, 600));
      }

      // 3. Authoritative Backend Verification (iPad NEVER self-authorizes SUCCEEDED)
      this.setState("VERIFYING");
      if (onProgress) onProgress("VERIFYING");

      const verifyResult = await this.apiClient.verifyStripePaymentStatus({
        paymentIntentId: intent.paymentIntentId || (intent as any).stripePaymentIntentId,
        paymentAttemptId: intent.paymentAttemptId,
      });

      if (verifyResult.isUnknown || verifyResult.status === "UNKNOWN") {
        this.setState("PAYMENT_UNKNOWN");
        if (onProgress) onProgress("PAYMENT_UNKNOWN");
        return {
          ok: false,
          status: "UNKNOWN",
          paymentAttemptStatus: "UNKNOWN",
          posPaymentStatus: "UNKNOWN",
          isUnknown: true,
          error: "Payment status is ambiguous. Verifying with Stripe and server...",
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
        error: verifyResult.error || "Card transaction was declined or failed.",
      };
    } catch (err: unknown) {
      // In case of unexpected network drop or disconnect during in-flight payment:
      this.setState("PAYMENT_UNKNOWN");
      if (onProgress) onProgress("PAYMENT_UNKNOWN");
      return {
        ok: false,
        status: "UNKNOWN",
        paymentAttemptStatus: "UNKNOWN",
        posPaymentStatus: "UNKNOWN",
        isUnknown: true,
        error: "Connection lost during processing. The system will verify status before retrying.",
      };
    }
  }

  /**
   * Cancel in-flight payment intent safely
   */
  public async cancelPayment(paymentIntentId: string): Promise<boolean> {
    try {
      const res = await this.apiClient.cancelStripePaymentIntent({ paymentIntentId });
      this.setState(this.connectedReader ? "CONNECTED" : "NO_READER");
      return res.ok;
    } catch {
      return false;
    }
  }
}
