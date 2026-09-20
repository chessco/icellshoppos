"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import CurrentOrgBadge from "@/components/CurrentOrgBadge";
import { formatCurrencyDisplay } from "@/lib/display-format";

type MetricSummary = {
  totalInventoryUnits: number;
  availableUnits: number;
  soldUnits: number;
  inventoryCost: number;
  inventoryPotential: number;
  soldRevenue: number;
  soldCost: number;
  grossProfit: number;
  ordersCount: number;
  averageTicket: number;
  sellThroughRate: number;
};

type SalesByDatePoint = {
  date: string;
  label: string;
  revenue: number;
  orders: number;
  profit: number;
};

type SalesRangeSummary = {
  from: string;
  to: string;
  revenue: number;
  profit: number;
  orders: number;
};

type SalesByCustomerPoint = {
  customer: string;
  revenue: number;
  orders: number;
  profit: number;
  marginPercent: number;
};

type MarginByDatePoint = {
  date: string;
  label: string;
  margin: number;
  revenue: number;
};

type CustomerTypeMixPoint = {
  type: "retail" | "wholesale" | "walk_in";
  revenue: number;
  profit: number;
  orders: number;
  marginPercent: number;
};

type CustomerLineDetailPoint = {
  customer: string;
  saleNumber: string;
  soldAt: string;
  imei: string;
  model: string;
  capacity: string;
  color: string;
  cost: number;
  salePrice: number;
  margin: number;
};

type TopModelPoint = {
  model: string;
  units: number;
  revenue: number;
  profit: number;
};

type StatusPoint = {
  status: string;
  count: number;
};

type AgingPoint = {
  bucket: string;
  count: number;
};

type InsightSummary = {
  bestSalesDay: string;
  bestSalesDayRevenue: number;
  topCustomer: string;
  topCustomerRevenue: number;
  topModel: string;
  topModelUnits: number;
};

type DashboardPayload = {
  metrics: MetricSummary;
  salesByDate: SalesByDatePoint[];
  marginByDate: MarginByDatePoint[];
  customerTypeMix: CustomerTypeMixPoint[];
  customerLineDetails: CustomerLineDetailPoint[];
  salesRangeSummary: SalesRangeSummary;
  salesByCustomer: SalesByCustomerPoint[];
  topModels: TopModelPoint[];
  inventoryByStatus: StatusPoint[];
  inventoryAging: AgingPoint[];
  tierScenarios: {
    price: {
      label: string;
      availableInventoryCost: number;
      availableProjectedRevenue: number;
    };
    price2: {
      label: string;
      availableInventoryCost: number;
      availableProjectedRevenue: number;
    };
    price3: {
      label: string;
      availableInventoryCost: number;
      availableProjectedRevenue: number;
    };
  };
  insights: InsightSummary;
  appliedFilters?: {
    customerType?: "all" | "retail" | "wholesale";
  };
};

type PriceTierKey = "price" | "price2" | "price3";

type SuperadminDashboardPayload = {
  metrics: {
    usersTotal: number;
    usersActive: number;
    usersInactive: number;
    organizationsTotal: number;
    organizationsActive: number;
    organizationsSuspended: number;
    subscriptionsTotal: number;
    mrrCents: number;
    newUsersLast30Days: number;
    newOrganizationsLast30Days: number;
  };
  subscriptionsByPlan: Array<{
    planCode: string;
    planName: string;
    activeCount: number;
    trialingCount: number;
    mrrCents: number;
  }>;
  revenueByMonth: Array<{ month: string; amountCents: number; count: number }>;
  revenueByPlan: Array<{ planCode: string; planName: string; amountCents: number; count: number }>;
};

const formatInteger = (value: number) => value.toLocaleString("en-US");

const cardClass =
  "rounded-2xl border border-[#d6e4ff] bg-white p-4 shadow-[0_10px_28px_rgba(37,99,235,0.10)]";

const HorizontalBars = ({
  items,
  valueKey,
  labelKey,
  formatter,
}: {
  items: Array<Record<string, string | number>>;
  valueKey: string;
  labelKey: string;
  formatter: (value: number) => string;
}) => {
  const maxValue = useMemo(
    () => Math.max(...items.map((item) => Number(item[valueKey]) || 0), 1),
    [items, valueKey]
  );

  if (items.length === 0) {
    return <p className="text-sm text-[#5f7298]">No data yet.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const numericValue = Number(item[valueKey]) || 0;
        const width = Math.max(4, (numericValue / maxValue) * 100);
        return (
          <div key={`${String(item[labelKey])}-${index}`}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-[#29477e]">{String(item[labelKey])}</span>
              <span className="font-semibold text-[#0f1f3d]">{formatter(numericValue)}</span>
            </div>
            <div className="h-2 rounded-full bg-[#e4efff]">
              <div className="h-2 rounded-full bg-gradient-to-r from-[#2563eb] to-[#10b981]" style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default function DashboardPage() {
  const pathname = usePathname();
  const [adminDeniedNotice, setAdminDeniedNotice] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [viewMode, setViewMode] = useState<"store" | "superadmin">("store");
  const [superadminPayload, setSuperadminPayload] = useState<SuperadminDashboardPayload | null>(null);
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<PriceTierKey>("price");
  const [dateFrom, setDateFrom] = useState(() => {
    const today = new Date();
    const from = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
    return from.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [customerTypeFilter, setCustomerTypeFilter] = useState<"all" | "retail" | "wholesale">("all");
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState("all");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setAdminDeniedNotice(params.get("notice") === "admin-denied");
  }, []);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      setError(null);
      try {
        const sessionResponse = await fetch("/api/auth/me", { cache: "no-store" });
        const sessionPayload = await sessionResponse.json().catch(() => ({}));
        const superadmin = Boolean(sessionPayload?.session?.isSuperadmin);
        setIsSuperadmin(superadmin);

        if (superadmin && viewMode === "superadmin") {
          const response = await fetch("/api/admin/dashboard", { cache: "no-store" });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || "Failed to load superadmin dashboard data.");
          }
          const data = (await response.json()) as SuperadminDashboardPayload;
          setSuperadminPayload(data);
          setPayload(null);
        } else {
          const query = `?from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(dateTo)}&customerType=${encodeURIComponent(customerTypeFilter)}`;
          const response = await fetch(`/api/dashboard${query}`, { cache: "no-store" });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || "Failed to load store dashboard data.");
          }
          const data = (await response.json()) as DashboardPayload;
          setPayload(data);
          setSuperadminPayload(null);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard data.");
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [viewMode, dateFrom, dateTo, customerTypeFilter]);

  const salesChartMax = useMemo(() => {
    if (!payload?.salesByDate?.length) return 1;
    return Math.max(...payload.salesByDate.map((point) => point.revenue), 1);
  }, [payload]);

  const salesChartProfitMax = useMemo(() => {
    if (!payload?.salesByDate?.length) return 1;
    return Math.max(...payload.salesByDate.map((point) => Math.abs(point.profit)), 1);
  }, [payload]);

  const marginByDateMax = useMemo(() => {
    if (!payload?.marginByDate?.length) return 1;
    return Math.max(...payload.marginByDate.map((point) => Math.abs(point.margin)), 1);
  }, [payload]);

  const selectedTierScenario = payload?.tierScenarios?.[selectedTier];
  const availableInventoryCost = selectedTierScenario?.availableInventoryCost ?? 0;
  const availableProjectedRevenue = selectedTierScenario?.availableProjectedRevenue ?? 0;
  const availableInventoryMargin = availableProjectedRevenue - availableInventoryCost;
  const availableInventoryMarginPercent =
    availableInventoryCost > 0
      ? ((availableInventoryMargin / availableInventoryCost) * 100).toFixed(1)
      : "0";
  const grossMarginPercent =
    payload && payload.metrics.soldRevenue > 0
      ? (payload.metrics.grossProfit / payload.metrics.soldRevenue) * 100
      : 0;
  const customerTypeMixMaxRevenue = useMemo(() => {
    if (!payload?.customerTypeMix?.length) return 1;
    return Math.max(...payload.customerTypeMix.map((point) => point.revenue), 1);
  }, [payload]);

  const superadminMonthlyItems = (superadminPayload?.revenueByMonth ?? []).map((point) => ({
    label: point.month,
    value: point.amountCents / 100,
  }));

  const superadminPlanItems = (superadminPayload?.subscriptionsByPlan ?? []).map((point) => ({
    label: point.planName,
    value: point.activeCount,
  }));

  const customerDetailOptions = useMemo(() => {
    if (!payload) return [];
    return Array.from(new Set(payload.customerLineDetails.map((line) => line.customer))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [payload]);

  const filteredCustomerLineDetails = useMemo(() => {
    if (!payload) return [];
    if (selectedCustomerDetail === "all") return payload.customerLineDetails;
    return payload.customerLineDetails.filter((line) => line.customer === selectedCustomerDetail);
  }, [payload, selectedCustomerDetail]);

  const customerDetailSummary = useMemo(() => {
    const totals = filteredCustomerLineDetails.reduce(
      (sum, line) => {
        sum.totalCost += line.cost;
        sum.totalSale += line.salePrice;
        if (line.cost === 0) sum.zeroCostCount += 1;
        return sum;
      },
      { totalCost: 0, totalSale: 0, zeroCostCount: 0 }
    );
    return {
      ...totals,
      totalMargin: totals.totalSale - totals.totalCost,
      lines: filteredCustomerLineDetails.length,
    };
  }, [filteredCustomerLineDetails]);

  return (
    <div className="app-shell">
      <nav className="sticky top-0 z-30 border-b border-[#d6e4ff] bg-[rgba(255,255,255,0.9)] px-6 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 text-sm text-[#4b6292]">
          <CurrentOrgBadge />
          {isSuperadmin ? (
            <div className="flex items-center gap-1.5 rounded-xl border border-[#cbe0ff] bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setViewMode("store")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  viewMode === "store"
                    ? "bg-[#2563eb] text-white shadow-sm"
                    : "text-[#29477e] hover:bg-[#eaf2ff]"
                }`}
              >
                🏬 Tienda / Organización
              </button>
              <button
                type="button"
                onClick={() => setViewMode("superadmin")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  viewMode === "superadmin"
                    ? "bg-[#2563eb] text-white shadow-sm"
                    : "text-[#29477e] hover:bg-[#eaf2ff]"
                }`}
              >
                🌐 Super Admin SaaS
              </button>
            </div>
          ) : (
            <span>Organization Dashboard</span>
          )}
        </div>
      </nav>

      <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-6 px-6 py-10">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-[#0f1f3d]">
                {viewMode === "store" ? "Dashboard" : "Super Admin Dashboard"}
              </h1>
              <p className="text-sm text-[#5f7298]">
                {viewMode === "store"
                  ? "Live organization analytics for inventory, sales, customers, and model performance."
                  : "Super Admin command center for app growth, billing, subscriptions, and user activity."}
              </p>
            </div>
            {isSuperadmin && (
              <div className="inline-flex rounded-xl border border-[#cbe0ff] bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setViewMode("store")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    viewMode === "store"
                      ? "bg-[#2563eb] text-white shadow-sm"
                      : "text-[#29477e] hover:bg-[#f0f6ff]"
                  }`}
                >
                  🏬 Tienda
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("superadmin")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    viewMode === "superadmin"
                      ? "bg-[#2563eb] text-white shadow-sm"
                      : "text-[#29477e] hover:bg-[#f0f6ff]"
                  }`}
                >
                  🌐 Super Admin
                </button>
              </div>
            )}
          </header>

          {adminDeniedNotice && (
            <div className="rounded-xl border border-[#fed7aa] bg-[#fff7ed] px-4 py-3 text-sm text-[#9a3412]">
              Access restricted: this account does not have Super Admin permissions for that page.
            </div>
          )}

          {loading && <p className="text-sm text-[#5f7298]">Loading dashboard metrics...</p>}

          {error && (
            <div className="rounded-xl border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm text-[#9f1239]">
              {error}
            </div>
          )}

          {!loading && isSuperadmin && viewMode === "superadmin" && superadminPayload && (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <article className={cardClass}>
                  <p className="text-xs uppercase tracking-[0.16em] text-[#4b6292]">MRR</p>
                  <p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">{formatCurrencyDisplay(superadminPayload.metrics.mrrCents / 100)}</p>
                  <p className="mt-1 text-xs text-[#5f7298]">From active subscriptions</p>
                </article>
                <article className={cardClass}>
                  <p className="text-xs uppercase tracking-[0.16em] text-[#4b6292]">Organizations</p>
                  <p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">{formatInteger(superadminPayload.metrics.organizationsTotal)}</p>
                  <p className="mt-1 text-xs text-[#5f7298]">{superadminPayload.metrics.organizationsActive} active • {superadminPayload.metrics.organizationsSuspended} suspended</p>
                </article>
                <article className={cardClass}>
                  <p className="text-xs uppercase tracking-[0.16em] text-[#4b6292]">Users</p>
                  <p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">{formatInteger(superadminPayload.metrics.usersTotal)}</p>
                  <p className="mt-1 text-xs text-[#5f7298]">{superadminPayload.metrics.usersActive} active • {superadminPayload.metrics.usersInactive} inactive</p>
                </article>
                <article className={cardClass}>
                  <p className="text-xs uppercase tracking-[0.16em] text-[#4b6292]">New (30 days)</p>
                  <p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">{formatInteger(superadminPayload.metrics.newOrganizationsLast30Days)}</p>
                  <p className="mt-1 text-xs text-[#5f7298]">orgs • {formatInteger(superadminPayload.metrics.newUsersLast30Days)} users</p>
                </article>
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <article className={cardClass}>
                  <h2 className="text-lg font-semibold text-[#0f1f3d]">Revenue by Month</h2>
                  <div className="mt-4">
                    <HorizontalBars
                      items={superadminMonthlyItems.map((item) => ({ month: item.label, amount: item.value }))}
                      valueKey="amount"
                      labelKey="month"
                      formatter={(value) => formatCurrencyDisplay(value)}
                    />
                  </div>
                </article>

                <article className={cardClass}>
                  <h2 className="text-lg font-semibold text-[#0f1f3d]">Active Subscriptions by Plan</h2>
                  <div className="mt-4">
                    <HorizontalBars
                      items={superadminPlanItems.map((item) => ({ plan: item.label, count: item.value }))}
                      valueKey="count"
                      labelKey="plan"
                      formatter={(value) => formatInteger(value)}
                    />
                  </div>
                </article>
              </section>
            </>
          )}

          {!loading && viewMode === "store" && payload && (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <article className={cardClass}>
                  <p className="text-xs uppercase tracking-[0.16em] text-[#4b6292]">Inventory Cost</p>
                  <p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">{formatCurrencyDisplay(payload.metrics.inventoryCost)}</p>
                  <p className="mt-1 text-xs text-[#5f7298]">{formatInteger(payload.metrics.availableUnits)} available units</p>
                </article>
                <article className={cardClass}>
                  <p className="text-xs uppercase tracking-[0.16em] text-[#4b6292]">Sold Revenue</p>
                  <p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">{formatCurrencyDisplay(payload.metrics.soldRevenue)}</p>
                  <p className="mt-1 text-xs text-[#5f7298]">{formatInteger(payload.metrics.ordersCount)} total sales</p>
                </article>
                <article className={cardClass}>
                  <p className="text-xs uppercase tracking-[0.16em] text-[#4b6292]">Gross Profit</p>
                  <p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">{formatCurrencyDisplay(payload.metrics.grossProfit)}</p>
                  <p className="mt-1 text-xs text-[#5f7298]">Avg ticket {formatCurrencyDisplay(payload.metrics.averageTicket)}</p>
                </article>
                <article className={cardClass}>
                  <p className="text-xs uppercase tracking-[0.16em] text-[#4b6292]">Gross Margin %</p>
                  <p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">{grossMarginPercent.toFixed(1)}%</p>
                  <p className="mt-1 text-xs text-[#5f7298]">Sell-through {payload.metrics.sellThroughRate}%</p>
                </article>
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <article className={cardClass}>
                  <div className="overflow-hidden rounded-[1.4rem] border border-[#d7e6ff] bg-[radial-gradient(circle_at_top_left,#ffffff,rgba(237,245,255,0.96)_44%,rgba(224,239,255,0.92))] p-5 shadow-[0_18px_45px_rgba(37,99,235,0.12)]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold text-[#0f1f3d]">Sales by Date</h2>
                        <p className="mt-1 text-xs text-[#5f7298]">Choose a range to update the chart, revenue, margin, and orders together.</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#4b6292]">
                          From
                          <input
                            type="date"
                            value={dateFrom}
                            max={dateTo}
                            onChange={(event) => setDateFrom(event.target.value)}
                            className="rounded-xl border border-[#c8dafd] bg-white px-3 py-2 text-sm font-medium text-[#0f1f3d] outline-none focus:border-[#2563eb]"
                          />
                        </label>
                        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#4b6292]">
                          To
                          <input
                            type="date"
                            value={dateTo}
                            min={dateFrom}
                            onChange={(event) => setDateTo(event.target.value)}
                            className="rounded-xl border border-[#c8dafd] bg-white px-3 py-2 text-sm font-medium text-[#0f1f3d] outline-none focus:border-[#2563eb]"
                          />
                        </label>
                        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#4b6292]">
                          Customer Type
                          <select
                            value={customerTypeFilter}
                            onChange={(event) =>
                              setCustomerTypeFilter(event.target.value as "all" | "retail" | "wholesale")
                            }
                            className="rounded-xl border border-[#c8dafd] bg-white px-3 py-2 text-sm font-medium text-[#0f1f3d] outline-none focus:border-[#2563eb]"
                          >
                            <option value="all">All</option>
                            <option value="retail">Retail</option>
                            <option value="wholesale">Wholesale</option>
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-[#d6e4ff] bg-white/80 p-4 backdrop-blur">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4b6292]">Revenue</p>
                        <p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">{formatCurrencyDisplay(payload.salesRangeSummary.revenue)}</p>
                        <p className="mt-1 text-xs text-[#5f7298]">Filtered range total</p>
                      </div>
                      <div className="rounded-2xl border border-[#d6e4ff] bg-white/80 p-4 backdrop-blur">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4b6292]">Margin</p>
                        <p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">{formatCurrencyDisplay(payload.salesRangeSummary.profit)}</p>
                        <p className="mt-1 text-xs text-[#5f7298]">Revenue minus cost</p>
                      </div>
                      <div className="rounded-2xl border border-[#d6e4ff] bg-white/80 p-4 backdrop-blur">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4b6292]">Orders</p>
                        <p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">{formatInteger(payload.salesRangeSummary.orders)}</p>
                        <p className="mt-1 text-xs text-[#5f7298]">Transactions in range</p>
                      </div>
                    </div>

                    <div className="mt-5 rounded-2xl border border-[#d6e4ff] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(244,249,255,0.95))] p-4">
                      <div className="mb-3 flex items-center justify-between text-xs text-[#5f7298]">
                        <span>{payload.salesRangeSummary.from}</span>
                        <span>{payload.salesRangeSummary.to}</span>
                      </div>
                      <div className="h-56">
                        <div className="flex h-full items-end gap-1.5">
                      {payload.salesByDate.map((point, index) => {
                        const heightPercent = Math.max(3, (point.revenue / salesChartMax) * 100);
                        const profitHeightPercent = Math.max(3, (Math.abs(point.profit) / salesChartProfitMax) * 100);
                        const showLabel =
                          payload.salesByDate.length <= 12 ||
                          index === 0 ||
                          index === payload.salesByDate.length - 1 ||
                          index % Math.max(1, Math.ceil(payload.salesByDate.length / 6)) === 0;
                        return (
                          <div key={point.date} className="flex flex-1 flex-col items-center justify-end gap-1">
                            <div className="flex h-full w-full items-end justify-center gap-[3px]">
                              <div
                                className="w-full rounded-t-[10px] bg-gradient-to-t from-[#2563eb] via-[#3b82f6] to-[#8b5cf6] shadow-[0_10px_24px_rgba(37,99,235,0.22)]"
                                style={{ height: `${heightPercent}%` }}
                                title={`${point.label} • Revenue ${formatCurrencyDisplay(point.revenue)} • Margin ${formatCurrencyDisplay(point.profit)} • ${point.orders} orders`}
                              />
                              <div
                                className="w-full rounded-t-[10px] bg-gradient-to-t from-[#10b981] to-[#34d399] shadow-[0_10px_24px_rgba(16,185,129,0.18)]"
                                style={{ height: `${profitHeightPercent}%` }}
                                title={`${point.label} • Margin ${formatCurrencyDisplay(point.profit)}`}
                              />
                            </div>
                            <span className="mt-1 text-[10px] text-[#4b6292]">{showLabel ? point.label : ""}</span>
                          </div>
                        );
                      })}
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-4 text-xs font-medium text-[#29477e]">
                        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#3b82f6]" />Revenue</span>
                        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />Margin</span>
                      </div>
                    </div>
                  </div>
                </article>

                <article className={cardClass}>
                  <h2 className="text-lg font-semibold text-[#0f1f3d]">Revenue and Margin by Customer</h2>
                  <p className="mt-1 text-xs text-[#5f7298]">Compare top customers by sales value and profit quality.</p>
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#4b6292]">Revenue</p>
                      <HorizontalBars
                        items={payload.salesByCustomer as Array<Record<string, string | number>>}
                        valueKey="revenue"
                        labelKey="customer"
                        formatter={(value) => formatCurrencyDisplay(value)}
                      />
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#4b6292]">Margin</p>
                      <HorizontalBars
                        items={payload.salesByCustomer as Array<Record<string, string | number>>}
                        valueKey="profit"
                        labelKey="customer"
                        formatter={(value) => formatCurrencyDisplay(value)}
                      />
                    </div>
                  </div>
                  <div className="mt-4 space-y-2 text-xs text-[#29477e]">
                    {payload.salesByCustomer.slice(0, 6).map((entry) => (
                      <div key={`${entry.customer}-margin`} className="flex items-center justify-between rounded-lg border border-[#d6e4ff] bg-[#f7faff] px-3 py-2">
                        <span className="truncate">{entry.customer}</span>
                        <span className="font-semibold">{entry.marginPercent.toFixed(1)}%</span>
                      </div>
                    ))}
                    {payload.salesByCustomer.length === 0 && <p className="text-sm text-[#5f7298]">No customer margin data yet.</p>}
                  </div>
                </article>
              </section>

              <section className="rounded-2xl border border-[#d6e4ff] bg-white p-6">
                <h2 className="text-lg font-semibold text-[#0f1f3d]">Margin by Date</h2>
                <p className="mt-1 text-xs text-[#5f7298]">Track daily margin trend inside the selected date range.</p>
                <div className="mt-4 h-48 rounded-2xl border border-[#d6e4ff] bg-[#f7faff] p-3">
                  <div className="flex h-full items-end gap-1.5">
                    {payload.marginByDate.map((point, index) => {
                      const heightPercent = Math.max(3, (Math.abs(point.margin) / marginByDateMax) * 100);
                      const showLabel =
                        payload.marginByDate.length <= 12 ||
                        index === 0 ||
                        index === payload.marginByDate.length - 1 ||
                        index % Math.max(1, Math.ceil(payload.marginByDate.length / 6)) === 0;
                      return (
                        <div key={point.date} className="flex flex-1 flex-col items-center justify-end gap-1">
                          <div
                            className={`w-full rounded-t-[10px] ${point.margin >= 0 ? "bg-gradient-to-t from-[#10b981] to-[#34d399]" : "bg-gradient-to-t from-[#e11d48] to-[#fb7185]"}`}
                            style={{ height: `${heightPercent}%` }}
                            title={`${point.label} • Margin ${formatCurrencyDisplay(point.margin)} • Revenue ${formatCurrencyDisplay(point.revenue)}`}
                          />
                          <span className="text-[10px] text-[#4b6292]">{showLabel ? point.label : ""}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <article className={cardClass}>
                  <h2 className="text-lg font-semibold text-[#0f1f3d]">Revenue Mix by Customer Type</h2>
                  <p className="mt-1 text-xs text-[#5f7298]">Finance-style segmentation view for retail, wholesale, and walk-in revenue quality.</p>
                  <div className="mt-4 space-y-3">
                    {payload.customerTypeMix.map((entry) => {
                      const label = entry.type === "walk_in" ? "Walk-in" : entry.type === "wholesale" ? "Wholesale" : "Retail";
                      const width = Math.max(6, Math.round((entry.revenue / customerTypeMixMaxRevenue) * 100));
                      return (
                        <div key={entry.type} className="rounded-xl border border-[#d6e4ff] bg-[#f7faff] p-3">
                          <div className="flex items-center justify-between text-sm text-[#29477e]">
                            <span className="font-semibold">{label}</span>
                            <span>{formatCurrencyDisplay(entry.revenue)}</span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-[#e4efff]">
                            <div className="h-2 rounded-full bg-gradient-to-r from-[#2563eb] to-[#14b8a6]" style={{ width: `${width}%` }} />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-[#5f7298]">
                            <span>Orders {formatInteger(entry.orders)}</span>
                            <span>Margin {entry.marginPercent.toFixed(1)}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>

                <article className={cardClass}>
                  <h2 className="text-lg font-semibold text-[#0f1f3d]">Top Customers Finance Table</h2>
                  <p className="mt-1 text-xs text-[#5f7298]">Revenue, margin, and margin-rate side by side for fast prioritization.</p>
                  <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-[#d6e4ff]">
                    <table className="min-w-full text-left text-xs">
                      <thead className="sticky top-0 bg-[#f0f6ff] text-[#29477e]">
                        <tr>
                          <th className="px-3 py-2">Customer</th>
                          <th className="px-3 py-2">Revenue</th>
                          <th className="px-3 py-2">Margin</th>
                          <th className="px-3 py-2">Margin %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payload.salesByCustomer.map((entry) => (
                          <tr key={`${entry.customer}-finance-row`} className="border-t border-[#e4efff]">
                            <td className="px-3 py-2 text-[#0f1f3d]">{entry.customer}</td>
                            <td className="px-3 py-2 text-[#29477e]">{formatCurrencyDisplay(entry.revenue)}</td>
                            <td className="px-3 py-2 text-[#29477e]">{formatCurrencyDisplay(entry.profit)}</td>
                            <td className="px-3 py-2 font-semibold text-[#0f1f3d]">{entry.marginPercent.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              </section>

              <section className="grid gap-6 xl:grid-cols-3">
                <article className={cardClass}>
                  <h2 className="text-lg font-semibold text-[#0f1f3d]">Top Models Sold</h2>
                  <p className="mt-1 text-xs text-[#5f7298]">Best-selling devices by units sold.</p>
                  <div className="mt-4 space-y-3">
                    {payload.topModels.length === 0 ? (
                      <p className="text-sm text-[#5f7298]">No sales data yet.</p>
                    ) : (
                      payload.topModels.map((item, index) => (
                        <div key={`${item.model}-${index}`} className="rounded-xl border border-[#d6e4ff] bg-[#f7faff] p-3">
                          <p className="font-medium text-[#0f1f3d]">{item.model}</p>
                          <p className="text-xs text-[#5f7298]">
                            {item.units} sold • Revenue {formatCurrencyDisplay(item.revenue)} • Profit {formatCurrencyDisplay(item.profit)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </article>

                <article className={cardClass}>
                  <h2 className="text-lg font-semibold text-[#0f1f3d]">Inventory by Status</h2>
                  <p className="mt-1 text-xs text-[#5f7298]">Current stock distribution snapshot.</p>
                  <div className="mt-4">
                    <HorizontalBars
                      items={payload.inventoryByStatus as Array<Record<string, string | number>>}
                      valueKey="count"
                      labelKey="status"
                      formatter={(value) => formatInteger(value)}
                    />
                  </div>
                </article>

                <article className={cardClass}>
                  <h2 className="text-lg font-semibold text-[#0f1f3d]">Inventory Aging</h2>
                  <p className="mt-1 text-xs text-[#5f7298]">How long available devices have been in stock.</p>
                  <div className="mt-4">
                    <HorizontalBars
                      items={payload.inventoryAging as Array<Record<string, string | number>>}
                      valueKey="count"
                      labelKey="bucket"
                      formatter={(value) => formatInteger(value)}
                    />
                  </div>
                </article>
              </section>

              <section className="rounded-2xl border border-[#d6e4ff] bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-[#0f1f3d]">Customer Deep Dive</h2>
                    <p className="mt-1 text-xs text-[#5f7298]">Inspect every sold line with cost, sold price, and margin to catch anomalies like zero-cost devices.</p>
                  </div>
                  <select
                    value={selectedCustomerDetail}
                    onChange={(event) => setSelectedCustomerDetail(event.target.value)}
                    className="rounded-xl border border-[#c8dafd] bg-white px-3 py-2 text-sm font-medium text-[#0f1f3d] outline-none focus:border-[#2563eb]"
                  >
                    <option value="all">All customers</option>
                    {customerDetailOptions.map((customer) => (
                      <option key={customer} value={customer}>
                        {customer}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-[#d6e4ff] bg-[#f7faff] p-3 text-sm text-[#29477e]">
                    Lines: <span className="font-semibold">{formatInteger(customerDetailSummary.lines)}</span>
                  </div>
                  <div className="rounded-xl border border-[#d6e4ff] bg-[#f7faff] p-3 text-sm text-[#29477e]">
                    Cost: <span className="font-semibold">{formatCurrencyDisplay(customerDetailSummary.totalCost)}</span>
                  </div>
                  <div className="rounded-xl border border-[#d6e4ff] bg-[#f7faff] p-3 text-sm text-[#29477e]">
                    Sold: <span className="font-semibold">{formatCurrencyDisplay(customerDetailSummary.totalSale)}</span>
                  </div>
                  <div className={`rounded-xl border p-3 text-sm ${customerDetailSummary.zeroCostCount > 0 ? "border-[#fda4af] bg-[#fff1f2] text-[#9f1239]" : "border-[#d6e4ff] bg-[#f7faff] text-[#29477e]"}`}>
                    Cost = 0 lines: <span className="font-semibold">{formatInteger(customerDetailSummary.zeroCostCount)}</span>
                  </div>
                </div>

                <div className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-[#d6e4ff]">
                  <table className="min-w-full text-left text-xs">
                    <thead className="sticky top-0 bg-[#f0f6ff] text-[#29477e]">
                      <tr>
                        <th className="px-3 py-2">Sale</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Customer</th>
                        <th className="px-3 py-2">Device</th>
                        <th className="px-3 py-2">IMEI</th>
                        <th className="px-3 py-2">Cost</th>
                        <th className="px-3 py-2">Sold</th>
                        <th className="px-3 py-2">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomerLineDetails.map((line, index) => (
                        <tr
                          key={`${line.saleNumber}-${line.imei}-${index}`}
                          className={`border-t ${line.cost === 0 ? "border-[#fecdd3] bg-[#fff1f2]" : "border-[#e4efff]"}`}
                        >
                          <td className="px-3 py-2 text-[#0f1f3d]">{line.saleNumber}</td>
                          <td className="px-3 py-2 text-[#29477e]">{new Date(line.soldAt).toLocaleDateString()}</td>
                          <td className="px-3 py-2 text-[#29477e]">{line.customer}</td>
                          <td className="px-3 py-2 text-[#29477e]">{line.model} {line.capacity} {line.color}</td>
                          <td className="px-3 py-2 text-[#29477e]">{line.imei}</td>
                          <td className={`px-3 py-2 ${line.cost === 0 ? "font-semibold text-[#be123c]" : "text-[#29477e]"}`}>
                            {formatCurrencyDisplay(line.cost)}
                          </td>
                          <td className="px-3 py-2 text-[#29477e]">{formatCurrencyDisplay(line.salePrice)}</td>
                          <td className={`px-3 py-2 font-semibold ${line.margin >= 0 ? "text-[#0f1f3d]" : "text-[#be123c]"}`}>
                            {formatCurrencyDisplay(line.margin)}
                          </td>
                        </tr>
                      ))}
                      {filteredCustomerLineDetails.length === 0 && (
                        <tr>
                          <td className="px-3 py-6 text-center text-[#5f7298]" colSpan={8}>
                            No line details for this selection.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-2xl border border-[#d6e4ff] bg-white p-6">
                <h2 className="text-lg font-semibold text-[#0f1f3d]">Quick Insights</h2>
                <div className="mt-3 grid gap-3 text-sm text-[#29477e] md:grid-cols-3">
                  <div className="rounded-xl bg-[#f3f8ff] p-3">
                    Best day: <span className="font-semibold">{payload.insights.bestSalesDay}</span>
                    <br />
                    Revenue: <span className="font-semibold">{formatCurrencyDisplay(payload.insights.bestSalesDayRevenue)}</span>
                  </div>
                  <div className="rounded-xl bg-[#f3f8ff] p-3">
                    Top customer: <span className="font-semibold">{payload.insights.topCustomer}</span>
                    <br />
                    Revenue: <span className="font-semibold">{formatCurrencyDisplay(payload.insights.topCustomerRevenue)}</span>
                  </div>
                  <div className="rounded-xl bg-[#f3f8ff] p-3">
                    Top model: <span className="font-semibold">{payload.insights.topModel}</span>
                    <br />
                    Units sold: <span className="font-semibold">{formatInteger(payload.insights.topModelUnits)}</span>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-[#d6e4ff] bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-[#0f1f3d]">Available Inventory</h2>
                    <p className="text-xs text-[#5f7298]">
                      Available inventory cost and projected revenue at different price tiers
                    </p>
                  </div>
                  <div className="inline-flex rounded-full border border-[#c9dcff] bg-[#f3f8ff] p-1">
                    {([
                      { key: "price", label: "Price" },
                      { key: "price2", label: "Price 2" },
                      { key: "price3", label: "Price 3" },
                    ] as Array<{ key: PriceTierKey; label: string }>).map((tier) => {
                      const isActive = selectedTier === tier.key;
                      return (
                        <button
                          key={tier.key}
                          type="button"
                          onClick={() => setSelectedTier(tier.key)}
                          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                            isActive
                              ? "bg-[#0f1f3d] text-white"
                              : "text-[#29477e] hover:bg-[#eaf2ff]"
                          }`}
                        >
                          {tier.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <article className="rounded-xl border border-[#d6e4ff] bg-[#f7faff] p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-[#4b6292]">Available Inventory Cost</p>
                    <p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">
                      {formatCurrencyDisplay(availableInventoryCost)}
                    </p>
                  </article>

                  <article className="rounded-xl border border-[#d6e4ff] bg-[#f7faff] p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-[#4b6292]">
                      Available Inventory Revenue ({selectedTierScenario?.label ?? "Price"})
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">
                      {formatCurrencyDisplay(availableProjectedRevenue)}
                    </p>
                  </article>

                  <article className="rounded-xl border border-[#d6e4ff] bg-[#f7faff] p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-[#4b6292]">Available Inventory Margin</p>
                    <p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">
                      {formatCurrencyDisplay(availableInventoryMargin)}
                    </p>
                    <p className="mt-1 text-xs text-[#5f7298]">
                      {availableInventoryMarginPercent}% margin
                    </p>
                  </article>

                  <article className="rounded-xl border border-[#d6e4ff] bg-[#f7faff] p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-[#4b6292]">Potential Gain vs Cost</p>
                    <p className={`mt-2 text-2xl font-semibold ${
                      availableInventoryMargin >= 0 ? "text-[#0f1f3d]" : "text-[#be123c]"
                    }`}>
                      {availableInventoryMargin >= 0 ? "+" : "-"}
                      {formatCurrencyDisplay(Math.abs(availableInventoryMargin))}
                    </p>
                    <p className="mt-1 text-xs text-[#5f7298]">
                      If all available inventory sold at {selectedTierScenario?.label?.toLowerCase()}
                    </p>
                  </article>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

