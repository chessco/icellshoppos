"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import CurrentOrgBadge from "@/components/CurrentOrgBadge";
import { formatCurrencyDisplay } from "@/lib/display-format";
import { printSaleReceipt, type SaleReceiptData } from "@/lib/sales-receipt";
import { fetchOrgLogoDataUrl } from "@/lib/org-logo";
import { buildReceiptText, buildWhatsAppWebShareUrl } from "@/lib/receipt-share";
import { DEFAULT_RECEIPT_CONFIG, type ReceiptConfig } from "@/lib/receipt-config";

type SaleLine = {
  id: string;
  imei: string;
  serialNumber?: string;
  model: string;
  capacity: string;
  color: string;
  costPesos: string;
  salePrice: string;
  marginPesos: number;
  status: string;
};

type SaleRecord = {
  saleId: string;
  soldAt: string;
  organizationName?: string;
  customer: string;
  customerType: "retail" | "wholesale";
  customerEmail: string;
  customerWhatsapp: string;
  paymentMethod: string;
  notes: string;
  soldBy: string;
  lines: SaleLine[];
};

type SessionOrganization = {
  id: string;
  name: string;
  slug: string;
};

type AdminSalesOverviewResponse = {
  sales?: SaleRecord[];
  salesByOrganization?: Array<{ organization: string; revenue: number; orders: number }>;
  salesByMonth?: Array<{ month: string; revenue: number; orders: number }>;
  salesByPlan?: Array<{ plan: string; revenue: number; orders: number }>;
  error?: string;
};

const parseMoney = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const PAYMENT_METHOD_COLUMNS = ["Cash", "Transfer", "Card", "Trade-in", "Other", "Credit"] as const;

const parsePaymentBreakdown = (
  paymentMethod: string,
  saleTotal: number
): Record<(typeof PAYMENT_METHOD_COLUMNS)[number], number> => {
  const result = Object.fromEntries(PAYMENT_METHOD_COLUMNS.map((method) => [method, 0])) as Record<
    (typeof PAYMENT_METHOD_COLUMNS)[number],
    number
  >;

  const raw = paymentMethod.trim();
  if (!raw) return result;

  if (raw.includes("|")) {
    const segments = raw.split("|").map((segment) => segment.trim()).filter(Boolean);
    for (const segment of segments) {
      const [methodLabel, amountLabel] = segment.split(":").map((part) => part.trim());
      if (!methodLabel || !amountLabel) continue;
      const normalizedMethod = PAYMENT_METHOD_COLUMNS.find(
        (method) => method.toLowerCase() === methodLabel.toLowerCase()
      );
      if (!normalizedMethod) continue;
      result[normalizedMethod] += parseMoney(amountLabel);
    }
    return result;
  }

  const simpleMethod = PAYMENT_METHOD_COLUMNS.find(
    (method) => method.toLowerCase() === raw.toLowerCase()
  );
  if (simpleMethod) {
    result[simpleMethod] = saleTotal;
  }
  return result;
};

const money = (value: number) => formatCurrencyDisplay(Math.round(value));

const getStatus = (sale: SaleRecord) => {
  const statuses = Array.from(new Set(sale.lines.map((line) => line.status)));
  if (statuses.length === 1 && statuses[0] === "Cancelled") return "Cancelled";
  if (statuses.includes("Cancelled")) return "Partially Cancelled";
  if (statuses.length === 1 && statuses[0] === "Finished") return "Finished";
  return "Pending";
};

export default function SalesHistoryPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get("search")?.trim() ?? "";
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [canViewCostAndMargin, setCanViewCostAndMargin] = useState(false);
  const [organizations, setOrganizations] = useState<SessionOrganization[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState("");
  const [activeOrganizationName, setActiveOrganizationName] = useState("");
  const [orgSearch, setOrgSearch] = useState("");
  const [switchingOrg, setSwitchingOrg] = useState(false);
  const [salesByOrganization, setSalesByOrganization] = useState<Array<{ organization: string; revenue: number; orders: number }>>([]);
  const [salesByMonth, setSalesByMonth] = useState<Array<{ month: string; revenue: number; orders: number }>>([]);
  const [salesByPlan, setSalesByPlan] = useState<Array<{ plan: string; revenue: number; orders: number }>>([]);
  const [search, setSearch] = useState(initialSearch);
  const [customerFilter, setCustomerFilter] = useState("all");
  const [customerTypeFilter, setCustomerTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined);
  const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig>(DEFAULT_RECEIPT_CONFIG);
  const [activeCancelSaleId, setActiveCancelSaleId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelMode, setCancelMode] = useState<"full" | "partial">("full");
  const [selectedCancelLineIds, setSelectedCancelLineIds] = useState<Set<string>>(new Set());
  const [canceling, setCanceling] = useState(false);
  const [sendingEmailSaleId, setSendingEmailSaleId] = useState<string | null>(null);

  const loadSales = async (options?: { superadmin?: boolean; organizationId?: string }) => {
    try {
      setBusy(true);
      const isAdminMode = Boolean(options?.superadmin);
      const orgId = options?.organizationId?.trim() ?? "";
      const endpoint = isAdminMode
        ? `/api/admin/sales-overview${orgId ? `?organizationId=${encodeURIComponent(orgId)}` : ""}`
        : "/api/sales";

      const response = await fetch(endpoint, { cache: "no-store" });
      const data = (await response.json()) as AdminSalesOverviewResponse;
      if (!response.ok) {
        setMessage(data.error ?? "Failed to load sales.");
        return;
      }
      setSales(data.sales ?? []);
      if (isAdminMode) {
        setSalesByOrganization(data.salesByOrganization ?? []);
        setSalesByMonth(data.salesByMonth ?? []);
        setSalesByPlan(data.salesByPlan ?? []);
      } else {
        setSalesByOrganization([]);
        setSalesByMonth([]);
        setSalesByPlan([]);
      }
      setMessage(null);
    } catch {
      setMessage("Failed to load sales.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || cancelled) {
          if (!cancelled) {
            await loadSales({ superadmin: false });
          }
          return;
        }

        const session = payload?.session as { isSuperadmin?: boolean; activeOrganizationId?: string } | undefined;
        const orgList = Array.isArray(payload?.organizations) ? (payload.organizations as SessionOrganization[]) : [];
        const superadmin = Boolean(session?.isSuperadmin);
        const role = payload?.role || (payload?.session as { role?: string } | undefined)?.role;
        const hasCostMarginPerm = (payload?.permissions as Record<string, boolean> | undefined)?.canViewCostAndMargin === true;
        const currentOrg = String(session?.activeOrganizationId ?? "");
        const currentOrgName =
          orgList.find((organization) => organization.id === currentOrg)?.name ?? "";

        if (cancelled) return;
        setIsSuperadmin(superadmin);
        setCanViewCostAndMargin(superadmin || role === "superadmin" || role === "admin" || hasCostMarginPerm);
        setOrganizations(orgList);
        setActiveOrganizationId(currentOrg);
        setActiveOrganizationName(currentOrgName);

        await loadSales({ superadmin, organizationId: currentOrg });
      } catch {
        if (!cancelled) {
          await loadSales({ superadmin: false });
        }
      }
    };

    void boot();
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
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredOrganizations = useMemo(() => {
    const query = orgSearch.trim().toLowerCase();
    if (!query) return organizations;
    return organizations.filter((organization) =>
      `${organization.name} ${organization.slug}`.toLowerCase().includes(query)
    );
  }, [orgSearch, organizations]);

  const customerOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const sale of sales) {
      const name = sale.customer?.trim();
      if (name) unique.add(name);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [sales]);

  const handleSwitchOrganization = async () => {
    if (!activeOrganizationId) return;

    try {
      setSwitchingOrg(true);
      const response = await fetch("/api/auth/switch-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: activeOrganizationId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setMessage(payload?.error ?? "Failed to switch organization.");
        return;
      }

      await loadSales({ superadmin: true, organizationId: activeOrganizationId });
      setMessage("Organization switched.");
    } catch {
      setMessage("Failed to switch organization.");
    } finally {
      setSwitchingOrg(false);
    }
  };

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales.filter((sale) => {
      const saleStatus = getStatus(sale);
      if (statusFilter !== "all" && saleStatus !== statusFilter) return false;
      if (customerFilter !== "all" && sale.customer?.trim() !== customerFilter) return false;
      if (customerTypeFilter !== "all" && sale.customerType !== customerTypeFilter) return false;
      if (!q) return true;
      return [
        sale.saleId,
        sale.customer,
        sale.customerType,
        sale.customerEmail,
        sale.customerWhatsapp,
        sale.paymentMethod,
        sale.soldBy,
        sale.notes,
        ...sale.lines.flatMap((line) => [line.imei, line.model, line.capacity, line.color]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [sales, search, statusFilter, customerFilter, customerTypeFilter]);

  const exportSalesHistoryCsv = () => {
    const headers = [
      "Date",
      "Customer Type",
      "Customer Name",
      ...(canViewCostAndMargin ? ["Cost"] : []),
      "Sold Price",
      "Device",
      "IMEI",
      "Serial Number",
      "Model/Color/Capacity",
      ...(canViewCostAndMargin ? ["Margin"] : []),
      "Email",
      "Phone Number",
      ...PAYMENT_METHOD_COLUMNS,
    ];

    const rows = filteredSales.flatMap((sale) => {
      const saleTotal = sale.lines.reduce((sum, line) => sum + parseMoney(line.salePrice), 0);
      const breakdown = parsePaymentBreakdown(sale.paymentMethod, saleTotal);

      return sale.lines.map((line, index) => {
        const lineCost = parseMoney(line.costPesos);
        const lineSale = parseMoney(line.salePrice);
        const lineMargin = lineSale - lineCost;
        const paymentColumns = PAYMENT_METHOD_COLUMNS.map((method) =>
          index === 0 && breakdown[method] > 0 ? String(Math.round(breakdown[method])) : ""
        );

        return [
          new Date(sale.soldAt).toISOString(),
          sale.customerType === "wholesale" ? "Wholesale" : "Retail",
          sale.customer || "",
          ...(canViewCostAndMargin ? [String(Math.round(lineCost))] : []),
          String(Math.round(lineSale)),
          `${line.model} ${line.capacity} ${line.color}`.trim(),
          line.imei || "",
          line.serialNumber ?? "",
          `${line.model}/${line.color}/${line.capacity}`,
          ...(canViewCostAndMargin ? [String(Math.round(lineMargin))] : []),
          sale.customerEmail || "",
          sale.customerWhatsapp || "",
          ...paymentColumns,
        ];
      });
    });

    const csvEscape = (value: string) => {
      const needsQuotes = /[",\n\r]/.test(value);
      const escaped = value.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    };

    const content = [headers, ...rows]
      .map((row) => row.map((cell) => csvEscape(String(cell ?? ""))).join(","))
      .join("\n");

    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sales-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const summary = useMemo(() => {
    const items = filteredSales.reduce((sum, sale) => sum + sale.lines.length, 0);
    const totalSale = filteredSales.reduce(
      (sum, sale) => sum + sale.lines.reduce((lineSum, line) => lineSum + parseMoney(line.salePrice), 0),
      0
    );
    const totalCost = filteredSales.reduce(
      (sum, sale) => sum + sale.lines.reduce((lineSum, line) => lineSum + parseMoney(line.costPesos), 0),
      0
    );
    return {
      transactions: filteredSales.length,
      items,
      totalCost,
      totalSale,
      margin: totalSale - totalCost,
    };
  }, [filteredSales]);

  const handlePrintReceipt = (sale: SaleRecord) => {
    try {
      printSaleReceipt({
        saleId: sale.saleId,
        soldAt: sale.soldAt,
        customerName: sale.customer,
        customerWhatsapp: sale.customerWhatsapp,
        customerEmail: sale.customerEmail,
        paymentMethod: sale.paymentMethod,
        soldBy: sale.soldBy,
        notes: sale.notes,
        logoDataUrl,
        receiptConfig,
        items: sale.lines.map((line) => ({
          imei: line.imei,
          model: line.model,
          capacity: line.capacity,
          color: line.color,
          salePrice: parseMoney(line.salePrice),
        })),
        total: sale.lines.reduce((sum, line) => sum + parseMoney(line.salePrice), 0),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not print receipt.");
    }
  };

  const buildReceiptData = (sale: SaleRecord): SaleReceiptData => ({
    companyName: sale.organizationName ?? activeOrganizationName ?? "Pro Buyer",
    saleId: sale.saleId,
    soldAt: sale.soldAt,
    customerName: sale.customer,
    customerWhatsapp: sale.customerWhatsapp,
    customerEmail: sale.customerEmail,
    paymentMethod: sale.paymentMethod,
    soldBy: sale.soldBy,
    notes: sale.notes,
    logoDataUrl,
    receiptConfig,
    items: sale.lines.map((line) => ({
      imei: line.imei,
      model: line.model,
      capacity: line.capacity,
      color: line.color,
      salePrice: parseMoney(line.salePrice),
    })),
    total: sale.lines.reduce((sum, line) => sum + parseMoney(line.salePrice), 0),
  });

  const handleShareViaWhatsapp = (sale: SaleRecord) => {
    if (!sale.customerWhatsapp?.trim()) {
      setMessage("Customer WhatsApp is missing for this sale.");
      return;
    }

    const messageText = buildReceiptText(buildReceiptData(sale));
    const shareUrl = buildWhatsAppWebShareUrl(sale.customerWhatsapp, messageText);

    if (!shareUrl) {
      setMessage("Customer WhatsApp is invalid.");
      return;
    }

    if (typeof window !== "undefined") {
      window.open(shareUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleSendViaEmail = async (sale: SaleRecord) => {
    if (!sale.customerEmail?.trim()) {
      setMessage("Customer email is missing for this sale.");
      return;
    }

    try {
      setSendingEmailSaleId(sale.saleId);
      const response = await fetch("/api/sales/send-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleId: sale.saleId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Failed to send receipt email.");
        return;
      }
      setMessage(`Receipt email sent for ${sale.saleId}.`);
    } catch {
      setMessage("Failed to send receipt email.");
    } finally {
      setSendingEmailSaleId(null);
    }
  };

  const openCancelPanel = (sale: SaleRecord) => {
    const cancellableLineIds = sale.lines.filter((line) => line.status !== "Cancelled").map((line) => line.id);
    setActiveCancelSaleId(sale.saleId);
    setCancelMode("full");
    setSelectedCancelLineIds(new Set(cancellableLineIds));
    setCancelReason("");
    setMessage(null);
  };

  const closeCancelPanel = () => {
    setActiveCancelSaleId(null);
    setCancelReason("");
    setSelectedCancelLineIds(new Set());
    setCancelMode("full");
  };

  const toggleCancelLine = (lineId: string) => {
    setSelectedCancelLineIds((current) => {
      const next = new Set(current);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const submitCancel = async (sale: SaleRecord) => {
    if (!cancelReason.trim()) {
      setMessage("Cancellation reason is required.");
      return;
    }

    if (cancelMode === "partial" && selectedCancelLineIds.size === 0) {
      setMessage("Select at least one item to cancel.");
      return;
    }

    try {
      setCanceling(true);
      const response = await fetch("/api/cancel-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: sale.saleId,
          reason: cancelReason.trim(),
          fullSale: cancelMode === "full",
          items:
            cancelMode === "partial"
              ? Array.from(selectedCancelLineIds).map((saleItemId) => ({ saleItemId }))
              : [],
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Failed to cancel sale items.");
        return;
      }

      setMessage(data.message ?? "Sale cancellation completed.");
      closeCancelPanel();
      await loadSales({ superadmin: isSuperadmin, organizationId: activeOrganizationId });
    } catch {
      setMessage("Failed to cancel sale items.");
    } finally {
      setCanceling(false);
    }
  };

  const tableColSpan = (isSuperadmin ? 11 : 10) - (canViewCostAndMargin ? 0 : 2);

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
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#1f1a16] md:text-3xl">Sales History</h1>
              <p className="text-sm text-[#6a4d3a]">Review completed sales from the database.</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => loadSales({ superadmin: isSuperadmin, organizationId: activeOrganizationId })}
                disabled={busy}
                className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-medium text-[#3b2a1e] disabled:opacity-60"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={exportSalesHistoryCsv}
                disabled={busy || filteredSales.length === 0}
                className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-medium text-[#3b2a1e] disabled:opacity-60"
              >
                Export Excel (CSV)
              </button>
              <Link
                href="/sales/cancel"
                className="rounded-full border border-[#c24d34] px-4 py-2 text-sm font-semibold text-[#c24d34]"
              >
                Cancel Sale Items
              </Link>
            </div>
          </header>

          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-3 md:p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search sales, customer, IMEI"
                className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 text-sm outline-none focus:border-[#1f1a16]"
              />
              <select
                value={customerFilter}
                onChange={(event) => setCustomerFilter(event.target.value)}
                className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 text-sm outline-none focus:border-[#1f1a16]"
              >
                <option value="all">All customers</option>
                {customerOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
                <select
                  value={customerTypeFilter}
                  onChange={(event) => setCustomerTypeFilter(event.target.value)}
                  className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 text-sm outline-none focus:border-[#1f1a16]"
                >
                  <option value="all">All customer types</option>
                  <option value="retail">Retail</option>
                  <option value="wholesale">Wholesale</option>
                </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 text-sm outline-none focus:border-[#1f1a16]"
              >
                <option value="all">All statuses</option>
                <option value="Finished">Finished</option>
                <option value="Cancelled">Cancelled</option>
                <option value="Partially Cancelled">Partially Cancelled</option>
                <option value="Pending">Pending</option>
              </select>
            </div>

            {isSuperadmin && (
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <input
                  value={orgSearch}
                  onChange={(event) => setOrgSearch(event.target.value)}
                  placeholder="Search organization"
                  className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 text-sm outline-none focus:border-[#1f1a16]"
                />
                <select
                  value={activeOrganizationId}
                  onChange={(event) => setActiveOrganizationId(event.target.value)}
                  className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 text-sm outline-none focus:border-[#1f1a16]"
                >
                  <option value="">All organizations</option>
                  {filteredOrganizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleSwitchOrganization}
                  disabled={switchingOrg || busy}
                  className="rounded-xl border border-[#d6c1ad] px-3 py-2 text-sm font-medium text-[#3b2a1e] disabled:opacity-60"
                >
                  {switchingOrg ? "Switching..." : "Apply Organization"}
                </button>
              </div>
            )}

            <div className={`mt-4 grid gap-1 text-sm text-[#3b2a1e] ${canViewCostAndMargin ? "md:grid-cols-5" : "md:grid-cols-3"}`}>
              <div>Transactions: <span className="font-semibold">{summary.transactions}</span></div>
              <div>Items: <span className="font-semibold">{summary.items}</span></div>
              {canViewCostAndMargin && <div>Total Cost: <span className="font-semibold">{money(summary.totalCost)}</span></div>}
              <div>Total Sale: <span className="font-semibold">{money(summary.totalSale)}</span></div>
              {canViewCostAndMargin && <div>Margin: <span className="font-semibold">{money(summary.margin)}</span></div>}
            </div>
          </section>

          {isSuperadmin && (
            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-[#e6d6c6] bg-white p-4">
                <h2 className="text-sm font-semibold text-[#3b2a1e]">Sales by Organization</h2>
                <div className="mt-3 space-y-2 text-xs text-[#5c4332]">
                  {salesByOrganization.slice(0, 6).map((entry) => {
                    const maxRevenue = Math.max(...salesByOrganization.map((item) => item.revenue), 1);
                    const width = Math.max(6, Math.round((entry.revenue / maxRevenue) * 100));
                    return (
                      <div key={entry.organization}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{entry.organization}</span>
                          <span className="font-semibold">{money(entry.revenue)}</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-[#f4e7d9]">
                          <div className="h-full rounded-full bg-[#c24d34]" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {salesByOrganization.length === 0 && <p>No organization sales data.</p>}
                </div>
              </div>

              <div className="rounded-2xl border border-[#e6d6c6] bg-white p-4">
                <h2 className="text-sm font-semibold text-[#3b2a1e]">Sales by Month</h2>
                <div className="mt-3 space-y-2 text-xs text-[#5c4332]">
                  {salesByMonth.slice(-6).map((entry) => (
                    <div key={entry.month} className="flex items-center justify-between gap-2">
                      <span>{entry.month}</span>
                      <span className="font-semibold">{money(entry.revenue)}</span>
                    </div>
                  ))}
                  {salesByMonth.length === 0 && <p>No monthly sales data.</p>}
                </div>
              </div>

              <div className="rounded-2xl border border-[#e6d6c6] bg-white p-4">
                <h2 className="text-sm font-semibold text-[#3b2a1e]">Sales by Plan</h2>
                <div className="mt-3 space-y-2 text-xs text-[#5c4332]">
                  {salesByPlan.map((entry) => (
                    <div key={entry.plan} className="flex items-center justify-between gap-2">
                      <span>{entry.plan}</span>
                      <span className="font-semibold">{money(entry.revenue)}</span>
                    </div>
                  ))}
                  {salesByPlan.length === 0 && <p>No plan sales data.</p>}
                </div>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-3 md:p-4">
            <div className="mobile-scroll max-h-[65vh] overflow-auto">
              <table className="min-w-[680px] text-left text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-[#ead8c6] text-[#6a4d3a]">
                    <th className="px-2 py-2">Sale</th>
                    <th className="px-2 py-2">Date</th>
                    {isSuperadmin && <th className="px-2 py-2">Organization</th>}
                    <th className="px-2 py-2">Customer</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Items</th>
                    {canViewCostAndMargin && <th className="px-2 py-2">Cost</th>}
                    <th className="px-2 py-2">Total</th>
                    {canViewCostAndMargin && <th className="px-2 py-2">Margin</th>}
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((sale) => {
                    const total = sale.lines.reduce((sum, line) => sum + parseMoney(line.salePrice), 0);
                    const totalCost = sale.lines.reduce((sum, line) => sum + parseMoney(line.costPesos), 0);
                    const totalMargin = total - totalCost;
                    const cancellableLines = sale.lines.filter((line) => line.status !== "Cancelled");
                    const showCancelPanel = activeCancelSaleId === sale.saleId;
                    return [
                        <tr key={`${sale.saleId}-summary`} className="border-b border-[#f1e4d6]">
                          <td className="px-2 py-2 font-semibold">{sale.saleId}</td>
                          <td className="px-2 py-2">{new Date(sale.soldAt).toLocaleString()}</td>
                          {isSuperadmin && <td className="px-2 py-2">{sale.organizationName ?? "-"}</td>}
                          <td className="px-2 py-2">{sale.customer || "-"}</td>
                          <td className="px-2 py-2">{sale.customerType === "wholesale" ? "Wholesale" : "Retail"}</td>
                          <td className="px-2 py-2">{sale.lines.length}</td>
                          {canViewCostAndMargin && <td className="px-2 py-2">{money(totalCost)}</td>}
                          <td className="px-2 py-2">{money(total)}</td>
                          {canViewCostAndMargin && <td className="px-2 py-2">{money(totalMargin)}</td>}
                          <td className="px-2 py-2">{getStatus(sale)}</td>
                          <td className="px-2 py-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handlePrintReceipt(sale)}
                                className="rounded-full border border-[#d6c1ad] px-3 py-1 text-xs font-semibold text-[#3b2a1e]"
                              >
                                Print
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSendViaEmail(sale)}
                                disabled={sendingEmailSaleId === sale.saleId}
                                className="rounded-full border border-[#d6c1ad] px-3 py-1 text-xs font-semibold text-[#3b2a1e] disabled:opacity-60"
                              >
                                {sendingEmailSaleId === sale.saleId ? "Sending Email..." : "Send via Email"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleShareViaWhatsapp(sale)}
                                className="rounded-full border border-[#d6c1ad] px-3 py-1 text-xs font-semibold text-[#3b2a1e]"
                              >
                                Send via WhatsApp
                              </button>
                              {cancellableLines.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => openCancelPanel(sale)}
                                  className="rounded-full border border-[#c24d34] px-3 py-1 text-xs font-semibold text-[#c24d34]"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>,
                        <tr key={`${sale.saleId}-lines`} className="border-b border-[#f1e4d6] bg-[#fffaf3]">
                          <td colSpan={tableColSpan} className="px-2 py-2">
                            <div className="overflow-auto rounded-lg border border-[#ead8c6] bg-white">
                              <table className="min-w-full text-left text-xs">
                                <thead className="bg-[#fff6ea] text-[#6a4d3a]">
                                  <tr>
                                    <th className="px-2 py-2">IMEI</th>
                                    <th className="px-2 py-2">Serial</th>
                                    <th className="px-2 py-2">Device</th>
                                    {canViewCostAndMargin && <th className="px-2 py-2">Cost</th>}
                                    <th className="px-2 py-2">Sold</th>
                                    {canViewCostAndMargin && <th className="px-2 py-2">Margin</th>}
                                    <th className="px-2 py-2">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sale.lines.map((line, index) => {
                                    const lineCost = parseMoney(line.costPesos);
                                    const lineSale = parseMoney(line.salePrice);
                                    const lineMargin = lineSale - lineCost;
                                    const isCancelled = line.status === "Cancelled";
                                    const isZeroCost = lineCost === 0;
                                    return (
                                      <tr
                                        key={`${sale.saleId}-${line.imei}-${index}`}
                                        className={`border-t border-[#f1e4d6] ${isZeroCost ? "bg-[#fff1f2]" : ""}`}
                                      >
                                        <td className="px-2 py-2">{line.imei || "-"}</td>
                                        <td className="px-2 py-2">{line.serialNumber || "-"}</td>
                                        <td className="px-2 py-2">{line.model} {line.capacity} {line.color}</td>
                                        {canViewCostAndMargin && <td className={`px-2 py-2 ${isZeroCost ? "font-semibold text-[#be123c]" : ""}`}>{money(lineCost)}</td>}
                                        <td className="px-2 py-2">{money(lineSale)}</td>
                                        {canViewCostAndMargin && <td className={`px-2 py-2 font-semibold ${lineMargin < 0 ? "text-[#be123c]" : "text-[#3b2a1e]"}`}>{money(lineMargin)}</td>}
                                        <td className={`px-2 py-2 ${isCancelled ? "text-[#a33f29] line-through" : ""}`}>{line.status}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>,
                        ...(showCancelPanel
                          ? [
                              <tr key={`${sale.saleId}-cancel`} className="border-b border-[#f1e4d6] bg-[#fff3f0]">
                                <td colSpan={tableColSpan} className="px-3 py-3">
                                  <div className="grid gap-3">
                                    <div className="flex flex-wrap items-center gap-3">
                                      <span className="text-sm font-semibold text-[#7e2b1f]">Cancel {sale.saleId}</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCancelMode("full");
                                          setSelectedCancelLineIds(new Set(cancellableLines.map((line) => line.id)));
                                        }}
                                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                          cancelMode === "full"
                                            ? "bg-[#c24d34] text-white"
                                            : "border border-[#e7b4aa] text-[#7e2b1f]"
                                        }`}
                                      >
                                        Full Sale
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setCancelMode("partial")}
                                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                          cancelMode === "partial"
                                            ? "bg-[#c24d34] text-white"
                                            : "border border-[#e7b4aa] text-[#7e2b1f]"
                                        }`}
                                      >
                                        Partial Items
                                      </button>
                                    </div>

                                    {cancelMode === "partial" && (
                                      <div className="flex flex-wrap gap-2">
                                        {cancellableLines.map((line) => (
                                          <label key={`${sale.saleId}-pick-${line.id}`} className="inline-flex items-center gap-2 rounded-full border border-[#e7b4aa] bg-white px-2 py-1 text-xs text-[#7e2b1f]">
                                            <input
                                              type="checkbox"
                                              checked={selectedCancelLineIds.has(line.id)}
                                              onChange={() => toggleCancelLine(line.id)}
                                            />
                                            {line.imei || line.serialNumber || `${line.model} ${line.capacity} ${line.color}`.trim()}
                                          </label>
                                        ))}
                                      </div>
                                    )}

                                    <input
                                      value={cancelReason}
                                      onChange={(event) => setCancelReason(event.target.value)}
                                      placeholder="Cancellation reason (required)"
                                      className="rounded-lg border border-[#e7b4aa] bg-white px-3 py-2 text-sm outline-none focus:border-[#c24d34]"
                                    />

                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => submitCancel(sale)}
                                        disabled={canceling}
                                        className="rounded-lg bg-[#c24d34] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                                      >
                                        {canceling ? "Cancelling..." : "Confirm Cancel"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={closeCancelPanel}
                                        className="rounded-lg border border-[#e7b4aa] px-4 py-2 text-sm font-semibold text-[#7e2b1f]"
                                      >
                                        Close
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>,
                            ]
                          : [])
                    ];
                  })}
                  {filteredSales.length === 0 && (
                    <tr>
                      <td colSpan={tableColSpan} className="px-2 py-6 text-center text-[#6a4d3a]">No sales found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {message && (
            <div className="rounded-2xl border border-[#e6d6c6] bg-[#fff6ea] px-4 py-3 text-sm text-[#5c4332]">
              {message}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

