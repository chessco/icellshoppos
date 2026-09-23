"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import CurrentOrgBadge from "@/components/CurrentOrgBadge";
import { formatCurrencyDisplay } from "@/lib/display-format";
import { printSaleReceipt, type SaleReceiptData } from "@/lib/sales-receipt";
import { buildReceiptText, buildWhatsAppWebShareUrl } from "@/lib/receipt-share";
import { fetchOrgLogoDataUrl } from "@/lib/org-logo";
import { DEFAULT_RECEIPT_CONFIG, type ReceiptConfig } from "@/lib/receipt-config";
import { useSubscriptionStatus } from "@/lib/useSubscriptionStatus";
import ToolUnavailableBanner from "@/components/ToolUnavailableBanner";
import {
  WHATSAPP_COUNTRY_CODES,
  buildWhatsappNumber,
  normalizeWhatsappDigits,
  parseWhatsappNumber,
} from "@/lib/whatsapp";

type InventoryItem = {
  id: string;
  imei: string | null;
  serialNumber: string | null;
  model: string;
  capacity: string;
  color: string;
  carrier: string | null;
  condition: string | null;
  costPesos: string | number | null;
  price: string | number | null;
  price2: string | number | null;
  price3: string | number | null;
  status: string;
};

type Customer = {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  customerType: "retail" | "wholesale";
  defaultPriceTier: string;
  status: string;
  creditEnabled: boolean;
};

type CartItem = {
  id: string;
  imei: string;
  model: string;
  capacity: string;
  color: string;
  costPesos: number;
  salePrice: number;
};

type PendingPurchaseOrderItem = {
  id?: string;
  imei?: string;
  model?: string;
  capacity?: string;
  color?: string;
  cost?: string | number;
  costPesos?: string | number;
  price?: string | number;
  salePrice?: string | number;
};

type PendingPurchaseOrder = {
  saleId?: string;
  customer?: string;
  customerName?: string;
  customerEmail?: string;
  whatsapp?: string;
  customerWhatsapp?: string;
  soldImeis?: string[];
  items?: PendingPurchaseOrderItem[];
};

type PriceTier = "Price" | "Price 2" | "Price 3";

type PaymentMethodName = "Cash" | "Transfer" | "Card" | "Trade-in" | "Other" | "Credit";

const allPaymentMethods: PaymentMethodName[] = ["Cash", "Transfer", "Card", "Trade-in", "Other", "Credit"];

const parseMoney = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeImei = (value: string | null | undefined) => (value ?? "").trim().replace(/\D/g, "");

const getItemIdentifier = (item: { imei?: string | null; serialNumber?: string | null; id?: string }) =>
  item.imei || item.serialNumber || item.id || "";

const money = (value: number) => formatCurrencyDisplay(Math.round(value));

const getTierPrice = (item: InventoryItem, tier: PriceTier) => {
  if (tier === "Price 2") return parseMoney(item.price2) || parseMoney(item.price);
  if (tier === "Price 3") return parseMoney(item.price3) || parseMoney(item.price);
  return parseMoney(item.price);
};

const buildSaleId = () => `S-${Date.now()}`;

const buildInitialPaymentAmounts = () =>
  Object.fromEntries(allPaymentMethods.map((method) => [method, ""])) as Record<PaymentMethodName, string>;

const buildPaymentLabel = (
  methods: PaymentMethodName[],
  amounts: Record<PaymentMethodName, string>,
  fallback: string
) => {
  const entries = methods
    .map((method) => ({ method, value: parseMoney(amounts[method]) }))
    .filter((entry) => entry.value > 0);

  if (entries.length === 0) return fallback;
  if (entries.length === 1) return entries[0].method;
  return entries.map((entry) => `${entry.method}: ${money(entry.value)}`).join(" | ");
};

export default function SalesPage() {
  const pathname = usePathname();
  const { isActive, loading: subLoading } = useSubscriptionStatus();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [customerTypeQuickFilter, setCustomerTypeQuickFilter] = useState<"all" | "retail" | "wholesale">("all");
  const [imeiBatchInput, setImeiBatchInput] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerWhatsappCountryCode, setCustomerWhatsappCountryCode] =
    useState<(typeof WHATSAPP_COUNTRY_CODES)[number]>("+52");
  const [customerWhatsappNumber, setCustomerWhatsappNumber] = useState("");
  const [sendReceiptEmail, setSendReceiptEmail] = useState(true);
  const [pendingPurchaseOrderSaleId, setPendingPurchaseOrderSaleId] = useState<string | null>(null);
  const [draftSaleId, setDraftSaleId] = useState<string | null>(null);
  const [pendingTradeInCheckoutSaleId, setPendingTradeInCheckoutSaleId] = useState<string | null>(null);
  const [tradeInSavedSaleId, setTradeInSavedSaleId] = useState<string | null>(null);
  // Ref tracks IMEI of trade-in device added to inventory; cleared on successful checkout.
  // Used to auto-delete the orphaned inventory item if the user leaves without completing the sale.
  const tradeInInventoryImeiRef = useRef<string | null>(null);
  const [paymentAmounts, setPaymentAmounts] = useState<Record<PaymentMethodName, string>>(buildInitialPaymentAmounts);
  const [soldBy, setSoldBy] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [canViewCostAndMargin, setCanViewCostAndMargin] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [lastCompletedSale, setLastCompletedSale] = useState<SaleReceiptData | null>(null);
  const [companyName, setCompanyName] = useState("Pro Buyer");
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined);
  const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig>(DEFAULT_RECEIPT_CONFIG);

  // Discount Authorization state
  type ActiveDiscountAuth = {
    id: string;
    status: "PENDING" | "APPROVED" | "PARTIAL" | "REJECTED" | "CANCELLED";
    requestedDiscount: number;
    approvedDiscount: number;
    reason: string;
    responseNote?: string | null;
  };
  const [activeDiscountAuth, setActiveDiscountAuth] = useState<ActiveDiscountAuth | null>(null);
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [requestedDiscountInput, setRequestedDiscountInput] = useState("");
  const [discountReasonInput, setDiscountReasonInput] = useState("");
  const [discountRequestBusy, setDiscountRequestBusy] = useState(false);
  const [canApproveDiscounts, setCanApproveDiscounts] = useState(false);

  const activeCustomers = useMemo(
    () => customers.filter((customer) => customer.status === "Active"),
    [customers]
  );

  const filteredCustomerOptions = useMemo(() => {
    if (customerTypeQuickFilter === "all") return activeCustomers;
    return activeCustomers.filter((customer) => customer.customerType === customerTypeQuickFilter);
  }, [activeCustomers, customerTypeQuickFilter]);

  const normalizeCustomerName = (value: string) => value.trim().toLowerCase();

  const selectedCustomer = useMemo(
    () =>
      activeCustomers.find(
        (customer) => normalizeCustomerName(customer.name) === normalizeCustomerName(customerName)
      ) ?? null,
    [activeCustomers, customerName]
  );

  const fullCustomerWhatsapp = useMemo(
    () => buildWhatsappNumber(customerWhatsappCountryCode, customerWhatsappNumber),
    [customerWhatsappCountryCode, customerWhatsappNumber]
  );
  const availablePaymentMethods = useMemo(
    () => (selectedCustomer?.creditEnabled ? allPaymentMethods : allPaymentMethods.filter((method) => method !== "Credit")),
    [selectedCustomer?.creditEnabled]
  );
  const tradeInAmount = useMemo(() => parseMoney(paymentAmounts["Trade-in"]), [paymentAmounts]);
  const activeSaleId = pendingPurchaseOrderSaleId || draftSaleId || "";
  const creditAmount = useMemo(() => parseMoney(paymentAmounts["Credit"]), [paymentAmounts]);

  const selectedTier: PriceTier =
    selectedCustomer?.defaultPriceTier === "Price 2" || selectedCustomer?.defaultPriceTier === "Price 3"
      ? (selectedCustomer.defaultPriceTier as PriceTier)
      : "Price";

  const applySelectedCustomer = (customer: Customer | null) => {
    if (!customer) return;

    setCustomerName(customer.name);
    setCustomerEmail(customer.email ?? "");

    if (customer.whatsapp) {
      const parsedWhatsapp = parseWhatsappNumber(customer.whatsapp);
      setCustomerWhatsappCountryCode(parsedWhatsapp.countryCode);
      setCustomerWhatsappNumber(parsedWhatsapp.localNumber);
      return;
    }

    setCustomerWhatsappCountryCode("+52");
    setCustomerWhatsappNumber("");
  };

  const handleCustomerNameChange = (value: string) => {
    setCustomerName(value);

    const matchedCustomer = activeCustomers.find(
      (customer) => normalizeCustomerName(customer.name) === normalizeCustomerName(value)
    );

    if (!matchedCustomer) {
      setCustomerEmail("");
      setCustomerWhatsappCountryCode("+52");
      setCustomerWhatsappNumber("");
      return;
    }

    applySelectedCustomer(matchedCustomer);
  };

  const loadData = async () => {
    try {
      setBusy(true);
      const [inventoryRes, customersRes, profileRes, authRes] = await Promise.all([
        fetch("/api/inventory?status=Available"),
        fetch("/api/customers"),
        fetch("/api/auth/user-profile"),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);

      if (inventoryRes.ok) {
        const inventoryData = await inventoryRes.json();
        setInventory((inventoryData.inventoryItems ?? []).filter((item: InventoryItem) => item.status === "Available"));
      }

      if (customersRes.ok) {
        const customerData = await customersRes.json();
        setCustomers(customerData.customers ?? []);
      }

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        const fullName = String(profileData?.user?.fullName ?? "").trim();
        if (fullName) {
          setSoldBy(fullName);
        }

        const organizationName = String(profileData?.organization?.name ?? "").trim();
        if (organizationName) {
          setCompanyName(organizationName);
        }
      }

      if (authRes.ok) {
        const authData = await authRes.json().catch(() => ({}));
        const isSuper = Boolean(authData?.session?.isSuperadmin);
        const role = authData?.role || authData?.session?.role;
        const hasPerm = authData?.permissions?.canViewCostAndMargin === true;
        const hasApprovePerm = authData?.permissions?.canApproveDiscounts === true;
        setCanViewCostAndMargin(isSuper || role === "superadmin" || role === "admin" || hasPerm);
        setCanApproveDiscounts(isSuper || role === "superadmin" || role === "admin" || hasApprovePerm);
      }

      setStatus(null);
    } catch {
      setStatus("Failed to load checkout data.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadData();
    fetchOrgLogoDataUrl().then(setLogoDataUrl).catch(() => setLogoDataUrl(undefined));
    fetch("/api/org/receipt-config", { cache: "no-store" })
      .then((response) => response.json().catch(() => ({})))
      .then((payload) => {
        const config = payload?.config as ReceiptConfig | undefined;
        if (config) {
          setReceiptConfig(config);
        }
      })
      .catch(() => setReceiptConfig(DEFAULT_RECEIPT_CONFIG));
  }, []);

  useEffect(() => {
    if (!activeDiscountAuth || activeDiscountAuth.status !== "PENDING") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/sales/authorizations/${activeDiscountAuth.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const updated = data.authorization;
        if (updated && updated.status !== "PENDING") {
          setActiveDiscountAuth({
            id: updated.id,
            status: updated.status,
            requestedDiscount: parseMoney(updated.requestedDiscount),
            approvedDiscount: parseMoney(updated.approvedDiscount),
            reason: updated.reason,
            responseNote: updated.responseNote,
          });
        }
      } catch {
        // silent
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [activeDiscountAuth]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const raw = window.localStorage.getItem("pending_purchase_order");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as PendingPurchaseOrder;
      const sourceItems = Array.isArray(parsed.items) ? parsed.items : [];

      const loadedItems: CartItem[] = sourceItems
        .map((item) => ({
          id: String(item.id ?? item.imei ?? "").trim(),
          imei: String(item.imei ?? "").trim(),
          model: String(item.model ?? "").trim(),
          capacity: String(item.capacity ?? "").trim(),
          color: String(item.color ?? "").trim(),
          costPesos: parseMoney(item.costPesos ?? item.cost ?? 0),
          salePrice: parseMoney(item.salePrice ?? item.price ?? 0),
        }))
        .filter((item) => item.id.length > 0);

      if (loadedItems.length > 0) {
        setCart(loadedItems);
        setPendingPurchaseOrderSaleId(typeof parsed.saleId === "string" && parsed.saleId.trim() ? parsed.saleId.trim() : null);

        const pendingCustomerName =
          typeof parsed.customer === "string" && parsed.customer.trim().length > 0
            ? parsed.customer.trim()
            : typeof parsed.customerName === "string"
            ? parsed.customerName.trim()
            : "";

        const pendingWhatsapp =
          typeof parsed.whatsapp === "string" && parsed.whatsapp.trim().length > 0
            ? parsed.whatsapp.trim()
            : typeof parsed.customerWhatsapp === "string"
            ? parsed.customerWhatsapp.trim()
            : "";

        const pendingEmail =
          typeof parsed.customerEmail === "string" && parsed.customerEmail.trim().length > 0
            ? parsed.customerEmail.trim()
            : "";

        const soldImeis = Array.isArray(parsed.soldImeis)
          ? parsed.soldImeis.map((item) => String(item).trim()).filter(Boolean)
          : [];

        if (pendingCustomerName) setCustomerName(pendingCustomerName);
        if (pendingEmail) setCustomerEmail(pendingEmail);
        if (pendingWhatsapp) {
          const parsedWhatsapp = parseWhatsappNumber(pendingWhatsapp);
          setCustomerWhatsappCountryCode(parsedWhatsapp.countryCode);
          setCustomerWhatsappNumber(parsedWhatsapp.localNumber);
        }

        const loadedMessage =
          `Loaded purchase order${parsed.saleId ? ` ${parsed.saleId}` : ""} with ${loadedItems.length} item${loadedItems.length > 1 ? "s" : ""} into cart.`;

        if (soldImeis.length > 0) {
          setStatus(
            `${loadedMessage} ${soldImeis.join(", ")} ${soldImeis.length === 1 ? "has" : "have"} been sold and cannot be added to cart.`
          );
        } else {
          setStatus(loadedMessage);
        }
      }
    } catch {
      setStatus("Could not load purchase order cart data.");
    } finally {
      window.localStorage.removeItem("pending_purchase_order");
    }
  }, []);

  useEffect(() => {
    if (!selectedCustomer?.email) return;
    setCustomerEmail(selectedCustomer.email);
  }, [selectedCustomer]);

  useEffect(() => {
    if (!selectedCustomer?.whatsapp) return;
    const parsedWhatsapp = parseWhatsappNumber(selectedCustomer.whatsapp);
    setCustomerWhatsappCountryCode(parsedWhatsapp.countryCode);
    setCustomerWhatsappNumber(parsedWhatsapp.localNumber);
  }, [selectedCustomer]);

  useEffect(() => {
    if (selectedCustomer?.creditEnabled) return;
    setPaymentAmounts((current) =>
      current["Credit"]
        ? {
            ...current,
            Credit: "",
          }
        : current
    );
  }, [selectedCustomer?.creditEnabled]);

  const getOrCreateSaleId = () => {
    if (pendingPurchaseOrderSaleId) return pendingPurchaseOrderSaleId;
    if (draftSaleId) return draftSaleId;
    const nextSaleId = buildSaleId();
    setDraftSaleId(nextSaleId);
    return nextSaleId;
  };

  const openTradeInPopup = (saleId: string) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams({
      popup: "trade-in",
      saleId,
      supplier: "Trade-in",
      costPesos: String(Math.round(tradeInAmount)),
      comments: `Trade-in received from sale ${saleId}`,
    });
    const popup = window.open(
      `/add-device?${params.toString()}`,
      "trade-in-inventory",
      "popup=yes,width=1500,height=980,resizable=yes,scrollbars=yes"
    );

    if (!popup) {
      setStatus("Popup blocked. Allow popups and try Add to Inventory Now again.");
      return;
    }

    popup.focus();
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleTradeInMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; saleId?: string; imei?: string } | null;
      if (!data || data.type !== "trade-in-inventory-saved" || !data.saleId) return;
      tradeInInventoryImeiRef.current = data.imei?.trim() || null;
      setTradeInSavedSaleId(data.saleId);
      setStatus(`Trade-in device saved for sale ${data.saleId}.`);
    };

    window.addEventListener("message", handleTradeInMessage);
    return () => window.removeEventListener("message", handleTradeInMessage);
  }, []);

  // Delete orphaned trade-in inventory item when user leaves without completing the sale.
  useEffect(() => {
    const deleteOrphanedTradeIn = () => {
      const imei = tradeInInventoryImeiRef.current;
      if (!imei) return;
      tradeInInventoryImeiRef.current = null;
      fetch("/api/inventory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imei, reason: "Trade-in abandoned — checkout not completed" }),
        keepalive: true,
      }).catch(() => {/* best-effort */});
    };

    window.addEventListener("beforeunload", deleteOrphanedTradeIn);
    return () => {
      window.removeEventListener("beforeunload", deleteOrphanedTradeIn);
      deleteOrphanedTradeIn(); // fires on SPA navigation (component unmount)
    };
  }, []);

  const cartItemIds = useMemo(() => new Set(cart.map((item) => item.id)), [cart]);

  const availableRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inventory
      .filter((item) => !cartItemIds.has(item.id))
      .filter((item) => {
        if (!q) return true;
        return [item.imei, item.serialNumber, item.model, item.capacity, item.color].join(" ").toLowerCase().includes(q);
      })
      .slice(0, 80);
  }, [inventory, cartItemIds, search]);

  const appliedDiscount = useMemo(() => {
    if (!activeDiscountAuth) return 0;
    if (activeDiscountAuth.status === "APPROVED" || activeDiscountAuth.status === "PARTIAL") {
      return activeDiscountAuth.approvedDiscount;
    }
    return 0;
  }, [activeDiscountAuth]);

  const totals = useMemo(() => {
    const cost = cart.reduce((sum, item) => sum + item.costPesos, 0);
    const subtotal = cart.reduce((sum, item) => sum + item.salePrice, 0);
    const discount = Math.min(appliedDiscount, subtotal);
    const sale = Math.max(0, subtotal - discount);
    return { cost, subtotal, discount, sale, margin: sale - cost };
  }, [cart, appliedDiscount]);

  const paidTotal = useMemo(
    () => availablePaymentMethods.reduce((sum, method) => sum + parseMoney(paymentAmounts[method]), 0),
    [availablePaymentMethods, paymentAmounts]
  );

  const remaining = totals.sale - paidTotal;
  const paymentMethodsWithAmount = useMemo(
    () => availablePaymentMethods.filter((method) => parseMoney(paymentAmounts[method]) > 0),
    [availablePaymentMethods, paymentAmounts]
  );
  const hasPaymentCoverage =
    totals.sale <= 0 ||
    (paymentMethodsWithAmount.length > 0 && Math.abs(remaining) <= 0.01);

  const paymentSummaryLabel = useMemo(() => {
    return buildPaymentLabel(availablePaymentMethods, paymentAmounts, "");
  }, [availablePaymentMethods, paymentAmounts]);

  const fillPaymentAmount = (method: PaymentMethodName) => {
    const outstanding = Math.max(totals.sale - availablePaymentMethods.reduce((sum, currentMethod) => {
      if (currentMethod === method) return sum;
      return sum + parseMoney(paymentAmounts[currentMethod]);
    }, 0), 0);

    setPaymentAmounts((current) => {
      const next = { ...current };
      if (paymentMethodsWithAmount.length === 0) {
        for (const currentMethod of availablePaymentMethods) {
          next[currentMethod] = currentMethod === method ? String(Math.round(totals.sale)) : "";
        }
      } else {
        next[method] = outstanding > 0 ? String(Math.round(outstanding)) : "";
      }
      return next;
    });
  };

  const getPaymentShortcutLabel = (method: PaymentMethodName) => {
    const otherMethodsHaveAmount = availablePaymentMethods.some(
      (currentMethod) => currentMethod !== method && parseMoney(paymentAmounts[currentMethod]) > 0
    );
    if (otherMethodsHaveAmount && remaining > 0.01) return "Remaining";
    return `100% ${method}`;
  };

  const handlePrintLastReceipt = () => {
    if (!lastCompletedSale) return;
    try {
      printSaleReceipt(lastCompletedSale);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not print receipt.");
    }
  };

  const handleShareLastReceiptWhatsapp = () => {
    if (!lastCompletedSale) return;
    if (!lastCompletedSale.customerWhatsapp?.trim()) {
      setStatus("Customer WhatsApp is missing for this receipt.");
      return;
    }

    const message = buildReceiptText(lastCompletedSale);
    const shareUrl = buildWhatsAppWebShareUrl(lastCompletedSale.customerWhatsapp, message);

    if (!shareUrl) {
      setStatus("Customer WhatsApp is invalid.");
      return;
    }

    if (typeof window !== "undefined") {
      window.open(shareUrl, "_blank", "noopener,noreferrer");
    }
  };

  const addToCart = (item: InventoryItem) => {
    if (cartItemIds.has(item.id)) return;
    if (activeDiscountAuth) {
      setActiveDiscountAuth(null);
      setStatus("La autorización de descuento se restableció al modificar los artículos del carrito.");
    }
    setCart((current) => [
      ...current,
      {
        id: item.id,
        imei: getItemIdentifier(item),
        model: item.model,
        capacity: item.capacity,
        color: item.color,
        costPesos: parseMoney(item.costPesos),
        salePrice: getTierPrice(item, selectedTier),
      },
    ]);
  };

  const handleSearchEnterAdd = () => {
    const raw = search.trim();
    if (!raw) return;

    const normalized = normalizeImei(raw);
    const lowered = raw.toLowerCase();
    const exactMatches = availableRows.filter((item) => {
      if (normalized && normalizeImei(item.imei) === normalized) return true;
      if (item.serialNumber && item.serialNumber.trim().toLowerCase() === lowered) return true;
      return getItemIdentifier(item).trim().toLowerCase() === lowered;
    });

    if (exactMatches.length === 0) {
      setStatus(`${raw} not available in inventory.`);
      return;
    }

    if (exactMatches.length > 1) {
      setStatus(`Multiple devices match ${raw}. Refine your search.`);
      return;
    }

    const item = exactMatches[0];
    addToCart(item);
    setStatus(`Added ${getItemIdentifier(item)} to cart.`);
    setSearch("");
  };

  const handleBatchAdd = () => {
    const lines = imeiBatchInput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      setStatus("Paste at least one IMEI (one per line).");
      return;
    }

    let added = 0;
    let missing = 0;
    let duplicates = 0;

    for (const line of lines) {
      const normalized = normalizeImei(line);
      if (!normalized) {
        missing += 1;
        continue;
      }
      if (cartItemIds.has(normalized)) {
        duplicates += 1;
        continue;
      }
      const row = inventory.find((item) => {
        if (item.status !== "Available") return false;
        if (normalizeImei(item.imei) === normalized) return true;
        if (item.serialNumber && item.serialNumber.trim().toLowerCase() === line.trim().toLowerCase()) return true;
        return false;
      });
      if (!row) {
        missing += 1;
        continue;
      }
      if (cartItemIds.has(row.id)) {
        duplicates += 1;
        continue;
      }
      addToCart(row);
      added += 1;
    }

    setStatus(`Batch add complete. Added: ${added}, Missing: ${missing}, Duplicates: ${duplicates}.`);
    setImeiBatchInput("");
  };

  const removeFromCart = (id: string) => {
    if (activeDiscountAuth) {
      setActiveDiscountAuth(null);
      setStatus("La autorización de descuento se restableció al modificar los artículos del carrito.");
    }
    setCart((current) => current.filter((item) => item.id !== id));
  };

  const updateCartPrice = (id: string, value: string) => {
    const parsed = parseMoney(value);
    if (activeDiscountAuth) {
      setActiveDiscountAuth(null);
      setStatus("La autorización de descuento se restableció al cambiar el precio de un artículo.");
    }
    setCart((current) =>
      current.map((item) => (item.id === id ? { ...item, salePrice: parsed } : item))
    );
  };

  const handleRequestDiscount = async () => {
    const requested = parseMoney(requestedDiscountInput);
    const reason = discountReasonInput.trim();

    if (cart.length === 0) {
      setStatus("Agrega al menos un equipo al carrito antes de solicitar descuento.");
      return;
    }
    if (requested <= 0) {
      setStatus("El monto de descuento debe ser mayor a 0.");
      return;
    }
    if (requested > totals.subtotal) {
      setStatus("El descuento solicitado no puede superar el subtotal de la venta.");
      return;
    }
    if (!reason) {
      setStatus("Debes ingresar un motivo para el descuento solicitado.");
      return;
    }

    try {
      setDiscountRequestBusy(true);
      const saleId = getOrCreateSaleId();

      const payload = {
        draftSaleId: saleId,
        requestedDiscount: requested,
        reason,
        customerName: customerName.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        customerWhatsapp: fullCustomerWhatsapp || undefined,
        items: cart.map((item) => ({
          inventoryItemId: item.id,
          salePrice: Math.round(item.salePrice),
        })),
      };

      const res = await fetch("/api/sales/authorizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || "Error al solicitar autorización de descuento.");
        return;
      }

      const created = data.authorization;
      setActiveDiscountAuth({
        id: created.id,
        status: created.status,
        requestedDiscount: parseMoney(created.requestedDiscount),
        approvedDiscount: parseMoney(created.approvedDiscount),
        reason: created.reason,
        responseNote: created.responseNote,
      });

      setDiscountModalOpen(false);
      setRequestedDiscountInput("");
      setDiscountReasonInput("");

      // Mostrar estado de la notificación WhatsApp al autorizador
      if (data.agentTriggered === true) {
        setStatus(`✅ Solicitud enviada. Notificación WhatsApp enviada al autorizador por ${money(requested)}. Esperando aprobación.`);
      } else if (data.agentError) {
        setStatus(`⚠️ Solicitud creada por ${money(requested)}, pero no se pudo notificar al autorizador por WhatsApp: ${data.agentError}. El autorizador puede revisar la solicitud manualmente.`);
      } else {
        setStatus(`Solicitud de autorización enviada por ${money(requested)}. Esperando aprobación del autorizador.`);
      }
    } catch {
      setStatus("Error de conexión al enviar la solicitud de autorización.");
    } finally {
      setDiscountRequestBusy(false);
    }
  };

  const checkAuthorizationStatus = async () => {
    if (!activeDiscountAuth) return;
    try {
      setBusy(true);
      const res = await fetch(`/api/sales/authorizations/${activeDiscountAuth.id}`, { cache: "no-store" });
      if (!res.ok) {
        setStatus("No se pudo consultar el estado de la autorización.");
        return;
      }
      const data = await res.json();
      const updated = data.authorization;
      if (updated) {
        setActiveDiscountAuth({
          id: updated.id,
          status: updated.status,
          requestedDiscount: parseMoney(updated.requestedDiscount),
          approvedDiscount: parseMoney(updated.approvedDiscount),
          reason: updated.reason,
          responseNote: updated.responseNote,
        });
        if (updated.status === "APPROVED") {
          setStatus(`¡Descuento aprobado! Monto autorizado: ${money(parseMoney(updated.approvedDiscount))}.`);
        } else if (updated.status === "PARTIAL") {
          setStatus(`¡Aprobación parcial! Monto autorizado: ${money(parseMoney(updated.approvedDiscount))}.`);
        } else if (updated.status === "REJECTED") {
          setStatus(`El descuento solicitado fue rechazado ($0 autorizado). Motivo: ${updated.responseNote || "Sin nota"}.`);
        } else if (updated.status === "PENDING") {
          setStatus("La autorización aún se encuentra pendiente de revisión por el autorizador.");
        }
      }
    } catch {
      setStatus("Error de conexión al consultar estado.");
    } finally {
      setBusy(false);
    }
  };

  const submitCheckout = async (saleId: string) => {
    if (cart.length === 0) {
      setStatus("Add at least one device to cart.");
      return;
    }

    if (activeDiscountAuth && activeDiscountAuth.status === "PENDING") {
      setStatus("No se puede finalizar la venta mientras la autorización de descuento siga pendiente.");
      return;
    }

    if (!customerName.trim()) {
      setStatus("Customer name is required.");
      return;
    }

    if (!fullCustomerWhatsapp) {
      setStatus("Customer WhatsApp is required with country code and 10-digit number.");
      return;
    }

    if (!paymentSummaryLabel || !hasPaymentCoverage) {
      setStatus("Payment amounts must fully cover the total sale amount.");
      return;
    }

    const payload = {
      saleId,
      customerName: customerName.trim() || undefined,
      customerEmail: customerEmail.trim().toLowerCase() || undefined,
      customerWhatsapp: fullCustomerWhatsapp,
      sendReceiptEmail,
      paymentMethod: paymentSummaryLabel,
      paymentBreakdown: Object.fromEntries(
        allPaymentMethods
          .map((method) => [method, parseMoney(paymentAmounts[method])] as const)
          .filter(([, amount]) => amount > 0)
      ),
      notes: notes.trim() || undefined,
      authorizationId:
        activeDiscountAuth && (activeDiscountAuth.status === "APPROVED" || activeDiscountAuth.status === "PARTIAL")
          ? activeDiscountAuth.id
          : undefined,
      discount: totals.discount,
      items: cart.map((item) => ({
        inventoryItemId: item.id,
        imei: item.imei,
        salePrice: Math.round(item.salePrice),
      })),
    };

    const receiptSnapshot: SaleReceiptData = {
      companyName,
      saleId: payload.saleId,
      soldAt: new Date().toISOString(),
      customerName: customerName.trim() || undefined,
      customerWhatsapp: fullCustomerWhatsapp,
      customerEmail: customerEmail.trim().toLowerCase() || undefined,
      paymentMethod: paymentSummaryLabel,
      soldBy: soldBy.trim() || undefined,
      notes: notes.trim() || undefined,
      logoDataUrl,
      receiptConfig,
      items: cart.map((item) => ({
        imei: item.imei,
        model: item.model,
        capacity: item.capacity,
        color: item.color,
        salePrice: Math.round(item.salePrice),
      })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      total: totals.sale,
    };

    try {
      setBusy(true);
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus(data.error ?? "Failed to complete checkout.");
        return;
      }

      receiptSnapshot.saleId = data.saleId ?? receiptSnapshot.saleId;
      setLastCompletedSale(receiptSnapshot);
      setCart([]);
      setActiveDiscountAuth(null);
      setNotes("");
      setCustomerName("");
      setCustomerEmail("");
      setCustomerWhatsappCountryCode("+52");
      setCustomerWhatsappNumber("");
      setSendReceiptEmail(true);
      setPendingPurchaseOrderSaleId(null);
      setDraftSaleId(null);
      setPendingTradeInCheckoutSaleId(null);
      setTradeInSavedSaleId(null);
      tradeInInventoryImeiRef.current = null;
      setPaymentAmounts(buildInitialPaymentAmounts());
      setImeiBatchInput("");
      await loadData();
      setStatus(`Sale completed successfully: ${receiptSnapshot.saleId}. Inventory items were marked as Sold.`);
    } catch {
      setStatus("Failed to complete checkout.");
    } finally {
      setBusy(false);
    }
  };

  const handleCheckout = async () => {
    const saleId = getOrCreateSaleId();

    if (tradeInAmount > 0 && tradeInSavedSaleId !== saleId) {
      setPendingTradeInCheckoutSaleId(saleId);
      openTradeInPopup(saleId);
      setStatus("Add the trade-in device in the popup to continue checkout automatically.");
      return;
    }

    await submitCheckout(saleId);
  };

  useEffect(() => {
    if (!pendingTradeInCheckoutSaleId || tradeInSavedSaleId !== pendingTradeInCheckoutSaleId) {
      return;
    }

    void submitCheckout(pendingTradeInCheckoutSaleId);
  }, [pendingTradeInCheckoutSaleId, tradeInSavedSaleId]);

  if (!subLoading && isActive === false) {
    return (
      <div className="app-shell">
        <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-4 py-3 backdrop-blur md:px-6">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 text-sm text-[#5c4332]">
            <CurrentOrgBadge />
          </div>
        </nav>
        <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
          <AppSidebar pathname={pathname} />
          <main className="flex min-w-0 flex-col gap-5 px-4 py-6 md:gap-6 md:px-6 md:py-10">
            <ToolUnavailableBanner toolName="Sales Checkout" />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 text-sm text-[#5c4332]">
          <CurrentOrgBadge />
        </div>
      </nav>

      <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-5 px-4 py-6 md:gap-6 md:px-6 md:py-10">
          <header>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-[#1f1a16] md:text-3xl">Sales Checkout</h1>
                <p className="text-sm text-[#6a4d3a]">Database-native checkout flow with batch IMEI and split payments.</p>
              </div>
              <a
                href="/sales/history"
                className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-semibold text-[#3b2a1e]"
              >
                View Sales History
              </a>
            </div>
          </header>

          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-3 md:p-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <input
                id="customer-name-input"
                value={customerName}
                onChange={(event) => handleCustomerNameChange(event.target.value)}
                list="customer-list"
                placeholder="Customer name *"
                required
                className={`rounded-xl border bg-[#fffaf3] px-3 py-2 text-sm outline-none focus:border-[#1f1a16] ${
                  cart.length > 0 && !customerName.trim()
                    ? "border-amber-500 ring-2 ring-amber-200"
                    : "border-[#e6d6c6]"
                }`}
              />
              <select
                value={customerTypeQuickFilter}
                onChange={(event) =>
                  setCustomerTypeQuickFilter(event.target.value as "all" | "retail" | "wholesale")
                }
                className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 text-sm outline-none focus:border-[#1f1a16]"
              >
                <option value="all">All customer types</option>
                <option value="retail">Retail only</option>
                <option value="wholesale">Wholesale only</option>
              </select>
              <datalist id="customer-list">
                {filteredCustomerOptions.map((customer) => (
                  <option key={customer.id} value={customer.name} />
                ))}
              </datalist>
              <input
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="Customer Email (optional)"
                className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 text-sm outline-none focus:border-[#1f1a16]"
              />
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <select
                  value={customerWhatsappCountryCode}
                  onChange={(event) =>
                    setCustomerWhatsappCountryCode(
                      event.target.value as (typeof WHATSAPP_COUNTRY_CODES)[number]
                    )
                  }
                  className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-2 py-2 text-sm outline-none focus:border-[#1f1a16]"
                  required
                >
                  {WHATSAPP_COUNTRY_CODES.map((countryCode) => (
                    <option key={countryCode} value={countryCode}>
                      {countryCode}
                    </option>
                  ))}
                </select>
                <input
                  id="customer-whatsapp-input"
                  value={customerWhatsappNumber}
                  onChange={(event) => setCustomerWhatsappNumber(normalizeWhatsappDigits(event.target.value))}
                  placeholder="WhatsApp 10 digits *"
                  inputMode="numeric"
                  maxLength={10}
                  required
                  className={`rounded-xl border bg-[#fffaf3] px-3 py-2 text-sm outline-none focus:border-[#1f1a16] ${
                    cart.length > 0 && !fullCustomerWhatsapp
                      ? "border-amber-500 ring-2 ring-amber-200"
                      : "border-[#e6d6c6]"
                  }`}
                />
              </div>
              <input
                value={soldBy}
                readOnly
                placeholder="Sold by"
                className="rounded-xl border border-[#e6d6c6] bg-[#f3eee6] px-3 py-2 text-sm text-[#6a4d3a] outline-none"
              />
            </div>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              placeholder="Notes"
              className="mt-3 w-full rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 text-sm outline-none focus:border-[#1f1a16]"
            />
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-[#3b2a1e]">
              <input
                type="checkbox"
                checked={sendReceiptEmail}
                onChange={(event) => setSendReceiptEmail(event.target.checked)}
                className="h-4 w-4"
              />
              Send receipt email to customer
            </label>
          </section>

          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-3 md:p-4">
            <h2 className="text-lg font-semibold text-[#1f1a16]">Advanced POS Tools</h2>
            <div className="mt-3 grid gap-3">
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6a4d3a]">Batch IMEI Add (One Per Line)</label>
                <textarea
                  value={imeiBatchInput}
                  onChange={(event) => setImeiBatchInput(event.target.value)}
                  rows={4}
                  placeholder="352099001111111&#10;352099001111112"
                  className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 text-sm outline-none focus:border-[#1f1a16]"
                />
                <div>
                  <button
                    type="button"
                    onClick={handleBatchAdd}
                    className="rounded-full border border-[#d6c1ad] px-4 py-2 text-xs font-semibold text-[#3b2a1e]"
                  >
                    Add Batch
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-[#e6d6c6] bg-white p-3 md:p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="text-lg font-semibold text-[#1f1a16]">Available Devices</h2>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleSearchEnterAdd();
                    }
                  }}
                  placeholder="Search Available Inventory"
                  className="w-full rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 text-sm outline-none focus:border-[#1f1a16] md:max-w-sm"
                />
              </div>
              <div className="mobile-scroll mt-3 max-h-[55vh] overflow-auto">
                <table className="min-w-[620px] text-left text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-[#ead8c6] text-[#6a4d3a]">
                      <th className="px-2 py-2">IMEI</th>
                      <th className="px-2 py-2">Model</th>
                      <th className="px-2 py-2">Tier</th>
                      <th className="px-2 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableRows.map((item) => (
                      <tr key={item.id} className="border-b border-[#f1e4d6]">
                        <td className="px-2 py-2">{getItemIdentifier(item)}</td>
                        <td className="px-2 py-2">{item.model} {item.capacity} {item.color}</td>
                        <td className="px-2 py-2">{money(getTierPrice(item, selectedTier))}</td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => addToCart(item)}
                            className="rounded-full border border-[#d6c1ad] px-3 py-1 text-xs font-semibold text-[#3b2a1e]"
                          >
                            Add
                          </button>
                        </td>
                      </tr>
                    ))}
                    {availableRows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-2 py-4 text-center text-[#6a4d3a]">No matching inventory.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-[#e6d6c6] bg-white p-3 md:p-4">
              <h2 className="text-lg font-semibold text-[#1f1a16]">Cart ({cart.length})</h2>
              <div className="mobile-scroll mt-3 max-h-[55vh] overflow-auto">
                <table className="min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-[#ead8c6] text-[#6a4d3a]">
                      <th className="px-2 py-2">IMEI / SN</th>
                      <th className="px-2 py-2">Device</th>
                      {canViewCostAndMargin && <th className="px-2 py-2">Cost</th>}
                      <th className="px-2 py-2">Sale</th>
                      <th className="px-2 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item) => (
                      <tr key={item.id} className="border-b border-[#f1e4d6]">
                        <td className="px-2 py-2">{item.imei}</td>
                        <td className="px-2 py-2">{item.model} {item.capacity} {item.color}</td>
                        {canViewCostAndMargin && <td className="px-2 py-2">{money(item.costPesos)}</td>}
                        <td className="px-2 py-2">
                          <input
                            value={item.salePrice ? String(Math.round(item.salePrice)) : ""}
                            onChange={(event) => updateCartPrice(item.id, event.target.value)}
                            className="w-24 rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 outline-none"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.id)}
                            className="rounded-full border border-[#c24d34] px-3 py-1 text-xs font-semibold text-[#c24d34]"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                    {cart.length === 0 && (
                      <tr>
                        <td colSpan={canViewCostAndMargin ? 5 : 4} className="px-2 py-4 text-center text-[#6a4d3a]">Cart is empty.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid gap-1 text-sm text-[#3b2a1e]">
                {canViewCostAndMargin && <div>Cost: <span className="font-semibold">{money(totals.cost)}</span></div>}
                <div>Subtotal: <span className="font-semibold">{money(totals.subtotal)}</span></div>
                {totals.discount > 0 && (
                  <div className="text-emerald-700 font-medium">
                    Descuento autorizado: <span className="font-bold">-{money(totals.discount)}</span>
                  </div>
                )}
                <div>Total: <span className="font-bold text-base text-[#1f1a16]">{money(totals.sale)}</span></div>
                {canViewCostAndMargin && (
                  <div>
                    Margin: <span className={`font-semibold ${totals.margin < 0 ? "text-red-700" : ""}`}>{money(totals.margin)}</span>
                    {totals.sale > 0 && (
                      <span className="text-xs text-[#6a4d3a] ml-1">
                        ({Math.round((totals.margin / totals.sale) * 100)}%)
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Discount Authorization Block */}
              <div className="mt-4 rounded-xl border border-[#ead8c6] bg-[#fffaf3] p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold uppercase tracking-wider text-[#6a4d3a]">
                    Autorización de Descuento
                  </span>
                  {!activeDiscountAuth && (
                    <button
                      type="button"
                      disabled={cart.length === 0}
                      onClick={() => {
                        setRequestedDiscountInput("");
                        setDiscountReasonInput("");
                        setDiscountModalOpen(true);
                      }}
                      className="rounded-full border border-[#d6c1ad] bg-white px-3 py-1 font-semibold text-[#3b2a1e] hover:bg-[#f5e4d5] disabled:opacity-50"
                    >
                      Solicitar Descuento...
                    </button>
                  )}
                </div>

                {activeDiscountAuth && (
                  <div className="mt-2.5 space-y-2">
                    {activeDiscountAuth.status === "PENDING" && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-amber-900">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-800">
                            DESCUENTO SOLICITADO: {money(activeDiscountAuth.requestedDiscount)}
                          </span>
                          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                            PENDIENTE DE AUTORIZACIÓN
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-amber-800">
                          Motivo: &quot;{activeDiscountAuth.reason}&quot;
                        </p>
                        <p className="text-[11px] text-amber-700 italic">
                          Esperando que un administrador revise y autorice la solicitud. El cobro está bloqueado hasta obtener respuesta.
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={checkAuthorizationStatus}
                            className="rounded-full border border-amber-400 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100"
                          >
                            ↻ Comprobar Estado
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm("¿Cancelar esta solicitud de descuento?")) {
                                setActiveDiscountAuth(null);
                              }
                            }}
                            className="rounded-full px-2.5 py-1 text-[11px] text-red-700 hover:underline"
                          >
                            Cancelar Solicitud
                          </button>
                        </div>
                      </div>
                    )}

                    {activeDiscountAuth.status === "APPROVED" && (
                      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-emerald-900">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-emerald-800">
                            DESCUENTO AUTORIZADO: {money(activeDiscountAuth.approvedDiscount)}
                          </span>
                          <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                            APROBADO
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-emerald-800">
                          Descuento aplicado en el total: {money(activeDiscountAuth.approvedDiscount)}.
                        </p>
                        <button
                          type="button"
                          onClick={() => setActiveDiscountAuth(null)}
                          className="mt-1 text-[11px] text-emerald-700 hover:underline"
                        >
                          Quitar Descuento
                        </button>
                      </div>
                    )}

                    {activeDiscountAuth.status === "PARTIAL" && (
                      <div className="rounded-lg border border-blue-300 bg-blue-50 p-2.5 text-blue-900">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-blue-800">
                            DESCUENTO AUTORIZADO: {money(activeDiscountAuth.approvedDiscount)}
                          </span>
                          <span className="rounded-full bg-blue-200 px-2 py-0.5 text-[10px] font-bold text-blue-900">
                            APROBACIÓN PARCIAL
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-blue-800">
                          Monto solicitado original: {money(activeDiscountAuth.requestedDiscount)}. El autorizador aprobó {money(activeDiscountAuth.approvedDiscount)}.
                        </p>
                        {activeDiscountAuth.responseNote && (
                          <p className="text-[11px] text-blue-700 italic">
                            Nota del autorizador: &quot;{activeDiscountAuth.responseNote}&quot;
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => setActiveDiscountAuth(null)}
                          className="mt-1 text-[11px] text-blue-700 hover:underline"
                        >
                          Quitar Descuento
                        </button>
                      </div>
                    )}

                    {activeDiscountAuth.status === "REJECTED" && (
                      <div className="rounded-lg border border-red-300 bg-red-50 p-2.5 text-red-900">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-red-800">
                            DESCUENTO AUTORIZADO: $0
                          </span>
                          <span className="rounded-full bg-red-200 px-2 py-0.5 text-[10px] font-bold text-red-900">
                            RECHAZADO
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-red-800">
                          La solicitud de descuento de {money(activeDiscountAuth.requestedDiscount)} fue rechazada por el autorizador.
                        </p>
                        {activeDiscountAuth.responseNote && (
                          <p className="text-[11px] text-red-700 italic">
                            Motivo del rechazo: &quot;{activeDiscountAuth.responseNote}&quot;
                          </p>
                        )}
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveDiscountAuth(null);
                              setRequestedDiscountInput("");
                              setDiscountReasonInput("");
                              setDiscountModalOpen(true);
                            }}
                            className="rounded-full border border-red-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-800"
                          >
                            Nueva Solicitud...
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveDiscountAuth(null)}
                            className="rounded-full px-2.5 py-1 text-[11px] text-gray-600 hover:underline"
                          >
                            Continuar sin Descuento
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6a4d3a]">Split Payment Breakdown (Optional)</p>

                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {availablePaymentMethods.map((method) => (
                    <label key={method} className="grid gap-1 text-xs text-[#5c4332]">
                      {method}
                      <div className="flex gap-2">
                        <input
                          value={paymentAmounts[method]}
                          onChange={(event) =>
                            setPaymentAmounts((prev) => ({
                              ...prev,
                              [method]: event.target.value,
                            }))
                          }
                          placeholder="0"
                          className="min-w-0 flex-1 rounded-lg border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 outline-none focus:border-[#1f1a16]"
                        />
                        <button
                          type="button"
                          onClick={() => fillPaymentAmount(method)}
                          className="rounded-lg border border-[#d6c1ad] px-2 py-1 text-[11px] font-semibold text-[#3b2a1e]"
                        >
                          {getPaymentShortcutLabel(method)}
                        </button>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="text-xs text-[#5c4332]">
                  Paid: <span className="font-semibold">{money(paidTotal)}</span> | Remaining: <span className={`font-semibold ${remaining < -0.01 ? "text-[#c24d34]" : ""}`}>{money(Math.max(remaining, 0))}</span>
                </div>
                <div className="text-xs text-[#5c4332]">
                  Payment method used: <span className="font-semibold">{paymentSummaryLabel || "Not set"}</span>
                </div>
                {!hasPaymentCoverage && (
                  <div className="text-xs font-semibold text-[#c24d34]">
                    Payment amounts must fully cover the sale total before checkout.
                  </div>
                )}

                  {creditAmount > 0 && selectedCustomer?.creditEnabled && (
                    <div className="rounded-xl border border-[#ead8c6] bg-[#fffaf3] px-3 py-2 text-xs text-[#7a4e0e]">
                      Credit portion: <span className="font-bold">{money(creditAmount)}</span> will be added to {selectedCustomer.name}&apos;s outstanding balance.
                    </div>
                  )}

                  {tradeInAmount > 0 && (
                    <div className="rounded-xl border border-[#d6c1ad] bg-[#fff6ea] px-3 py-3 text-sm text-[#5c4332]">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#3b2a1e]">Trade-in captured: {money(tradeInAmount)}</p>
                          <p className="text-xs text-[#6a4d3a]">
                            Add the received device to inventory with supplier <span className="font-semibold">Trade-in</span> and comments linked to sale {activeSaleId || "(generated on save)"}.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openTradeInPopup(getOrCreateSaleId())}
                          className="rounded-full border border-[#d6c1ad] px-4 py-2 text-xs font-semibold text-[#3b2a1e] hover:bg-[#f5e4d5]"
                        >
                          Add to Inventory Now
                        </button>
                      </div>
                      {tradeInSavedSaleId === activeSaleId && activeSaleId && (
                        <p className="mt-2 text-xs font-semibold text-[#1a5c30]">
                          Trade-in device already saved for this sale.
                        </p>
                      )}
                    </div>
                  )}
              </div>

              {cart.length > 0 && (!customerName.trim() || !fullCustomerWhatsapp || !hasPaymentCoverage || activeDiscountAuth?.status === "PENDING") && (
                <div className="mt-4 space-y-2 rounded-2xl border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-900 shadow-sm">
                  <p className="font-semibold text-amber-950 flex items-center gap-1.5 text-sm">
                    <span>⚠️</span> Datos requeridos para completar la venta:
                  </p>
                  
                  {!customerName.trim() && (
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-white/80 p-2 border border-amber-200">
                      <span>• <strong>Nombre del Cliente</strong> es obligatorio.</span>
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById("customer-name-input");
                          el?.focus();
                          el?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                        className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
                      >
                        Llenar Nombre ↑
                      </button>
                    </div>
                  )}

                  {!fullCustomerWhatsapp && (
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-white/80 p-2 border border-amber-200">
                      <span>• <strong>WhatsApp (10 dígitos)</strong> es obligatorio para generar el recibo.</span>
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById("customer-whatsapp-input");
                          el?.focus();
                          el?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                        className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
                      >
                        Llenar WhatsApp ↑
                      </button>
                    </div>
                  )}

                  {!hasPaymentCoverage && (
                    <div className="rounded-xl bg-white/80 p-2 border border-amber-200 text-amber-900">
                      • Falta cubrir el saldo de la venta (Restante: <strong>{money(Math.max(0, remaining))}</strong>).
                    </div>
                  )}

                  {activeDiscountAuth?.status === "PENDING" && (
                    <div className="rounded-xl bg-white/80 p-2 border border-amber-200 text-amber-900">
                      • Esperando que el administrador apruebe o rechace la solicitud de descuento por WhatsApp.
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={handleCheckout}
                disabled={
                  busy ||
                  cart.length === 0 ||
                  !customerName.trim() ||
                  !fullCustomerWhatsapp ||
                  !hasPaymentCoverage ||
                  activeDiscountAuth?.status === "PENDING"
                }
                className="mt-4 rounded-full bg-[#1f1a16] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {activeDiscountAuth?.status === "PENDING"
                  ? "Esperando Autorización de Descuento..."
                  : busy
                  ? "Processing..."
                  : "Complete Checkout"}
              </button>

              {lastCompletedSale && (
                <div className="mt-4 rounded-2xl border border-[#d5f0dc] bg-[#f3fff6] p-4 text-sm text-[#215732]">
                  <p className="font-semibold">Sale completed: {lastCompletedSale.saleId}</p>
                  <p className="mt-1">Receipt ready. You can print it now or review the transaction in Sales History.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handlePrintLastReceipt}
                      className="rounded-full border border-[#6bb983] px-4 py-2 text-sm font-semibold text-[#215732]"
                    >
                      Print Receipt
                    </button>
                    <button
                      type="button"
                      onClick={handleShareLastReceiptWhatsapp}
                      className="rounded-full border border-[#6bb983] px-4 py-2 text-sm font-semibold text-[#215732]"
                    >
                      Send via WhatsApp
                    </button>
                    <a
                      href="/sales/history"
                      className="rounded-full border border-[#6bb983] px-4 py-2 text-sm font-semibold text-[#215732]"
                    >
                      Open Sales History
                    </a>
                  </div>
                </div>
              )}
            </section>
          </div>

          {status && (
            <div className="rounded-2xl border border-[#e6d6c6] bg-[#fff6ea] px-4 py-3 text-sm text-[#5c4332]">
              {status}
            </div>
          )}

          {/* Modal Solicitar Descuento */}
          {discountModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                <h3 className="text-lg font-bold text-[#1f1a16]">Solicitar Descuento de Venta</h3>
                <p className="mt-1 text-xs text-[#6a4d3a]">
                  Subtotal actual: <span className="font-semibold text-[#1f1a16]">{money(totals.subtotal)}</span> ({cart.length} equipo{cart.length > 1 ? "s" : ""})
                </p>

                <div className="mt-4">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#6a4d3a]">
                    Monto de Descuento Solicitado ($ MXN) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={totals.subtotal}
                    value={requestedDiscountInput}
                    onChange={(e) => setRequestedDiscountInput(e.target.value)}
                    placeholder="Ej. 600"
                    className="mt-1 w-full rounded-xl border border-[#d6c1ad] bg-[#fffaf3] px-3 py-2 text-base font-bold outline-none focus:border-[#1f1a16]"
                  />
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#6a4d3a]">
                    Motivo del Descuento *
                  </label>
                  <textarea
                    rows={3}
                    value={discountReasonInput}
                    onChange={(e) => setDiscountReasonInput(e.target.value)}
                    placeholder="Ej. Paquete de compra por 2 dispositivos, pago en efectivo..."
                    className="mt-1 w-full rounded-xl border border-[#d6c1ad] bg-[#fffaf3] px-3 py-2 text-xs outline-none focus:border-[#1f1a16]"
                  />
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setDiscountModalOpen(false)}
                    className="rounded-full border border-[#d6c1ad] px-4 py-2 text-xs font-semibold text-[#5c4332]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleRequestDiscount}
                    disabled={discountRequestBusy || !requestedDiscountInput || !discountReasonInput.trim()}
                    className="rounded-full bg-[#1f1a16] px-5 py-2 text-xs font-bold text-white hover:bg-[#3b2a1e] disabled:opacity-50"
                  >
                    {discountRequestBusy ? "Enviando..." : "Enviar a Autorización"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

