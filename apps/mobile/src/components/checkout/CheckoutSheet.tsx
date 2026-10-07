import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Linking,
} from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import { useCart } from "../../contexts/CartContext";
import { useCommission } from "../../contexts/CommissionContext";
import { useTerminal } from "../../contexts/TerminalContext";
import { CheckoutApplicationService, normalizeWhatsappPhone } from "@ireader/application";
import type { BackendSaleCreatedResponse, StripeTerminalOperationalState } from "@ireader/contracts";
import type { IDiscoveredReader } from "../../services/StripeTerminalAdapter";
import { IPAD_THEME } from "../../theme/tokens";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { MobilePrinterService } from "../../services/PrinterService";
import { formatCurrency } from "../../utils/formatters";

interface CheckoutSheetProps {
  onSuccess?: (result: BackendSaleCreatedResponse) => void;
  onSaleSuccess?: (result: BackendSaleCreatedResponse) => void;
  onCancel?: () => void;
  onBackToPos?: () => void;
}

const ALL_PAYMENT_METHODS = [
  { id: "Cash", label: "Cash", icon: "💵", description: "Direct cash payment in store" },
  { id: "Card", label: "Card / Stripe", icon: "💳", description: "Stripe Terminal Card Reader" },
  { id: "Transfer", label: "SPEI / Bank", icon: "🏦", description: "Electronic bank transfer" },
  { id: "Credit", label: "Store Credit", icon: "📝", description: "Charge to customer credit balance" },
  { id: "Other", label: "Other", icon: "🏷️", description: "Trade-in or custom split" },
  { id: "Card_Handoff", label: "Cobrar con iPhone", icon: "📱", description: "Tap to Pay en iPhone autorizado" },
] as const;

function generateUUID(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function CheckoutSheet({
  onSuccess,
  onSaleSuccess,
  onCancel,
  onBackToPos,
}: CheckoutSheetProps) {
  const triggerSuccess = onSuccess || onSaleSuccess || (() => {});
  const triggerCancel = onCancel || onBackToPos || (() => {});
  const { apiClient, session } = useAuth();
  const {
    items,
    selectedCustomer,
    discountAmount,
    activeDiscountAuth,
    subtotal,
    totalPreview,
    clearCart,
  } = useCart();
  const { activeSeller, calculateEstimate, recordSale } = useCommission();
  const {
    capabilities,
    isStripeEnabled,
    isTapToPayEnabled,
    isIPhone,
    isTapToPayEligible,
    operationalState,
    tapToPayState,
    connectedReader,
    discoveredReaders,
    defaultReaderId,
    readerHealth,
    isDiscovering,
    discoverReaders,
    connectReader,
    checkReaderStatus,
    collectAndProcessCardPayment,
    collectAndProcessTapToPayPayment,
    posDeviceId,
    availableTargetDevices,
    fetchAvailableTargetDevices,
    createPaymentHandoff,
    cancelActiveHandoff,
    pollHandoff,
  } = useTerminal();

  const commissionSummary = useMemo(() => {
    return calculateEstimate(items);
  }, [calculateEstimate, items]);

  // Logical checkout operation idempotency key (generated once per checkout session, reused on retries)
  const checkoutIdRef = useRef<string>(generateUUID());

  // Filter payment methods strictly based on multi-tenant capabilities and device capability
  const availablePaymentMethods = useMemo(() => {
    const list = ALL_PAYMENT_METHODS.filter((m) => {
      if (m.id === "Cash") return capabilities.cashEnabled !== false;
      if (m.id === "Transfer") return capabilities.transferEnabled !== false;
      if (m.id === "Card") return capabilities.cardEnabled !== false;
      if (m.id === "Credit") return capabilities.creditEnabled !== false;
      if (m.id === "Other") return capabilities.otherEnabled !== false;
      if (m.id === "Card_Handoff") return !isIPhone;
      return true;
    }).map((m) => {
      if (m.id === "Card" && isIPhone && isTapToPayEnabled) {
        return {
          ...m,
          label: "Card / Tap to Pay",
          description: "Tap card or digital wallet on iPhone",
        };
      }
      return m;
    });

    return list;
  }, [capabilities, isIPhone, isTapToPayEnabled]);

  const [paymentMethod, setPaymentMethod] = useState<string>(() => {
    return capabilities.defaultMethod && availablePaymentMethods.some((m) => m.id === capabilities.defaultMethod)
      ? capabilities.defaultMethod
      : availablePaymentMethods[0]?.id || "Cash";
  });

  const [selectedTargetDeviceId, setSelectedTargetDeviceId] = useState<string | null>(null);
  const [activeHandoffId, setActiveHandoffId] = useState<string | null>(null);
  const [handoffStatusMessage, setHandoffStatusMessage] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState(selectedCustomer?.name || "");
  const [customerPhone, setCustomerPhone] = useState(selectedCustomer?.phone || "");
  const [customerEmail, setCustomerEmail] = useState(selectedCustomer?.email || "");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [terminalStep, setTerminalStep] = useState<StripeTerminalOperationalState | null>(null);
  const [isUnknownState, setIsUnknownState] = useState(false);
  const [lastPaymentIntentId, setLastPaymentIntentId] = useState<string | null>(null);
  const [cardMode, setCardMode] = useState<"terminal" | "stripe_link" | "manual">("terminal");
  const [stripeCheckoutUrl, setStripeCheckoutUrl] = useState<string | null>(null);
  const [stripeQrCodeUrl, setStripeQrCodeUrl] = useState<string | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [isSendingStripeLink, setIsSendingStripeLink] = useState(false);
  const [stripeLinkMessage, setStripeLinkMessage] = useState<string | null>(null);
  const [showReaderSelector, setShowReaderSelector] = useState(false);

  // Fetch available target iPhones when selecting Card_Handoff on iPad
  useEffect(() => {
    if (paymentMethod === "Card_Handoff" && !isIPhone) {
      void fetchAvailableTargetDevices(capabilities.stripeLocationId || undefined).then((devs) => {
        if (devs.length > 0 && !selectedTargetDeviceId) {
          const firstAvailable = devs.find((d) => d.isAvailable) || devs[0];
          setSelectedTargetDeviceId(firstAvailable.id);
        }
      });
    }
  }, [paymentMethod, isIPhone, fetchAvailableTargetDevices, capabilities.stripeLocationId, selectedTargetDeviceId]);

  const checkoutService = useMemo(
    () => new CheckoutApplicationService(apiClient),
    [apiClient]
  );

  const printerService = useMemo(() => new MobilePrinterService(), []);

  const handleGenerateStripeLink = async () => {
    setErrorMessage(null);
    setStripeLinkMessage(null);
    setIsGeneratingLink(true);
    try {
      const res = await checkoutService.createStripeCheckoutSession({
        amount: totalPreview,
        currency: capabilities.currency || "mxn",
        saleId: checkoutIdRef.current,
        customerEmail: customerEmail.trim().toLowerCase() || undefined,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        description: `Venta POS #${checkoutIdRef.current.substring(0, 8)}`,
      });
      if (res.ok && res.checkoutUrl) {
        setStripeCheckoutUrl(res.checkoutUrl);
        setStripeQrCodeUrl(res.qrCodeUrl || null);
      } else {
        setErrorMessage(res.error || "No se pudo generar el enlace de pago de Stripe.");
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Error al conectar con Stripe.");
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleSendStripeLinkWhatsApp = async () => {
    if (!stripeCheckoutUrl) return;
    const phoneNorm = normalizeWhatsappPhone(customerPhone);
    if (!phoneNorm.valid) {
      setErrorMessage(phoneNorm.error || "Ingresa un WhatsApp válido antes de enviar el enlace.");
      return;
    }

    setErrorMessage(null);
    setStripeLinkMessage(null);
    setIsSendingStripeLink(true);
    try {
      const message = `Hola ${customerName.trim() || ""}! Aquí tienes tu enlace de pago seguro con tarjeta para tu compra de ${formatCurrency(
        totalPreview
      )}: ${stripeCheckoutUrl}`;
      const result = await apiClient.sendChatMessage({
        channel: "WHATSAPP",
        phone: phoneNorm.normalized,
        recipientName: customerName.trim() || undefined,
        content: message,
      });
      if (!result.ok || result.providerResult?.success === false) {
        throw new Error(result.error || result.providerResult?.error || "No se pudo enviar el enlace por WhatsApp.");
      }
      setStripeLinkMessage("Enlace enviado por WhatsApp mediante el proveedor configurado.");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "No se pudo enviar el enlace por WhatsApp.");
    } finally {
      setIsSendingStripeLink(false);
    }
  };

  // Reader Discovery Handler for Card / Stripe
  const handleScanReaders = async () => {
    setErrorMessage(null);
    try {
      const readers = await discoverReaders();
      if (readers.length > 0) {
        const preferredReader = readers.find((reader) => reader.id === defaultReaderId) || readers[0];
        await connectReader(preferredReader);
        setShowReaderSelector(readers.length > 1);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Error scanning for card readers.");
    }
  };

  const handleConnectReader = async (r: IDiscoveredReader) => {
    setErrorMessage(null);
    try {
      const ok = await connectReader(r);
      if (!ok) {
        setErrorMessage("No se pudo conectar con el lector. Verifica que la terminal esté encendida.");
      } else {
        setShowReaderSelector(false);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Error al conectar lector.");
    }
  };

  // Re-verify payment when in UNKNOWN state
  const handleReverifyUnknownPayment = async () => {
    if (!lastPaymentIntentId) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const verifyRes = await checkoutService.verifyStripePayment({
        paymentIntentId: lastPaymentIntentId,
        posDeviceId,
      });

      if (verifyRes.ok && (verifyRes.status === "SUCCEEDED" || verifyRes.posPaymentStatus === "PAID")) {
        setIsUnknownState(false);
        setTerminalStep("PAYMENT_SUCCEEDED");

        // Complete sale in backend
        const saleRes = await finalizeBackendSale("Card", lastPaymentIntentId);
        if (saleRes) {
          triggerSuccess(saleRes);
        }
      } else if (verifyRes.status === "FAILED") {
        setIsUnknownState(false);
        setTerminalStep("PAYMENT_FAILED");
        setErrorMessage("El pago anterior fue declinado o cancelado por Stripe. Puede intentar con otro método.");
      } else {
        setErrorMessage("El estado del pago continúa pendiente en Stripe. Por favor intente verificar de nuevo en unos segundos.");
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Error al verificar estado del pago.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const finalizeBackendSale = async (
    method: string,
    stripeReference?: string
  ): Promise<BackendSaleCreatedResponse | null> => {
    const phoneNorm = normalizeWhatsappPhone(customerPhone);
    const salePayload = {
      saleId: activeDiscountAuth?.draftSaleId || checkoutIdRef.current,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim().toLowerCase() || undefined,
      customerWhatsapp: phoneNorm.normalized || "+520000000000",
      sendReceiptEmail: Boolean(customerEmail.trim()),
      paymentMethod: method,
      paymentBreakdown: { [method]: totalPreview },
      notes: notes.trim()
        ? stripeReference
          ? `${notes.trim()} | Stripe: ${stripeReference}`
          : notes.trim()
        : stripeReference
        ? `Stripe PI: ${stripeReference}`
        : undefined,
      soldBy: activeSeller.name || session?.email || "iPad POS",
      authorizationId: activeDiscountAuth?.id,
      discount: activeDiscountAuth?.approvedDiscount ?? (discountAmount > 0 ? discountAmount : undefined),
      items: items.map((i) => ({
        inventoryItemId: i.inventoryItem.id,
        imei: i.inventoryItem.imei || i.inventoryItem.serialNumber || i.inventoryItem.id,
        salePrice: i.salePrice,
      })),
    };

    const res = await checkoutService.processBackendSale(salePayload);
    if (!res.ok || !res.data) {
      setErrorMessage(res.error || "Failed to process sale on server.");
      return null;
    }

    // Commission registration
    void recordSale(res.data.saleId || checkoutIdRef.current, res.data.saleNumber, items);

    // Thermal receipt printing
    void printerService.printReceipt({
      saleId: res.data.saleId || res.data.saleNumber || checkoutIdRef.current || "POS-SALE",
      customerName: res.data.customer?.name || customerName.trim(),
      items: res.data.items?.length
        ? res.data.items.map((i) => ({
            model: i.model || "Device",
            imei: i.imei,
            salePrice: i.salePrice,
          }))
        : items.map((i) => ({
            model: i.inventoryItem.model,
            imei: i.inventoryItem.imei || undefined,
            salePrice: i.salePrice,
          })),
      totalAmount: typeof res.data.total === "number" ? res.data.total : totalPreview,
      paymentMethod: res.data.paymentMethod || method,
      createdAt: res.data.createdAt || new Date().toISOString(),
    });

    clearCart();
    return res.data;
  };

  const handleCompleteSale = async () => {
    // 1. Guard against double-tap / concurrent submission
    if (isSubmitting) return;

    if (!items || items.length === 0) {
      setErrorMessage("Cannot complete checkout: Cart is empty.");
      return;
    }

    if (activeDiscountAuth && activeDiscountAuth.status === "PENDING") {
      setErrorMessage(
        "No se puede finalizar la venta mientras la solicitud de descuento por WhatsApp siga pendiente de aprobación."
      );
      return;
    }

    if (!customerName.trim()) {
      setErrorMessage("Customer name is required for authoritative record.");
      return;
    }

    const phoneNorm = normalizeWhatsappPhone(customerPhone);
    if (!phoneNorm.valid) {
      setErrorMessage(phoneNorm.error || "Customer WhatsApp with country code is required.");
      return;
    }

    if (paymentMethod === "Credit" && !selectedCustomer?.creditEnabled) {
      setErrorMessage(
        "Credit payment requires a registered customer with Credit Enabled by admin."
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    // ─── STRIPE TAP TO PAY ON IPHONE FLOW ──────────────────────────────────
    if (paymentMethod === "Card" && isIPhone && isTapToPayEnabled) {
      try {
        setTerminalStep("CONNECTING");

        // 1. Backend creates PaymentIntent & PosPayment with STRIPE_TAP_TO_PAY_IPHONE channel
        const intentRes = await checkoutService.initiateStripeCardPayment({
          saleId: checkoutIdRef.current,
          idempotencyKey: `ik_ttp_${checkoutIdRef.current}_${Date.now()}`,
          amount: totalPreview,
          currency: capabilities.currency || "mxn",
          posDeviceId,
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim().toLowerCase() || undefined,
          customerPhone: phoneNorm.normalized,
        });

        const isOk = Boolean(intentRes.ok || (intentRes as any).success);
        const piId = intentRes.paymentIntentId || (intentRes as any).stripePaymentIntentId;

        if (!isOk || !piId) {
          throw new Error(intentRes.error || "No se pudo iniciar el cobro con Tap to Pay en el servidor.");
        }

        setLastPaymentIntentId(piId);

        // 2. Terminal SDK executes contactless Tap to Pay collection & processPayment & backend verification
        const terminalResult = await collectAndProcessTapToPayPayment(intentRes, (step) => {
          setTerminalStep(step as any);
        });

        if (terminalResult.isUnknown || terminalResult.status === "UNKNOWN") {
          setIsUnknownState(true);
          setTerminalStep("PAYMENT_UNKNOWN");
          setErrorMessage(
            "⚠️ Transacción Tap to Pay en estado ambiguo. El backend está verificando con Stripe. NO intente cobrar de nuevo hasta verificar."
          );
          return;
        }

        if (!terminalResult.ok || terminalResult.status !== "SUCCEEDED") {
          setTerminalStep("PAYMENT_FAILED");
          throw new Error(terminalResult.error || "Transacción Tap to Pay declinada o cancelada.");
        }

        // 3. Finalize sale record in backend
        setTerminalStep("PAYMENT_SUCCEEDED");
        const saleRes = await finalizeBackendSale("Card", intentRes.paymentIntentId);
        if (saleRes) {
          triggerSuccess(saleRes);
        }
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Error durante el cobro con Tap to Pay en iPhone."
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // ─── CROSS-DEVICE TAP TO PAY HANDOFF FLOW (iPad -> iPhone) ───────────────
    if (paymentMethod === "Card_Handoff") {
      if (!selectedTargetDeviceId) {
        setIsSubmitting(false);
        setErrorMessage("Por favor seleccione un iPhone autorizado para enviar el cobro.");
        return;
      }

      try {
        setHandoffStatusMessage("Enviando cobro al iPhone...");
        setTerminalStep("CONNECTING");

        // 1. Backend creates PaymentHandoff and PaymentIntent
        const handoffRes = await createPaymentHandoff({
          targetDeviceId: selectedTargetDeviceId,
          amount: totalPreview,
          saleId: checkoutIdRef.current,
          siteId: capabilities.stripeLocationId || undefined,
          notes: `Venta iPad ${checkoutIdRef.current}`,
        });

        if (!handoffRes.ok || !handoffRes.handoffId) {
          throw new Error(handoffRes.error || "No se pudo crear la solicitud de cobro en el servidor.");
        }

        setActiveHandoffId(handoffRes.handoffId);
        setLastPaymentIntentId(handoffRes.handoff.stripePaymentIntentId || null);
        setHandoffStatusMessage("Esperando que el iPhone acepte el cobro...");

        // 2. Poll handoff state until terminal
        await new Promise<void>((resolve, reject) => {
          const stopPolling = pollHandoff(handoffRes.handoffId, async (updated) => {
            if (updated.status === "ASSIGNED") {
              setHandoffStatusMessage("Esperando que el iPhone acepte el cobro...");
              setTerminalStep("CONNECTING");
            } else if (updated.status === "ACCEPTED") {
              setHandoffStatusMessage("iPhone aceptó. Cliente acercando tarjeta...");
              setTerminalStep("WAITING_FOR_CARD");
            } else if (updated.status === "PAYMENT_PROCESSING") {
              setHandoffStatusMessage("Procesando pago en el iPhone...");
              setTerminalStep("PROCESSING");
            } else if (updated.status === "VERIFYING") {
              setHandoffStatusMessage("Verificando transacción con el banco...");
              setTerminalStep("VERIFYING");
            } else if (updated.status === "SUCCEEDED") {
              stopPolling();
              setHandoffStatusMessage("¡Pago Aprobado!");
              setTerminalStep("PAYMENT_SUCCEEDED");
              try {
                const saleRes = await finalizeBackendSale("Card", updated.stripePaymentIntentId || undefined);
                if (saleRes) {
                  triggerSuccess(saleRes);
                }
                resolve();
              } catch (e) {
                reject(e);
              }
            } else if (updated.status === "UNKNOWN") {
              stopPolling();
              setIsUnknownState(true);
              setTerminalStep("PAYMENT_UNKNOWN");
              setHandoffStatusMessage("⚠️ Estado ambiguo. Verificando con Stripe...");
              resolve();
            } else if (updated.status === "CANCELED" || updated.status === "EXPIRED" || updated.status === "FAILED") {
              stopPolling();
              setTerminalStep("PAYMENT_FAILED");
              reject(new Error(`El cobro en iPhone fue ${updated.status.toLowerCase()}.`));
            }
          });
        });
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Error durante el cobro cruzado con iPhone."
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // ─── STRIPE PHYSICAL READER FLOW (iPad) ─────────────────────────────────
    if (paymentMethod === "Card" && !isIPhone && cardMode === "terminal") {
      if (!connectedReader) {
        setIsSubmitting(false);
        setErrorMessage("Por favor conecte su lector Stripe (STRM26146031090) con el botón 'Buscar Lectores' o cambie el selector a 'Terminal Externa / Manual'.");
        return;
      }

      try {
        setTerminalStep("CONNECTING");

        // 1. Backend creates PaymentIntent & PosPayment
        const intentRes = await checkoutService.initiateStripeCardPayment({
          saleId: checkoutIdRef.current,
          idempotencyKey: `ik_reader_${checkoutIdRef.current}_${Date.now()}`,
          amount: totalPreview,
          currency: capabilities.currency || "mxn",
          posDeviceId,
          stripeReaderId: connectedReader.stripeReaderId || connectedReader.id,
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim().toLowerCase() || undefined,
          customerPhone: phoneNorm.normalized,
        });

        const isOk = Boolean(intentRes.ok || (intentRes as any).success);
        const piId = intentRes.paymentIntentId || (intentRes as any).stripePaymentIntentId;

        if (!isOk || !piId) {
          throw new Error(intentRes.error || "No se pudo iniciar el cobro con Stripe en el servidor.");
        }

        setLastPaymentIntentId(piId);

        // 2. Terminal SDK executes collectPaymentMethod & processPayment & authoritative verification
        const terminalResult = await collectAndProcessCardPayment(intentRes, (step) => {
          setTerminalStep(step);
        });

        if (terminalResult.isUnknown || terminalResult.status === "UNKNOWN") {
          setIsUnknownState(true);
          setTerminalStep("PAYMENT_UNKNOWN");
          setErrorMessage(
            "⚠️ Transacción en estado ambiguo. El backend está verificando con Stripe. NO intente cobrar de nuevo hasta verificar."
          );
          return;
        }

        if (!terminalResult.ok || terminalResult.status !== "SUCCEEDED") {
          setTerminalStep("PAYMENT_FAILED");
          throw new Error(terminalResult.error || "Transacción declinada o fallida.");
        }

        // 3. Finalize sale record in backend
        setTerminalStep("PAYMENT_SUCCEEDED");
        const saleRes = await finalizeBackendSale("Card", intentRes.paymentIntentId);
        if (saleRes) {
          triggerSuccess(saleRes);
        }
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Error durante el cobro con lector Stripe."
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // ─── STANDARD NON-STRIPE FLOW (Cash, Transfer, Credit, Other, Manual Card, Stripe Link) ─
    try {
      const stripeRef =
        paymentMethod === "Card" && cardMode === "stripe_link" && stripeCheckoutUrl
          ? `Online Checkout: ${stripeCheckoutUrl}`
          : undefined;
      const saleRes = await finalizeBackendSale(paymentMethod, stripeRef);
      if (saleRes) {
        triggerSuccess(saleRes);
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Network error during checkout. Please verify connection and retry."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Finalize POS Sale</Text>
          <Text style={styles.subtitle}>
            Order containing {items.length} device{items.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <TouchableOpacity
          onPress={triggerCancel}
          style={styles.cancelBtn}
          accessibilityRole="button"
          accessibilityLabel="Cancel checkout"
        >
          <Text style={styles.cancelText}>✕ Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Terminal Operational State Banner */}
      {terminalStep && isSubmitting && (
        <View style={styles.terminalStateBanner}>
          <ActivityIndicator color={IPAD_THEME.colors.accent} size="small" />
          <Text style={styles.terminalStateText}>
            {terminalStep === "PREPARING_TAP_TO_PAY" && "📲 Preparando Tap to Pay en iPhone..."}
            {terminalStep === "WAITING_FOR_CUSTOMER" && "💳 Acerque la tarjeta o billetera digital al iPhone..."}
            {terminalStep === "PROCESSING_PAYMENT" && "⏳ Procesando pago sin contacto con Stripe..."}
            {terminalStep === "VERIFYING_PAYMENT" && "🛡️ Verificando autorización en el servidor..."}
            {terminalStep === "WAITING_FOR_CARD" && "💳 Acerque, inserte o deslice la tarjeta en el lector..."}
            {terminalStep === "PROCESSING" && "⏳ Procesando transacción con Stripe..."}
            {terminalStep === "VERIFYING" && "🛡️ Verificando autorización en el servidor..."}
            {terminalStep === "CONNECTING" && "🔌 Conectando con Stripe..."}
          </Text>
        </View>
      )}

      {/* Unknown Payment State Banner */}
      {isUnknownState && (
        <View style={styles.unknownAlert}>
          <Text style={styles.unknownTitle}>⚠️ PAGO EN VERIFICACIÓN (UNKNOWN STATE)</Text>
          <Text style={styles.unknownDesc}>
            La comunicación con el lector o Stripe se interrumpió durante el cobro. No reintente cobrar para evitar doble cargo al cliente.
          </Text>
          <TouchableOpacity
            style={styles.reverifyBtn}
            onPress={handleReverifyUnknownPayment}
            disabled={isSubmitting}
          >
            <Text style={styles.reverifyBtnText}>
              {isSubmitting ? "Verificando con Servidor..." : "🔍 Re-verificar Estado de Pago con Stripe"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {errorMessage && !isUnknownState && (
        <View style={styles.errorAlert} accessibilityRole="alert">
          <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
        </View>
      )}

      {/* 2-Column Split inside Sheet on iPad */}
      <View style={styles.grid}>
        {/* Left Column: Order Review */}
        <View style={styles.colLeft}>
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Order Summary</Text>
            {items.map((it) => (
              <View key={it.inventoryItem.id} style={styles.itemRow}>
                <View style={styles.itemMeta}>
                  <Text style={styles.itemModel}>{it.inventoryItem.model}</Text>
                  <Text style={styles.itemImei}>
                    IMEI: {it.inventoryItem.imei || it.inventoryItem.serialNumber || "—"}
                  </Text>
                </View>
                <Text style={styles.itemPrice}>{formatCurrency(it.salePrice)}</Text>
              </View>
            ))}

            <View style={styles.divider} />

            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Subtotal</Text>
              <Text style={styles.calcVal}>{formatCurrency(subtotal)}</Text>
            </View>

            {discountAmount > 0 && (
              <View style={styles.calcRow}>
                <Text style={styles.discountLabel}>
                  {activeDiscountAuth ? "Descuento Autorizado" : "Discount"}
                </Text>
                <Text style={styles.discountVal}>-{formatCurrency(discountAmount)}</Text>
              </View>
            )}

            {activeDiscountAuth && (
              <View
                style={{
                  backgroundColor:
                    activeDiscountAuth.status === "APPROVED" || activeDiscountAuth.status === "PARTIAL"
                      ? "rgba(34, 197, 94, 0.12)"
                      : "rgba(245, 158, 11, 0.12)",
                  padding: 8,
                  borderRadius: 8,
                  marginTop: 6,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color:
                      activeDiscountAuth.status === "APPROVED" || activeDiscountAuth.status === "PARTIAL"
                        ? "#4ade80"
                        : "#fcd34d",
                  }}
                >
                  {activeDiscountAuth.status === "APPROVED" && "✅ Aprobado por Administrador"}
                  {activeDiscountAuth.status === "PARTIAL" && "ℹ️ Aprobación Parcial"}
                  {activeDiscountAuth.status === "PENDING" && "⏳ Esperando Autorización WhatsApp"}
                </Text>
                {activeDiscountAuth.responseNote && (
                  <Text style={{ fontSize: 10, color: "#cbd5e1", marginTop: 2, fontStyle: "italic" }}>
                    &quot;{activeDiscountAuth.responseNote}&quot;
                  </Text>
                )}
              </View>
            )}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Due</Text>
              <Text style={styles.totalVal}>{formatCurrency(totalPreview)}</Text>
            </View>
          </View>
        </View>

        {/* Right Column: Customer & Payment Method */}
        <View style={styles.colRight}>
          {/* Customer Details */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardHeader}>Customer / Receipt Info</Text>
              {selectedCustomer?.creditEnabled && (
                <Badge label="CREDIT APPROVED" variant="success" />
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Customer Full Name *</Text>
              <TextInput
                style={styles.input}
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="Full Name"
                placeholderTextColor={IPAD_THEME.colors.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>WhatsApp Phone (with country code) *</Text>
              <TextInput
                style={styles.input}
                value={customerPhone}
                onChangeText={setCustomerPhone}
                placeholder="+52 55 1234 5678"
                placeholderTextColor={IPAD_THEME.colors.textMuted}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email Receipt (Optional)</Text>
              <TextInput
                style={styles.input}
                value={customerEmail}
                onChangeText={setCustomerEmail}
                placeholder="customer@domain.com"
                placeholderTextColor={IPAD_THEME.colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Seller / Commission Assignment */}
          <View style={styles.card}>
            <View style={styles.sellerHeaderRow}>
              <View>
                <Text style={styles.cardHeader}>Vendedor Asignado</Text>
                <Text style={styles.sellerNameDisplay}>
                  {activeSeller.name} ({activeSeller.role || "Vendedor"})
                </Text>
              </View>
              {commissionSummary.totalCommission > 0 && (
                <View style={styles.commissionPill}>
                  <Text style={styles.commissionPillText}>
                    💰 Comisión: +{formatCurrency(commissionSummary.totalCommission)} MXN
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Payment Method Selection */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Select Payment Method</Text>
            <View style={styles.paymentGrid}>
              {availablePaymentMethods.map((m) => {
                const isSelected = paymentMethod === m.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.paymentBtn, isSelected && styles.paymentBtnSelected]}
                    onPress={() => setPaymentMethod(m.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Payment method ${m.label}`}
                  >
                    <Text style={styles.paymentIcon}>{m.icon}</Text>
                    <Text
                      style={[
                        styles.paymentText,
                        isSelected && styles.paymentTextSelected,
                      ]}
                    >
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Tap to Pay on iPhone Box (when Card + Tap to Pay on iPhone) */}
            {paymentMethod === "Card" && isIPhone && isTapToPayEnabled && (
              <View style={styles.tapToPayBox}>
                <Text style={styles.tapToPayBoxTitle}>📲 Tap to Pay on iPhone</Text>
                <Text style={styles.tapToPayBoxDesc}>
                  Acepta tarjetas sin contacto (Visa, Mastercard, AMEX) y billeteras digitales (Apple Pay, Google Pay) directamente en este iPhone.
                </Text>
              </View>
            )}

            {/* Stripe Reader vs QR/Link vs Manual Card Mode Selection (Shown on iPad when Card is active) */}
            {paymentMethod === "Card" && !isIPhone && (
              <View style={styles.readerContainer}>
                <View style={styles.cardModeToggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.cardModeBtn,
                      cardMode === "terminal" && styles.cardModeBtnActive,
                    ]}
                    onPress={() => {
                      setCardMode("terminal");
                      setErrorMessage(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.cardModeBtnText,
                        cardMode === "terminal" && styles.cardModeBtnTextActive,
                      ]}
                    >
                      💳 Lector STRM2
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.cardModeBtn,
                      cardMode === "stripe_link" && styles.cardModeBtnActive,
                    ]}
                    onPress={() => {
                      setCardMode("stripe_link");
                      setErrorMessage(null);
                      if (!stripeCheckoutUrl) {
                        void handleGenerateStripeLink();
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.cardModeBtnText,
                        cardMode === "stripe_link" && styles.cardModeBtnTextActive,
                      ]}
                    >
                      🌐 QR / Link Stripe
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.cardModeBtn,
                      cardMode === "manual" && styles.cardModeBtnActive,
                    ]}
                    onPress={() => {
                      setCardMode("manual");
                      setErrorMessage(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.cardModeBtnText,
                        cardMode === "manual" && styles.cardModeBtnTextActive,
                      ]}
                    >
                      🏦 Terminal Externa
                    </Text>
                  </TouchableOpacity>
                </View>

                {cardMode === "manual" && (
                  <View style={styles.readerConnectedBox}>
                    <Text style={styles.readerConnectedText}>
                      🏦 Modo Registro Directo / Terminal Externa
                    </Text>
                    <Text style={styles.readerSubText}>
                      Permite registrar la venta con tarjeta sin conectar el lector Stripe físico (ideal si cobraste en Clip, terminal bancaria o en línea).
                    </Text>
                  </View>
                )}

                {cardMode === "stripe_link" && (
                  <View style={styles.qrContainerBox}>
                    <Text style={styles.qrBoxTitle}>🌐 Pago Online vía Stripe (Sin Terminal)</Text>
                    <Text style={styles.qrBoxDesc}>
                      El cliente puede pagar desde su celular con Apple Pay, Google Pay o introduciendo su tarjeta en la pasarela oficial de Stripe.
                    </Text>

                    {isGeneratingLink ? (
                      <View style={{ paddingVertical: 24, alignItems: "center" }}>
                        <ActivityIndicator size="large" color="#38bdf8" />
                        <Text style={{ color: IPAD_THEME.colors.textSecondary, marginTop: 8, fontSize: 13 }}>
                          Generando QR y Checkout seguro de Stripe...
                        </Text>
                      </View>
                    ) : stripeQrCodeUrl ? (
                      <View style={styles.qrCenterContent}>
                        <Image
                          source={{ uri: stripeQrCodeUrl }}
                          style={styles.qrImage}
                          resizeMode="contain"
                        />
                        <Text style={styles.qrScanPrompt}>
                          📱 Apunte con la cámara del celular para pagar
                        </Text>
                        {stripeLinkMessage && <Text style={styles.stripeLinkSuccess}>{stripeLinkMessage}</Text>}
                        <View style={styles.qrActionsRow}>
                          <TouchableOpacity
                            style={styles.qrActionBtn}
                            onPress={() => {
                              if (stripeCheckoutUrl) {
                                void Linking.openURL(stripeCheckoutUrl);
                              }
                            }}
                          >
                            <Text style={styles.qrActionBtnText}>🔗 Abrir Checkout</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.qrActionBtn, { backgroundColor: "#25D366" }]}
                            onPress={() => void handleSendStripeLinkWhatsApp()}
                            disabled={isSendingStripeLink}
                          >
                            <Text style={[styles.qrActionBtnText, { color: "#ffffff" }]}>
                              {isSendingStripeLink ? "Enviando..." : "📲 Enviar por WhatsApp"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.generateLinkBtn}
                        onPress={handleGenerateStripeLink}
                      >
                        <Text style={styles.generateLinkBtnText}>
                          ⚡ Generar Enlace y Código QR ({formatCurrency(totalPreview)})
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {cardMode === "terminal" && (
                  <>
                    <View style={styles.readerHeaderRow}>
                      <Text style={styles.readerHeaderTitle}>Lector Stripe Terminal</Text>
                      <TouchableOpacity
                        onPress={handleScanReaders}
                        disabled={isDiscovering}
                        style={styles.scanBtn}
                      >
                        <Text style={styles.scanBtnText}>
                          {isDiscovering ? "Buscando..." : "🔍 Buscar Lectores"}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {connectedReader ? (
                      <View style={styles.readerConnectedBox}>
                        <Text style={styles.readerConnectedText}>
                          🟢 Conectado: <Text style={{ fontWeight: "900" }}>{connectedReader.label || connectedReader.deviceType}</Text>
                        </Text>
                        <Text style={styles.readerSubText}>
                          S/N: {connectedReader.serialNumber} • Batería: {Math.round((connectedReader.batteryLevel ?? 0.95) * 100)}%
                        </Text>
                        <View style={styles.readerInlineActions}>
                          <TouchableOpacity onPress={() => setShowReaderSelector((visible) => !visible)} style={styles.readerInlineBtn}>
                            <Text style={styles.readerInlineBtnText}>{showReaderSelector ? "Ocultar terminales" : "Cambiar terminal"}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => void checkReaderStatus()} style={styles.readerInlineBtn}>
                            <Text style={styles.readerInlineBtnText}>Verificar estado</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.readerSubText}>
                          Estado: {readerHealth === "READY" ? "LISTA PARA COBRAR" : readerHealth}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.readerDisconnectedBox}>
                        <Text style={styles.readerDisconnectedText}>
                          ⚠️ Ningún lector conectado. Toque &quot;Buscar Lectores&quot; o elija &quot;QR / Link Stripe&quot;.
                        </Text>
                      </View>
                    )}

                    {discoveredReaders.length > 0 && (showReaderSelector || !connectedReader) && (
                      <View style={styles.discoveredList}>
                        <Text style={styles.discoveredListTitle}>Lectores encontrados:</Text>
                        {discoveredReaders.map((r) => (
                          <TouchableOpacity
                            key={r.id}
                            style={[styles.discoveredItem, connectedReader?.id === r.id && styles.discoveredItemSelected]}
                            onPress={() => void handleConnectReader(r)}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={styles.discoveredItemText}>
                                📲 {r.label || r.deviceType} {defaultReaderId === r.id ? "· Predeterminada" : ""}
                              </Text>
                              <Text style={styles.readerSubText}>S/N: {r.serialNumber} · {r.status}</Text>
                            </View>
                            <Text style={styles.connectActionText}>{connectedReader?.id === r.id ? "Conectada" : "Usar"}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>
            )}

            {/* Cross-Device Tap to Pay on iPhone Selection (Only shown on iPad when Card_Handoff is active) */}
            {paymentMethod === "Card_Handoff" && !isIPhone && (
              <View style={styles.readerContainer}>
                <View style={styles.readerHeaderRow}>
                  <Text style={styles.readerHeaderTitle}>Seleccione iPhone para Cobro</Text>
                  <TouchableOpacity
                    onPress={() => fetchAvailableTargetDevices(capabilities.stripeLocationId || undefined)}
                    style={styles.scanBtn}
                  >
                    <Text style={styles.scanBtnText}>🔄 Actualizar</Text>
                  </TouchableOpacity>
                </View>

                {availableTargetDevices.length === 0 ? (
                  <View style={styles.readerDisconnectedBox}>
                    <Text style={styles.readerDisconnectedText}>
                      ⚠️ No hay iPhones de cobro registrados o disponibles en esta sucursal.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.discoveredList}>
                    {availableTargetDevices.map((dev) => {
                      const isTargetSelected = selectedTargetDeviceId === dev.id;
                      return (
                        <TouchableOpacity
                          key={dev.id}
                          style={[
                            styles.discoveredItem,
                            isTargetSelected && { borderColor: "#3b82f6", backgroundColor: "rgba(59, 130, 246, 0.15)" },
                          ]}
                          onPress={() => setSelectedTargetDeviceId(dev.id)}
                        >
                          <Text style={styles.discoveredItemText}>
                            📱 {dev.deviceName} {dev.isAvailable ? "🟢 Disponible" : "🟡 Ocupado"}
                          </Text>
                          <Text style={[styles.connectActionText, isTargetSelected && { color: "#3b82f6", fontWeight: "bold" }]}>
                            {isTargetSelected ? "✓ Seleccionado" : "Seleccionar"}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {handoffStatusMessage && (
                  <View style={{ marginTop: 12, padding: 12, backgroundColor: "#0f172a", borderRadius: 8 }}>
                    <Text style={{ color: "#38bdf8", fontWeight: "700", textAlign: "center" }}>
                      {handoffStatusMessage}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Internal Notes / POS Reference</Text>
              <TextInput
                style={styles.input}
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. Card Auth #12345 or Transfer Ref"
                placeholderTextColor={IPAD_THEME.colors.textMuted}
              />
            </View>
          </View>

          {/* Complete Button */}
          <Button
            title={`Confirm & Charge ${formatCurrency(totalPreview)}`}
            variant="success"
            size="lg"
            loading={isSubmitting}
            onPress={handleCompleteSale}
            style={styles.completeBtn}
            accessibilityLabel={`Confirm and charge ${formatCurrency(totalPreview)}`}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: IPAD_THEME.colors.background,
  },
  content: {
    padding: IPAD_THEME.spacing.xxl,
    maxWidth: 1080,
    alignSelf: "center",
    width: "100%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: IPAD_THEME.spacing.xl,
  },
  title: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 26,
    fontWeight: "900",
  },
  subtitle: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 14,
    marginTop: 2,
  },
  cancelBtn: {
    paddingHorizontal: IPAD_THEME.spacing.md,
    paddingVertical: IPAD_THEME.spacing.sm,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
  },
  cancelText: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 14,
    fontWeight: "700",
  },
  terminalStateBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    borderColor: "#38bdf8",
    borderWidth: 1,
    borderRadius: IPAD_THEME.radius.md,
    padding: IPAD_THEME.spacing.md,
    marginBottom: IPAD_THEME.spacing.lg,
  },
  terminalStateText: {
    color: "#38bdf8",
    fontSize: 14,
    fontWeight: "800",
  },
  unknownAlert: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderColor: "#f59e0b",
    borderWidth: 1.5,
    borderRadius: IPAD_THEME.radius.md,
    padding: IPAD_THEME.spacing.lg,
    marginBottom: IPAD_THEME.spacing.lg,
  },
  unknownTitle: {
    color: "#fbbf24",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 4,
  },
  unknownDesc: {
    color: "#fef3c7",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  reverifyBtn: {
    backgroundColor: "#d97706",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  reverifyBtnText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 13,
  },
  errorAlert: {
    backgroundColor: IPAD_THEME.colors.dangerMuted,
    borderColor: IPAD_THEME.colors.danger,
    borderWidth: 1,
    borderRadius: IPAD_THEME.radius.md,
    padding: IPAD_THEME.spacing.md,
    marginBottom: IPAD_THEME.spacing.lg,
  },
  errorText: {
    color: IPAD_THEME.colors.danger,
    fontSize: 14,
    fontWeight: "700",
  },
  grid: {
    flexDirection: "row",
    gap: IPAD_THEME.spacing.xl,
  },
  colLeft: {
    flex: 1,
  },
  colRight: {
    flex: 1.2,
    gap: IPAD_THEME.spacing.lg,
  },
  card: {
    backgroundColor: IPAD_THEME.colors.surfacePrimary,
    borderRadius: IPAD_THEME.radius.lg,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    padding: IPAD_THEME.spacing.lg,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: IPAD_THEME.spacing.md,
  },
  cardHeader: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: IPAD_THEME.spacing.xs,
  },
  itemMeta: {
    flex: 1,
  },
  itemModel: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  itemImei: {
    color: IPAD_THEME.colors.textMuted,
    fontSize: 11,
    fontFamily: "Courier",
  },
  itemPrice: {
    color: IPAD_THEME.colors.accent,
    fontSize: 15,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: IPAD_THEME.colors.borderSubtle,
    marginVertical: IPAD_THEME.spacing.md,
  },
  calcRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  calcLabel: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
  },
  calcVal: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  discountLabel: {
    color: IPAD_THEME.colors.success,
    fontSize: 13,
  },
  discountVal: {
    color: IPAD_THEME.colors.success,
    fontSize: 13,
    fontWeight: "700",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: IPAD_THEME.spacing.sm,
  },
  totalLabel: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 17,
    fontWeight: "800",
  },
  totalVal: {
    color: IPAD_THEME.colors.accent,
    fontSize: 24,
    fontWeight: "900",
  },
  inputGroup: {
    marginBottom: IPAD_THEME.spacing.md,
  },
  inputLabel: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: IPAD_THEME.spacing.xs,
    textTransform: "uppercase",
  },
  input: {
    height: IPAD_THEME.touchTarget.minHeight,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: IPAD_THEME.radius.md,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    paddingHorizontal: IPAD_THEME.spacing.md,
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 14,
  },
  paymentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: IPAD_THEME.spacing.sm,
    marginBottom: IPAD_THEME.spacing.md,
  },
  paymentBtn: {
    flexBasis: "30%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: IPAD_THEME.spacing.xs,
    height: IPAD_THEME.touchTarget.minHeight,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    borderRadius: IPAD_THEME.radius.md,
    paddingHorizontal: IPAD_THEME.spacing.sm,
  },
  paymentBtnSelected: {
    backgroundColor: IPAD_THEME.colors.accent,
    borderColor: IPAD_THEME.colors.accent,
  },
  paymentIcon: {
    fontSize: 16,
  },
  paymentText: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  paymentTextSelected: {
    color: "#080c14",
  },
  readerContainer: {
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    padding: 12,
    marginBottom: IPAD_THEME.spacing.md,
  },
  readerHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  readerHeaderTitle: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  scanBtn: {
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  scanBtnText: {
    color: IPAD_THEME.colors.accent,
    fontSize: 11,
    fontWeight: "700",
  },
  readerConnectedBox: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderColor: "rgba(34, 197, 94, 0.3)",
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
  },
  readerConnectedText: {
    color: "#4ade80",
    fontSize: 12,
  },
  readerSubText: {
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 2,
  },
  readerInlineActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  readerInlineBtn: {
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  readerInlineBtnText: {
    color: "#4ade80",
    fontSize: 11,
    fontWeight: "800",
  },
  readerDisconnectedBox: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderColor: "rgba(245, 158, 11, 0.25)",
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
  },
  readerDisconnectedText: {
    color: "#fcd34d",
    fontSize: 12,
  },
  discoveredList: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: IPAD_THEME.colors.borderSubtle,
  },
  discoveredListTitle: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
  },
  discoveredItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderRadius: 6,
    marginBottom: 4,
  },
  discoveredItemSelected: {
    borderWidth: 1,
    borderColor: "rgba(74, 222, 128, 0.55)",
    backgroundColor: "rgba(34, 197, 94, 0.12)",
  },
  discoveredItemText: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 12,
    fontWeight: "600",
  },
  connectActionText: {
    color: IPAD_THEME.colors.accent,
    fontSize: 11,
    fontWeight: "800",
  },
  completeBtn: {
    marginTop: IPAD_THEME.spacing.sm,
  },
  sellerHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sellerNameDisplay: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 2,
  },
  commissionPill: {
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.25)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: IPAD_THEME.radius.full,
  },
  commissionPillText: {
    color: "#38bdf8",
    fontSize: 11,
    fontWeight: "800",
  },
  tapToPayBox: {
    backgroundColor: "rgba(56, 189, 248, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.3)",
    borderRadius: IPAD_THEME.radius.md,
    padding: IPAD_THEME.spacing.md,
    marginBottom: IPAD_THEME.spacing.md,
  },
  tapToPayBoxTitle: {
    color: "#38bdf8",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
  },
  tapToPayBoxDesc: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  cardModeToggleRow: {
    flexDirection: "row",
    gap: IPAD_THEME.spacing.sm,
    marginBottom: IPAD_THEME.spacing.md,
  },
  cardModeBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: IPAD_THEME.radius.md,
    backgroundColor: IPAD_THEME.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: IPAD_THEME.colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  cardModeBtnActive: {
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    borderColor: "#38bdf8",
  },
  cardModeBtnText: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  cardModeBtnTextActive: {
    color: "#38bdf8",
    fontWeight: "900",
  },
  qrContainerBox: {
    backgroundColor: "rgba(56, 189, 248, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.25)",
    borderRadius: IPAD_THEME.radius.md,
    padding: IPAD_THEME.spacing.md,
  },
  qrBoxTitle: {
    color: "#38bdf8",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
  },
  qrBoxDesc: {
    color: IPAD_THEME.colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: IPAD_THEME.spacing.sm,
  },
  qrCenterContent: {
    alignItems: "center",
    paddingVertical: IPAD_THEME.spacing.sm,
  },
  qrImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    padding: 8,
  },
  qrScanPrompt: {
    color: IPAD_THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    marginTop: IPAD_THEME.spacing.sm,
    marginBottom: IPAD_THEME.spacing.md,
  },
  stripeLinkSuccess: {
    color: "#4ade80",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: IPAD_THEME.spacing.sm,
  },
  qrActionsRow: {
    flexDirection: "row",
    gap: IPAD_THEME.spacing.sm,
    width: "100%",
  },
  qrActionBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: IPAD_THEME.radius.md,
    backgroundColor: "rgba(56, 189, 248, 0.18)",
    borderWidth: 1,
    borderColor: "#38bdf8",
    alignItems: "center",
    justifyContent: "center",
  },
  qrActionBtnText: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: "800",
  },
  generateLinkBtn: {
    backgroundColor: "#38bdf8",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: IPAD_THEME.radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  generateLinkBtnText: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },
});
