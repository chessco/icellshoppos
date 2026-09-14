"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { useT } from "@/components/LocaleProvider";
import { formatCurrencyDisplay } from "@/lib/display-format";
import { formatWhatsappForDisplay } from "@/lib/whatsapp";

interface PurchaseOrderItem {
  imei: string;
  model: string;
  capacity: string;
  color: string;
  cost: number;
  price: number;
  tierName?: string;
  tierPriceMxn?: number;
  offerAmountRaw?: string | null;
  offerCurrency?: "MXN" | "USD";
  offerAmountMxn?: number | null;
  effectiveOfferMxn?: number;
  differenceMxn?: number;
  offerAccepted?: boolean;
  isSold?: boolean;
}

interface PurchaseOrder {
  requestId: string;
  saleId: string;
  customer: string;
  customerEmail: string;
  whatsapp: string;
  createdAt: string;
  status: string;
  offersEnabled?: boolean;
  allOffersAccepted?: boolean;
  items: PurchaseOrderItem[];
}

const normalizePurchaseOrderStatus = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === "completed" || normalized === "fulfilled") return "Completed";
  if (normalized === "expired") return "Expired";
  if (normalized === "deleted" || normalized === "cancelled") return "Deleted";
  return "Pending";
};

export default function PurchaseOrdersPage() {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [acceptingKeys, setAcceptingKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchPurchaseOrders();
  }, [statusFilter]);

  const fetchPurchaseOrders = async () => {
    try {
      setLoading(true);
      setStatus(null);

      const response = await fetch(`/api/purchase-orders?status=${encodeURIComponent(statusFilter)}`);

      if (!response.ok) {
        let errorMessage = `Failed to load purchase orders (${response.status})`;
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const errorData = await response
            .json()
            .catch(() => ({ error: "Unknown error" }));
          if (errorData?.error) {
            errorMessage = errorData.error;
          }
        } else {
          const errorText = await response.text().catch(() => "");
          if (errorText) {
            errorMessage = errorText;
          }
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setOrders(data.orders || []);
      const label = statusFilter === "pending" ? "pending" : statusFilter;
      setStatus(`Loaded ${data.orders?.length || 0} ${label} purchase orders.`);
    } catch (err) {
      console.error("Error fetching purchase orders:", err);
      setStatus(err instanceof Error ? err.message : "Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCart = (order: PurchaseOrder) => {
    if (normalizePurchaseOrderStatus(order.status) !== "Pending") return;
    if (order.offersEnabled && !order.allOffersAccepted) {
      setStatus(t("purchaseOrders.acceptOfferFirst", "Accept each offer item before creating cart."));
      return;
    }

    const soldItems = order.items.filter((item) => item.isSold);
    const availableItems = order.items.filter((item) => !item.isSold);

    if (availableItems.length === 0) {
      setStatus(
        `Purchase request ${order.saleId} expired automatically because all IMEIs were already sold.`
      );
      void fetchPurchaseOrders();
      return;
    }

    // Store the purchase order items in localStorage for the sales page to pick up
    const cartData = {
      requestId: order.requestId,
      saleId: order.saleId,
      customer: order.customer,
      customerEmail: order.customerEmail,
      whatsapp: order.whatsapp,
      soldImeis: soldItems.map((item) => item.imei),
      items: availableItems.map((item) => ({
        ...item,
        costPesos: String(item.cost ?? 0),
        salePrice: String(
          order.offersEnabled
            ? Number(item.effectiveOfferMxn ?? item.price ?? 0)
            : Number(item.price ?? 0)
        ),
        price: String(item.price ?? 0),
      })),
    };

    console.log("Storing purchase order in localStorage:", cartData);
    console.log("Items with prices:", order.items.map(item => ({
      imei: item.imei,
      model: item.model,
      price: item.price,
      cost: item.cost
    })));

    localStorage.setItem("pending_purchase_order", JSON.stringify(cartData));
    
    // Redirect to sales page where cart will be loaded
    router.push("/sales");
  };

  const handleAcceptItem = async (order: PurchaseOrder, item: PurchaseOrderItem) => {
    if (!order.offersEnabled) return;
    const key = `${order.requestId}-${item.imei}`;

    setAcceptingKeys((prev) => new Set(prev).add(key));
    try {
      const response = await fetch("/api/purchase-orders/accept-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: order.requestId, imei: item.imei }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to accept item offer.");
      }

      setOrders((prev) =>
        prev.map((candidate) => {
          if (candidate.requestId !== order.requestId) return candidate;

          const nextItems = candidate.items.map((candidateItem) =>
            candidateItem.imei === item.imei
              ? { ...candidateItem, offerAccepted: true }
              : candidateItem
          );

          const allAccepted = nextItems.every((candidateItem) => candidateItem.offerAccepted);

          return {
            ...candidate,
            items: nextItems,
            allOffersAccepted: allAccepted,
          };
        })
      );

      setStatus(`Accepted offer for IMEI ${item.imei}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to accept item offer.");
    } finally {
      setAcceptingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleCancelOrder = async (order: PurchaseOrder) => {
    const confirmed = window.confirm(
      `Delete purchase order ${order.saleId}?\n\nCustomer: ${order.customer}\nItems: ${order.items.length}\n\nThis will remove it from Pending and keep it in history as Deleted.`
    );

    if (!confirmed) return;

    try {
      setStatus("Cancelling order...");

      const response = await fetch("/api/cancel-purchase-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ saleId: order.saleId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to cancel order");
      }

      // Remove from local state
      setOrders((prevOrders) => prevOrders.filter((o) => o.saleId !== order.saleId));
      setStatus(`Successfully deleted order ${order.saleId}`);
    } catch (err) {
      console.error("Error cancelling order:", err);
      setStatus(err instanceof Error ? err.message : "Failed to cancel order");
    }
  };

  const formatDate = (timestamp: string) => {
    try {
      const date = new Date(parseInt(timestamp));
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Unknown";
    }
  };

  const getTotalPrice = (items: PurchaseOrderItem[]) => {
    return items.reduce((sum, item) => sum + item.price, 0);
  };

  const getTotalCost = (items: PurchaseOrderItem[]) => {
    return items.reduce((sum, item) => sum + item.cost, 0);
  };

  const getTotalMargin = (items: PurchaseOrderItem[]) => {
    const totalPrice = getTotalPrice(items);
    const totalCost = getTotalCost(items);
    return totalPrice - totalCost;
  };

  const formatCurrencyWhole = (amount: number) => formatCurrencyDisplay(amount);
  const getTotalMarginPercent = (items: PurchaseOrderItem[]) => {
    const totalPrice = getTotalPrice(items);
    if (totalPrice <= 0) return 0;
    return (getTotalMargin(items) / totalPrice) * 100;
  };

  return (
    <div className="app-shell">
      <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-6 px-6 py-10">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold text-[#1f1a16]">{t("purchaseOrders.title", "Purchase Orders")}</h1>
              <p className="text-sm text-[#6a4d3a]">
                {t("purchaseOrders.subtitle", "Purchase requests from customers")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-[#6a4d3a]">{t("purchaseOrders.show", "Show")}</label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-lg border-2 border-[#eddac7] bg-white px-3 py-2 text-sm text-[#1f1a16]"
              >
                <option value="pending">{t("purchaseOrders.pending", "Pending")}</option>
                <option value="completed">{t("purchaseOrders.completed", "Completed")}</option>
                <option value="expired">{t("purchaseOrders.expired", "Expired")}</option>
                <option value="deleted">{t("purchaseOrders.deleted", "Deleted")}</option>
                <option value="all">{t("purchaseOrders.all", "All")}</option>
              </select>
            </div>
          </header>

          {status && (
            <div className="rounded-lg border-2 border-[#eddac7] bg-[#fff9f0] px-4 py-3 text-sm text-[#5c4332]">
              {status}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#ff6b4a] border-r-transparent"></div>
                <p className="mt-4 text-[#6a4d3a]">{t("purchaseOrders.loading", "Loading purchase orders...")}</p>
              </div>
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-lg border-2 border-[#eddac7] bg-white p-12 text-center">
              <p className="text-[#6a4d3a]">{t("purchaseOrders.none", "No purchase orders")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div
                  key={order.saleId}
                  className="rounded-xl bg-white p-6 shadow-sm border-2 border-[#eddac7] hover:border-[#ff6b4a] transition-colors"
                >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-bold text-[#1f1a16]">
                      {order.saleId}
                    </h3>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      normalizePurchaseOrderStatus(order.status) === "Pending"
                        ? "bg-yellow-100 text-yellow-800"
                        : normalizePurchaseOrderStatus(order.status) === "Expired"
                        ? "bg-rose-100 text-rose-700"
                        : normalizePurchaseOrderStatus(order.status) === "Completed"
                        ? "bg-green-100 text-green-800"
                        : "bg-slate-200 text-slate-700"
                    }`}>
                      {normalizePurchaseOrderStatus(order.status).toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#6a4d3a]">
                    {t("purchaseOrders.created", "Created")}: {formatDate(order.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {normalizePurchaseOrderStatus(order.status) === "Pending" ? (
                    <>
                      <button
                        onClick={() => handleCancelOrder(order)}
                        className="rounded-lg bg-red-600 px-4 py-2 font-bold text-white transition-all hover:bg-red-700 hover:shadow-lg"
                      >
                        {t("purchaseOrders.delete", "Delete")}
                      </button>
                      <button
                        onClick={() => handleCreateCart(order)}
                        disabled={Boolean(order.offersEnabled && !order.allOffersAccepted)}
                        className="rounded-lg bg-[#ff6b4a] px-6 py-2 font-bold text-white transition-all hover:bg-[#e2573a] hover:shadow-lg"
                      >
                        {t("purchaseOrders.createCart", "Create Cart")}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {/* Customer Info */}
              <div className="mb-4 rounded-lg bg-[#fff9f0] p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#7a5d47]">
                      {t("purchaseOrders.customer", "Customer")}
                    </p>
                    <p className="mt-1 font-medium text-[#1f1a16]">
                      {order.customer || "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#7a5d47]">
                      {t("purchaseOrders.customerEmail", "Customer Email")}
                    </p>
                    <p className="mt-1 font-medium text-[#1f1a16]">
                      {order.customerEmail || "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#7a5d47]">
                      {t("purchaseOrders.whatsapp", "WhatsApp")}
                    </p>
                    <p className="mt-1 font-medium text-[#1f1a16]">
                      {order.whatsapp ? formatWhatsappForDisplay(order.whatsapp) : "N/A"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Items */}
              <div>
                <p className="mb-2 text-sm font-semibold text-[#3b2a1e]">
                  {t("purchaseOrders.items", "Items")} ({order.items.length})
                </p>
                <div className="space-y-2">
                  {order.items.map((item, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between rounded-lg p-3 ${item.isSold ? "bg-[#fff1f2]" : "bg-[#fff9f0]"}`}
                    >
                      <div>
                        <p className="font-medium text-[#1f1a16]">
                          {item.model}
                        </p>
                        <p className="text-sm text-[#6a4d3a]">
                          {item.color} • {item.capacity}
                        </p>
                        <p className="text-xs font-mono text-[#8b7355]">
                          {item.imei}
                        </p>
                        {item.isSold && (
                          <p className="text-xs font-semibold text-[#be123c]">
                            {t("purchaseOrders.itemSoldCannotCart", "This IMEI was sold and cannot be added to cart.")}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-[#1f1a16]">
                          {formatCurrencyWhole(order.offersEnabled ? (item.effectiveOfferMxn ?? item.price) : item.price)}
                        </p>
                        <p className="text-xs text-[#8b7355]">
                          {t("purchaseOrders.cost", "Cost")}: {formatCurrencyWhole(item.cost)}
                        </p>
                        {order.offersEnabled && (
                          <>
                            <p className="text-xs text-[#8b7355]">
                              {t("purchaseOrders.tier", "Tier")} ({item.tierName || "Price"}): {formatCurrencyWhole(item.tierPriceMxn ?? item.price)}
                            </p>
                            <p className="text-xs text-[#8b7355]">
                              {t("purchaseOrders.offer", "Offer")}: {item.offerAmountRaw ? `${item.offerAmountRaw} ${item.offerCurrency ?? "MXN"}` : t("purchaseOrders.blankTierUsed", "Blank (tier used)")}
                            </p>
                            <p className={`text-xs font-semibold ${(item.differenceMxn ?? 0) < 0 ? "text-red-600" : "text-green-700"}`}>
                              {t("purchaseOrders.difference", "Difference")}: {formatCurrencyWhole(item.differenceMxn ?? 0)}
                            </p>
                            {!item.offerAccepted ? (
                              <button
                                type="button"
                                onClick={() => void handleAcceptItem(order, item)}
                                disabled={acceptingKeys.has(`${order.requestId}-${item.imei}`)}
                                className="mt-1 rounded border border-[#2563eb] px-2 py-1 text-[11px] font-semibold text-[#2563eb] hover:bg-[#eff6ff] disabled:opacity-60"
                              >
                                {acceptingKeys.has(`${order.requestId}-${item.imei}`)
                                  ? t("purchaseOrders.accepting", "Accepting...")
                                  : t("purchaseOrders.acceptOffer", "Accept offer")}
                              </button>
                            ) : (
                              <p className="text-xs font-semibold text-green-700">{t("purchaseOrders.accepted", "Accepted")}</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {order.offersEnabled && !order.allOffersAccepted && (
                  <p className="mt-2 text-xs font-semibold text-[#b42318]">
                    {t("purchaseOrders.acceptOfferFirst", "Accept each offer item before creating cart.")}
                  </p>
                )}
              </div>

              {/* Total */}
              <div className="mt-4 space-y-2 border-t-2 border-[#eddac7] pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[#6a4d3a]">{t("purchaseOrders.totalCost", "Total Cost")}</p>
                  <p className="font-semibold text-[#6a4d3a]">
                    {formatCurrencyWhole(getTotalCost(order.items))}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[#6a4d3a]">{t("purchaseOrders.totalPrice", "Total Price")}</p>
                  <p className="font-semibold text-[#1f1a16]">
                    {formatCurrencyWhole(
                      order.offersEnabled
                        ? order.items.reduce((sum, item) => sum + Number(item.effectiveOfferMxn ?? item.price), 0)
                        : getTotalPrice(order.items)
                    )}
                  </p>
                </div>
                <div className="flex items-center justify-between border-t border-[#eddac7] pt-2">
                  <p className="text-lg font-bold text-[#3b2a1e]">{t("purchaseOrders.margin", "Margin")}</p>
                  <p className="text-right">
                    <span className="text-2xl font-bold text-[#ff6b4a]">
                      {formatCurrencyWhole(
                        (order.offersEnabled
                          ? order.items.reduce((sum, item) => sum + Number(item.effectiveOfferMxn ?? item.price), 0)
                          : getTotalPrice(order.items)) - getTotalCost(order.items)
                      )}
                    </span>
                    <span className="ml-2 text-sm font-semibold text-[#7a5d47]">
                      ({(
                        ((order.offersEnabled
                          ? order.items.reduce((sum, item) => sum + Number(item.effectiveOfferMxn ?? item.price), 0)
                          : getTotalPrice(order.items)) -
                          getTotalCost(order.items)) /
                        Math.max(
                          1,
                          order.offersEnabled
                            ? order.items.reduce((sum, item) => sum + Number(item.effectiveOfferMxn ?? item.price), 0)
                            : getTotalPrice(order.items)
                        )
                      * 100).toFixed(1)}%)
                    </span>
                  </p>
                </div>
              </div>
            </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

