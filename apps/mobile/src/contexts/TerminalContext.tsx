/**
 * Terminal Context & Provider for Pro Buyer Mobile POS (iPad & iPhone)
 *
 * Manages:
 * 1. Multi-tenant PaymentCapabilities (Stripe is 100% optional).
 * 2. POS Device identity (stored locally & registered in backend).
 * 3. Stripe Terminal Adapter (Physical Readers on iPad).
 * 4. Tap to Pay on iPhone Adapter (Apple Proximity Reader on iPhone).
 */

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { Platform } from "react-native";
import type {
  IPaymentCapabilities,
  StripeTerminalOperationalState,
  IVerifyPaymentStatusResponse,
  ICreatePaymentIntentResponse,
  IPaymentHandoffInfo,
  ICreateHandoffPayload,
  ICreateHandoffResponse,
  IAcceptHandoffPayload,
  IAcceptHandoffResponse,
  IAvailableTargetDevice,
} from "@ireader/contracts";
import { useAuth } from "./AuthContext";
import { StripeTerminalAdapter, type IDiscoveredReader } from "../services/StripeTerminalAdapter";
import {
  TapToPayIPhoneAdapter,
  type TapToPayOperationalState,
  type ITapToPayEligibility,
} from "../services/TapToPayIPhoneAdapter";
import { paymentHandoffClient } from "../services/PaymentHandoffService";
import { MobileSecureStorageAdapter } from "../storage/MobileSecureStorageAdapter";

export interface TerminalContextValue {
  capabilities: IPaymentCapabilities;
  isStripeEnabled: boolean;
  isTapToPayEnabled: boolean;
  isIPhone: boolean;
  isTapToPayEligible: boolean;
  operationalState: StripeTerminalOperationalState;
  tapToPayState: TapToPayOperationalState;
  connectedReader: IDiscoveredReader | null;
  discoveredReaders: IDiscoveredReader[];
  posDeviceId: string;
  isDiscovering: boolean;
  lastError: string | null;
  availableTargetDevices: IAvailableTargetDevice[];
  pendingHandoffs: IPaymentHandoffInfo[];
  activeHandoff: IPaymentHandoffInfo | null;
  refreshCapabilities: () => Promise<void>;
  discoverReaders: () => Promise<IDiscoveredReader[]>;
  connectReader: (reader: IDiscoveredReader) => Promise<boolean>;
  disconnectReader: () => Promise<void>;
  collectAndProcessCardPayment: (
    intent: ICreatePaymentIntentResponse,
    onProgress?: (state: StripeTerminalOperationalState) => void
  ) => Promise<IVerifyPaymentStatusResponse>;
  initializeTapToPay: () => Promise<boolean>;
  collectAndProcessTapToPayPayment: (
    intent: ICreatePaymentIntentResponse,
    onProgress?: (state: TapToPayOperationalState) => void
  ) => Promise<IVerifyPaymentStatusResponse>;
  cancelPayment: (paymentIntentId: string) => Promise<boolean>;
  fetchAvailableTargetDevices: (siteId?: string) => Promise<IAvailableTargetDevice[]>;
  createPaymentHandoff: (params: {
    targetDeviceId?: string;
    amount: number;
    saleId?: string;
    siteId?: string;
    notes?: string;
  }) => Promise<ICreateHandoffResponse>;
  cancelActiveHandoff: (handoffId: string, reason?: string) => Promise<boolean>;
  acceptPaymentHandoff: (handoffId: string) => Promise<IAcceptHandoffResponse>;
  rejectPaymentHandoff: (handoffId: string, reason?: string) => Promise<boolean>;
  pollHandoff: (handoffId: string, onUpdate: (h: IPaymentHandoffInfo) => void) => () => void;
}

const DEFAULT_CAPABILITIES: IPaymentCapabilities = {
  cashEnabled: true,
  transferEnabled: true,
  cardEnabled: false,
  stripeReaderEnabled: false,
  stripeTapToPayEnabled: false,
  creditEnabled: true,
  otherEnabled: true,
  defaultMethod: "Cash",
};

const TerminalContext = createContext<TerminalContextValue | null>(null);

const STORAGE_KEY_POS_DEVICE_UUID = "@ireader/pos_device_uuid";

function generateUUID(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return "device-" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

let cachedDeviceUUID: string | null = null;

function getOrCreateDeviceUUID(): string {
  if (cachedDeviceUUID) return cachedDeviceUUID;
  const storage = new MobileSecureStorageAdapter();
  void storage.getItem(STORAGE_KEY_POS_DEVICE_UUID).then((val) => {
    if (val) cachedDeviceUUID = val;
    else {
      const newUuid = generateUUID();
      cachedDeviceUUID = newUuid;
      void storage.setItem(STORAGE_KEY_POS_DEVICE_UUID, newUuid);
    }
  });
  cachedDeviceUUID = generateUUID();
  return cachedDeviceUUID;
}

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const { apiClient, session } = useAuth();
  const [capabilities, setCapabilities] = useState<IPaymentCapabilities>(DEFAULT_CAPABILITIES);
  const [operationalState, setOperationalState] = useState<StripeTerminalOperationalState>("NO_READER");
  const [tapToPayState, setTapToPayState] = useState<TapToPayOperationalState>("READY");
  const [connectedReader, setConnectedReader] = useState<IDiscoveredReader | null>(null);
  const [discoveredReaders, setDiscoveredReaders] = useState<IDiscoveredReader[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const posDeviceId = useMemo(() => getOrCreateDeviceUUID(), []);

  const isIPhone = useMemo(() => {
    return Platform.OS === "ios" && !(Platform as any).isPad;
  }, []);

  const stripeAdapter = useMemo(() => {
    return new StripeTerminalAdapter(apiClient);
  }, [apiClient]);

  const tapToPayAdapter = useMemo(() => {
    return new TapToPayIPhoneAdapter(apiClient);
  }, [apiClient]);

  // Subscribe to Stripe Reader adapter state events
  useEffect(() => {
    const unsubscribe = stripeAdapter.addListener({
      onStateChange: (st) => setOperationalState(st),
      onReadersDiscovered: (readers) => setDiscoveredReaders(readers),
      onReaderConnected: (r) => setConnectedReader(r),
      onReaderDisconnected: () => setConnectedReader(null),
      onError: (err) => setLastError(err),
    });
    return unsubscribe;
  }, [stripeAdapter]);

  // Subscribe to Tap to Pay adapter state events
  useEffect(() => {
    const unsubscribe = tapToPayAdapter.addListener({
      onStateChange: (st) => setTapToPayState(st),
      onError: (err) => setLastError(err),
    });
    return unsubscribe;
  }, [tapToPayAdapter]);

  // Load tenant / site payment capabilities
  const refreshCapabilities = useCallback(async () => {
    try {
      const res = await apiClient.getPaymentCapabilities();
      if (res.ok && res.data) {
        setCapabilities(res.data);
      }
    } catch {
      setCapabilities(DEFAULT_CAPABILITIES);
    }
  }, [apiClient]);

  useEffect(() => {
    if (session?.userId) {
      void refreshCapabilities();
    }
  }, [session?.userId, refreshCapabilities]);

  const isStripeEnabled = Boolean(capabilities.stripeReaderEnabled);
  const isTapToPayEnabled = Boolean(capabilities.stripeTapToPayEnabled);
  const isTapToPayEligible = Boolean(isIPhone && isTapToPayEnabled);

  const discoverReaders = useCallback(async () => {
    if (!isStripeEnabled) return [];
    setIsDiscovering(true);
    setLastError(null);
    try {
      const readers = await stripeAdapter.discoverReaders("bluetooth");
      return readers;
    } finally {
      setIsDiscovering(false);
    }
  }, [stripeAdapter, isStripeEnabled]);

  const connectReader = useCallback(
    async (reader: IDiscoveredReader) => {
      if (!isStripeEnabled) return false;
      setLastError(null);
      return stripeAdapter.connectReader(reader, posDeviceId);
    },
    [stripeAdapter, isStripeEnabled, posDeviceId]
  );

  const disconnectReader = useCallback(async () => {
    await stripeAdapter.disconnectReader();
  }, [stripeAdapter]);

  const collectAndProcessCardPayment = useCallback(
    async (
      intent: ICreatePaymentIntentResponse,
      onProgress?: (state: StripeTerminalOperationalState) => void
    ) => {
      return stripeAdapter.collectAndProcessPayment(intent, onProgress);
    },
    [stripeAdapter]
  );

  const initializeTapToPay = useCallback(async () => {
    if (!isTapToPayEligible) return false;
    return tapToPayAdapter.initializeLocalMobile(posDeviceId);
  }, [tapToPayAdapter, isTapToPayEligible, posDeviceId]);

  const collectAndProcessTapToPayPayment = useCallback(
    async (
      intent: ICreatePaymentIntentResponse,
      onProgress?: (state: TapToPayOperationalState) => void
    ) => {
      return tapToPayAdapter.collectAndProcessPayment(intent, onProgress);
    },
    [tapToPayAdapter]
  );

  const cancelPayment = useCallback(
    async (paymentIntentId: string) => {
      if (isIPhone && isTapToPayEnabled) {
        return tapToPayAdapter.cancelPayment(paymentIntentId);
      }
      return stripeAdapter.cancelPayment(paymentIntentId);
    },
    [stripeAdapter, tapToPayAdapter, isIPhone, isTapToPayEnabled]
  );

  const [availableTargetDevices, setAvailableTargetDevices] = useState<IAvailableTargetDevice[]>([]);
  const [pendingHandoffs, setPendingHandoffs] = useState<IPaymentHandoffInfo[]>([]);
  const [activeHandoff, setActiveHandoff] = useState<IPaymentHandoffInfo | null>(null);

  const fetchAvailableTargetDevices = useCallback(
    async (siteId?: string) => {
      try {
        const res = await apiClient.getAvailableTargetDevices(siteId);
        if (res.ok && res.devices) {
          setAvailableTargetDevices(res.devices);
          return res.devices;
        }
        return [];
      } catch {
        return [];
      }
    },
    [apiClient]
  );

  const createPaymentHandoff = useCallback(
    async (params: {
      targetDeviceId?: string;
      amount: number;
      saleId?: string;
      siteId?: string;
      notes?: string;
    }) => {
      const res = await apiClient.createPaymentHandoff({
        ...params,
        sourceDeviceId: posDeviceId,
        currency: "mxn",
      });
      if (res.ok && res.handoff) {
        setActiveHandoff(res.handoff);
      }
      return res;
    },
    [apiClient, posDeviceId]
  );

  const cancelActiveHandoff = useCallback(
    async (handoffId: string, reason?: string) => {
      const res = await apiClient.cancelPaymentHandoff(handoffId, reason);
      if (res.ok) {
        setActiveHandoff((curr) => (curr?.id === handoffId ? { ...curr, status: "CANCELED" } : curr));
        return true;
      }
      return false;
    },
    [apiClient]
  );

  const acceptPaymentHandoff = useCallback(
    async (handoffId: string) => {
      const res = await apiClient.acceptPaymentHandoff(handoffId, { targetDeviceId: posDeviceId });
      if (res.ok && res.handoff) {
        setActiveHandoff(res.handoff);
      }
      return res;
    },
    [apiClient, posDeviceId]
  );

  const rejectPaymentHandoff = useCallback(
    async (handoffId: string, reason?: string) => {
      const res = await apiClient.rejectPaymentHandoff(handoffId, { targetDeviceId: posDeviceId, reason });
      if (res.ok) {
        setPendingHandoffs((list) => list.filter((h) => h.id !== handoffId));
        return true;
      }
      return false;
    },
    [apiClient, posDeviceId]
  );

  const pollHandoff = useCallback(
    (handoffId: string, onUpdate: (h: IPaymentHandoffInfo) => void) => {
      return paymentHandoffClient.pollHandoffStatus(handoffId, (updated) => {
        setActiveHandoff(updated);
        onUpdate(updated);
      });
    },
    []
  );

  const value = useMemo<TerminalContextValue>(
    () => ({
      capabilities,
      isStripeEnabled,
      isTapToPayEnabled,
      isIPhone,
      isTapToPayEligible,
      operationalState,
      tapToPayState,
      connectedReader,
      discoveredReaders,
      posDeviceId,
      isDiscovering,
      lastError,
      availableTargetDevices,
      pendingHandoffs,
      activeHandoff,
      refreshCapabilities,
      discoverReaders,
      connectReader,
      disconnectReader,
      collectAndProcessCardPayment,
      initializeTapToPay,
      collectAndProcessTapToPayPayment,
      cancelPayment,
      fetchAvailableTargetDevices,
      createPaymentHandoff,
      cancelActiveHandoff,
      acceptPaymentHandoff,
      rejectPaymentHandoff,
      pollHandoff,
    }),
    [
      capabilities,
      isStripeEnabled,
      isTapToPayEnabled,
      isIPhone,
      isTapToPayEligible,
      operationalState,
      tapToPayState,
      connectedReader,
      discoveredReaders,
      posDeviceId,
      isDiscovering,
      lastError,
      availableTargetDevices,
      pendingHandoffs,
      activeHandoff,
      refreshCapabilities,
      discoverReaders,
      connectReader,
      disconnectReader,
      collectAndProcessCardPayment,
      initializeTapToPay,
      collectAndProcessTapToPayPayment,
      cancelPayment,
      fetchAvailableTargetDevices,
      createPaymentHandoff,
      cancelActiveHandoff,
      acceptPaymentHandoff,
      rejectPaymentHandoff,
      pollHandoff,
    ]
  );

  return <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>;
}

export function useTerminal(): TerminalContextValue {
  const ctx = useContext(TerminalContext);
  if (!ctx) {
    throw new Error("useTerminal must be used within a TerminalProvider");
  }
  return ctx;
}
