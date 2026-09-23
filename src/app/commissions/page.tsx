"use client";

import { useEffect, useMemo, useState } from "react";
import AppSidebar from "@/components/AppSidebar";
import CurrentOrgBadge from "@/components/CurrentOrgBadge";
import { formatCurrencyDisplay } from "@/lib/display-format";
import { CommissionApplicationService } from "@ireader/application";
import type { CommissionRule, CommissionType, CommissionScope } from "@ireader/contracts";

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
  customer: string;
  customerEmail: string;
  customerWhatsapp: string;
  paymentMethod: string;
  notes: string;
  soldBy: string;
  lines: SaleLine[];
};

const money = (value: number) => formatCurrencyDisplay(Math.round(value));

const parseMoney = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function WebCommissionsPage() {
  const service = useMemo(() => new CommissionApplicationService(), []);

  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [canAccess, setCanAccess] = useState(false);
  const [activeTab, setActiveTab] = useState<"summary" | "rules">("summary");
  const [sellerFilter, setSellerFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");

  // Verify access permissions: admin and superadmin (or canManageCommissions) allowed; staff denied
  useEffect(() => {
    let cancelled = false;
    const verifyAccess = async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) {
            setCanAccess(false);
            setCheckingAuth(false);
          }
          return;
        }
        const data = await res.json();
        const isSuper = Boolean(data?.session?.isSuperadmin);
        const role = data?.role || data?.session?.role;
        const hasPerm = data?.permissions?.canManageCommissions === true;
        const allowed = isSuper || role === "superadmin" || role === "admin" || hasPerm;
        if (!cancelled) {
          setCanAccess(allowed);
          setCheckingAuth(false);
        }
      } catch {
        if (!cancelled) {
          setCanAccess(false);
          setCheckingAuth(false);
        }
      }
    };
    verifyAccess();
    return () => {
      cancelled = true;
    };
  }, []);

  // Rules state (initialized from default or local storage)
  const [rules, setRules] = useState<CommissionRule[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("web_commission_rules");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {
        // Fallback to default
      }
    }
    return [
      {
        id: "rule-iphone-fixed",
        name: "iPhone ($300 MXN por equipo)",
        scope: "category",
        target: "iphone",
        type: "fixed_per_unit",
        fixedAmount: 300,
        enabled: true,
      },
      {
        id: "rule-ipad-fixed",
        name: "iPad ($200 MXN por equipo)",
        scope: "category",
        target: "ipad",
        type: "fixed_per_unit",
        fixedAmount: 200,
        enabled: true,
      },
      {
        id: "rule-mac-fixed",
        name: "MacBook / iMac ($400 MXN por equipo)",
        scope: "category",
        target: "mac",
        type: "fixed_per_unit",
        fixedAmount: 400,
        enabled: true,
      },
      {
        id: "rule-watch-fixed",
        name: "Apple Watch ($150 MXN por equipo)",
        scope: "category",
        target: "watch",
        type: "fixed_per_unit",
        fixedAmount: 150,
        enabled: true,
      },
      {
        id: "rule-acc-margin",
        name: "Accesorios (10% del margen)",
        scope: "category",
        target: "accessories",
        type: "percent_margin",
        percentage: 10,
        enabled: true,
      },
      {
        id: "rule-global-fallback",
        name: "Regla General Base (5% margen)",
        scope: "global",
        type: "percent_margin",
        percentage: 5,
        enabled: true,
      },
    ];
  });

  // Persist rules to local storage
  useEffect(() => {
    try {
      localStorage.setItem("web_commission_rules", JSON.stringify(rules));
    } catch {
      // ignore
    }
  }, [rules]);

  // Load sales from backend API only if permitted
  const loadSales = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/sales");
      if (!res.ok) {
        throw new Error(`Error al consultar ventas: ${res.statusText}`);
      }
      const data = await res.json();
      setSales(Array.isArray(data.sales) ? data.sales : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando historial de ventas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess) {
      loadSales();
    }
  }, [canAccess]);

  // Filter sales based on date and seller
  const filteredSales = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = new Date(startOfToday - now.getDay() * 24 * 60 * 60 * 1000).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return sales.filter((s) => {
      // Date filter
      if (dateFilter !== "all") {
        const soldTime = new Date(s.soldAt).getTime();
        if (dateFilter === "today" && soldTime < startOfToday) return false;
        if (dateFilter === "week" && soldTime < startOfWeek) return false;
        if (dateFilter === "month" && soldTime < startOfMonth) return false;
      }

      // Seller filter
      if (sellerFilter !== "all") {
        const currentSeller = s.soldBy?.trim() || "Mostrador General";
        if (currentSeller !== sellerFilter) return false;
      }

      return true;
    });
  }, [sales, dateFilter, sellerFilter]);

  // Unique sellers list
  const uniqueSellers = useMemo(() => {
    const set = new Set<string>();
    for (const s of sales) {
      if (s.soldBy?.trim()) set.add(s.soldBy.trim());
    }
    return Array.from(set).sort();
  }, [sales]);

  // Dynamic Commission calculation for each sale line
  const salesWithCommissions = useMemo(() => {
    return filteredSales.map((sale) => {
      const itemsForCalc = sale.lines.map((l) => ({
        id: l.id || l.imei,
        model: l.model || "",
        category: l.model?.toLowerCase().includes("ipad")
          ? "ipad"
          : l.model?.toLowerCase().includes("mac")
          ? "mac"
          : l.model?.toLowerCase().includes("watch")
          ? "watch"
          : l.model?.toLowerCase().includes("airpod") || l.model?.toLowerCase().includes("case") || l.model?.toLowerCase().includes("cargador")
          ? "accessories"
          : "iphone",
        salePrice: parseMoney(l.salePrice),
        costPrice: parseMoney(l.costPesos),
        costPesos: l.costPesos,
        inventoryItem: {
          id: l.id || l.imei,
          model: l.model || "Dispositivo",
          imei: l.imei,
          costPesos: l.costPesos,
          price: parseMoney(l.salePrice),
          status: l.status,
        } as any,
        quantity: 1,
      }));

      const sellerName = sale.soldBy?.trim() || "Mostrador General";
      const summary = service.calculateSaleCommissions(
        itemsForCalc,
        rules,
        { id: sellerName, name: sellerName }
      );

      return {
        ...sale,
        totalSale: summary.totalSale,
        totalCost: summary.totalCost,
        totalMargin: summary.totalMargin,
        totalCommission: summary.totalCommission,
        itemCalculations: summary.items,
      };
    });
  }, [filteredSales, rules, service]);

  // Aggregate by seller
  const sellerSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        sellerName: string;
        salesCount: number;
        unitsSold: number;
        grossRevenue: number;
        grossMargin: number;
        commissionsEarned: number;
      }
    >();

    for (const item of salesWithCommissions) {
      const seller = item.soldBy?.trim() || "Mostrador General";
      const existing = map.get(seller) || {
        sellerName: seller,
        salesCount: 0,
        unitsSold: 0,
        grossRevenue: 0,
        grossMargin: 0,
        commissionsEarned: 0,
      };

      existing.salesCount += 1;
      existing.unitsSold += item.lines.length;
      existing.grossRevenue += item.totalSale;
      existing.grossMargin += item.totalMargin;
      existing.commissionsEarned += item.totalCommission;

      map.set(seller, existing);
    }

    return Array.from(map.values()).sort((a, b) => b.commissionsEarned - a.commissionsEarned);
  }, [salesWithCommissions]);

  // Overall totals
  const overallTotals = useMemo(() => {
    return salesWithCommissions.reduce(
      (acc, s) => {
        acc.commissions += s.totalCommission;
        acc.revenue += s.totalSale;
        acc.margin += s.totalMargin;
        acc.units += s.lines.length;
        return acc;
      },
      { commissions: 0, revenue: 0, margin: 0, units: 0 }
    );
  }, [salesWithCommissions]);

  // Rule toggle helper
  const toggleRule = (ruleId: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r))
    );
  };

  // Rule removal helper
  const deleteRule = (ruleId: string) => {
    if (confirm("¿Seguro que deseas eliminar esta regla de comisión?")) {
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    }
  };

  // Reset rules to default
  const resetToDefaults = () => {
    if (confirm("¿Restaurar las reglas predeterminadas de comisión?")) {
      setRules([
        {
          id: "rule-iphone-fixed",
          name: "iPhone ($300 MXN por equipo)",
          scope: "category",
          target: "iphone",
          type: "fixed_per_unit",
          fixedAmount: 300,
          priority: 10,
          enabled: true,
        },
        {
          id: "rule-ipad-fixed",
          name: "iPad ($200 MXN por equipo)",
          scope: "category",
          target: "ipad",
          type: "fixed_per_unit",
          fixedAmount: 200,
          priority: 10,
          enabled: true,
        },
        {
          id: "rule-mac-fixed",
          name: "MacBook / iMac ($400 MXN por equipo)",
          scope: "category",
          target: "mac",
          type: "fixed_per_unit",
          fixedAmount: 400,
          priority: 10,
          enabled: true,
        },
        {
          id: "rule-watch-fixed",
          name: "Apple Watch ($150 MXN por equipo)",
          scope: "category",
          target: "watch",
          type: "fixed_per_unit",
          fixedAmount: 150,
          priority: 10,
          enabled: true,
        },
        {
          id: "rule-acc-margin",
          name: "Accesorios (10% del margen)",
          scope: "category",
          target: "accessories",
          type: "percent_margin",
          percentage: 10,
          priority: 10,
          enabled: true,
        },
        {
          id: "rule-global-fallback",
          name: "Regla General Base (5% margen)",
          scope: "global",
          type: "percent_margin",
          percentage: 5,
          priority: 1,
          enabled: true,
        },
      ]);
    }
  };

  // New Rule Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleScope, setNewRuleScope] = useState<CommissionScope>("category");
  const [newRuleTarget, setNewRuleTarget] = useState("");
  const [newRuleType, setNewRuleType] = useState<CommissionType>("fixed_per_unit");
  const [newRuleFixedAmount, setNewRuleFixedAmount] = useState("300");
  const [newRulePercentage, setNewRulePercentage] = useState("10");

  const handleCreateRule = () => {
    if (!newRuleName.trim()) return;

    const newRule: CommissionRule = {
      id: `rule-${Date.now()}`,
      name: newRuleName.trim(),
      scope: newRuleScope,
      target: newRuleScope !== "global" ? newRuleTarget.trim().toLowerCase() : undefined,
      type: newRuleType,
      priority: newRuleScope === "model" ? 100 : newRuleScope === "category" ? 10 : 1,
      fixedAmount:
        newRuleType === "fixed_per_unit" || newRuleType === "combined"
          ? Number(newRuleFixedAmount) || 0
          : undefined,
      percentage:
        newRuleType === "percent_margin" ||
        newRuleType === "percent_price" ||
        newRuleType === "combined"
          ? Number(newRulePercentage) || 0
          : undefined,
      enabled: true,
    };

    setRules((prev) => [newRule, ...prev]);
    setIsModalOpen(false);
    setNewRuleName("");
    setNewRuleTarget("");
  };

  if (checkingAuth) {
    return (
      <div className="app-shell">
        <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-4 py-3 backdrop-blur md:px-6">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 text-sm text-[#5c4332]">
            <CurrentOrgBadge />
          </div>
        </nav>
        <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
          <AppSidebar pathname="/commissions" />
          <main className="flex min-w-0 flex-col items-center justify-center p-16">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2563eb] border-t-transparent" />
              <p className="text-sm font-medium text-slate-500">Verificando permisos de acceso...</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="app-shell">
        <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-4 py-3 backdrop-blur md:px-6">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 text-sm text-[#5c4332]">
            <CurrentOrgBadge />
          </div>
        </nav>
        <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
          <AppSidebar pathname="/commissions" />
          <main className="flex min-w-0 flex-col items-center justify-center p-8 md:p-16">
            <div className="max-w-md w-full rounded-2xl border border-red-200 bg-white p-8 text-center shadow-lg">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 mb-4 text-2xl font-bold">
                🔒
              </div>
              <h2 className="text-xl font-bold text-slate-900">Acceso Denegado</h2>
              <p className="mt-2 text-sm text-slate-600">
                La gestión y visualización de comisiones está reservada exclusivamente para <strong>Administradores</strong> y <strong>Superadministradores</strong>. El rol Staff no cuenta con acceso a este módulo.
              </p>
              <div className="mt-6">
                <a
                  href="/dashboard"
                  className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#2563eb] to-[#0ea5e9] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 transition"
                >
                  Volver al Dashboard
                </a>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Top Navbar */}
      <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 text-sm text-[#5c4332]">
          <CurrentOrgBadge />
        </div>
      </nav>

      <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
        <AppSidebar pathname="/commissions" />

        <main className="flex min-w-0 flex-col gap-5 px-4 py-6 md:gap-6 md:px-6 md:py-10">
          {/* Header */}
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#1f1a16] md:text-3xl">
                Gestión de Comisiones
              </h1>
              <p className="text-sm text-[#6a4d3a]">
                Cálculo configurable por equipo vendido, porcentaje de margen de utilidad o ventas totales.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Segmented Tab Pill */}
              <div className="inline-flex rounded-full border border-[#d6e4ff] bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setActiveTab("summary")}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                    activeTab === "summary"
                      ? "bg-gradient-to-r from-[#2563eb] to-[#0ea5e9] text-white shadow-sm"
                      : "text-[#5f7298] hover:text-[#0f1f3d]"
                  }`}
                >
                  📊 Reporte por Vendedor
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("rules")}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                    activeTab === "rules"
                      ? "bg-gradient-to-r from-[#2563eb] to-[#0ea5e9] text-white shadow-sm"
                      : "text-[#5f7298] hover:text-[#0f1f3d]"
                  }`}
                >
                  ⚙️ Reglas ({rules.filter((r) => r.enabled).length} Activas)
                </button>
              </div>

              <button
                type="button"
                onClick={loadSales}
                disabled={loading}
                className="rounded-full border border-[#d6c1ad] bg-white px-4 py-1.5 text-xs font-medium text-[#3b2a1e] hover:bg-[#ebf3ff] disabled:opacity-60 transition"
              >
                {loading ? "Actualizando..." : "Actualizar"}
              </button>
            </div>
          </header>

          {error && (
            <div className="rounded-xl border border-[#fecdd3] bg-[#fff1f2] p-4 text-xs font-medium text-[#be123c]">
              {error}
            </div>
          )}

          {activeTab === "summary" ? (
            /* ─────────────── TAB 1: REPORTES & CORTE POR VENDEDOR ─────────────── */
            <div className="flex flex-col gap-5">
              {/* Filters Bar */}
              <section className="rounded-2xl border border-[#d6e4ff] bg-white p-3 shadow-sm md:p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#5f7298] uppercase">Período:</span>
                      <div className="inline-flex rounded-full border border-[#d6e4ff] bg-[#f8fbff] p-1">
                        {[
                          { id: "all", label: "Todo" },
                          { id: "today", label: "Hoy" },
                          { id: "week", label: "Esta Semana" },
                          { id: "month", label: "Este Mes" },
                        ].map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setDateFilter(t.id as any)}
                            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                              dateFilter === t.id
                                ? "bg-gradient-to-r from-[#2563eb] to-[#0ea5e9] text-white shadow-sm"
                                : "text-[#5f7298] hover:text-[#0f1f3d]"
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {uniqueSellers.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#5f7298] uppercase">Vendedor:</span>
                        <select
                          value={sellerFilter}
                          onChange={(e) => setSellerFilter(e.target.value)}
                          className="rounded-xl border border-[#bfd4ff] bg-[#f8fbff] px-3 py-1.5 text-xs font-medium text-[#0f1f3d] outline-none focus:border-[#2563eb]"
                        >
                          <option value="all">Todos los vendedores</option>
                          {uniqueSellers.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-[#5f7298]">
                    Mostrando <strong className="text-[#0f1f3d]">{filteredSales.length}</strong> ventas registradas
                  </div>
                </div>
              </section>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-2xl border border-[#d6e4ff] bg-white p-5 shadow-sm">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#5f7298]">
                    Comisiones Totales
                  </span>
                  <p className="text-2xl md:text-3xl font-bold text-[#2563eb] mt-2">
                    {money(overallTotals.commissions)}
                  </p>
                  <p className="text-xs text-[#5f7298] mt-1">Por liquidar a vendedores</p>
                </div>

                <div className="rounded-2xl border border-[#d6e4ff] bg-white p-5 shadow-sm">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#5f7298]">
                    Ventas Brutas
                  </span>
                  <p className="text-2xl md:text-3xl font-bold text-[#0f1f3d] mt-2">
                    {money(overallTotals.revenue)}
                  </p>
                  <p className="text-xs text-[#5f7298] mt-1">
                    {filteredSales.length} transacciones registradas
                  </p>
                </div>

                <div className="rounded-2xl border border-[#d6e4ff] bg-white p-5 shadow-sm">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#5f7298]">
                    Margen de Ganancia
                  </span>
                  <p className="text-2xl md:text-3xl font-bold text-[#10b981] mt-2">
                    {money(overallTotals.margin)}
                  </p>
                  <p className="text-xs text-[#5f7298] mt-1">Ganancia neta previa a comisiones</p>
                </div>

                <div className="rounded-2xl border border-[#d6e4ff] bg-white p-5 shadow-sm">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#5f7298]">
                    Unidades Vendidas
                  </span>
                  <p className="text-2xl md:text-3xl font-bold text-[#0f1f3d] mt-2">
                    {overallTotals.units} <span className="text-sm font-normal text-[#5f7298]">uds.</span>
                  </p>
                  <p className="text-xs text-[#5f7298] mt-1">Equipos y accesorios procesados</p>
                </div>
              </div>

              {/* Breakdown by Seller Cards */}
              <section className="rounded-2xl border border-[#d6e4ff] bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-[#0f1f3d]">
                    🏆 Rendimiento y Acumulado por Vendedor
                  </h2>
                  <span className="text-xs text-[#5f7298]">
                    {sellerSummary.length} vendedor{sellerSummary.length === 1 ? "" : "es"} activo{sellerSummary.length === 1 ? "" : "s"}
                  </span>
                </div>

                {sellerSummary.length === 0 ? (
                  <div className="text-center py-8 text-sm text-[#5f7298]">
                    No hay ventas registradas en el período seleccionado.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sellerSummary.map((s, idx) => {
                      const shareOfSales =
                        overallTotals.revenue > 0
                          ? Math.round((s.grossRevenue / overallTotals.revenue) * 100)
                          : 0;

                      return (
                        <div
                          key={s.sellerName}
                          className="rounded-xl border border-[#d6e4ff] bg-[#f8fbff] p-4 transition hover:shadow-sm"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-r from-[#2563eb] to-[#0ea5e9] text-xs font-bold text-white">
                                  {idx + 1}
                                </span>
                                <h3 className="font-semibold text-[#0f1f3d]">
                                  {s.sellerName}
                                </h3>
                              </div>
                              <p className="text-xs text-[#5f7298] mt-1">
                                {s.salesCount} venta{s.salesCount === 1 ? "" : "s"} • {s.unitsSold} equipo{s.unitsSold === 1 ? "" : "s"}
                              </p>
                            </div>

                            <div className="text-right">
                              <span className="text-xs font-medium text-[#5f7298]">Comisión</span>
                              <p className="text-lg font-bold text-[#2563eb]">
                                {money(s.commissionsEarned)}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-[#e2edff] flex items-center justify-between text-xs">
                            <div>
                              <span className="text-[#5f7298]">Ventas: </span>
                              <strong className="text-[#0f1f3d]">{money(s.grossRevenue)}</strong>
                            </div>
                            <div>
                              <span className="text-[#5f7298]">Margen: </span>
                              <strong className="text-[#10b981]">{money(s.grossMargin)}</strong>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#e2edff]">
                            <div
                              className="h-full bg-gradient-to-r from-[#2563eb] to-[#0ea5e9] rounded-full"
                              style={{ width: `${Math.min(100, Math.max(5, shareOfSales))}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Detailed Sales Commission Table */}
              <section className="rounded-2xl border border-[#d6e4ff] bg-white shadow-sm overflow-hidden">
                <div className="p-4 border-b border-[#eef5ff] flex items-center justify-between">
                  <h2 className="text-base font-semibold text-[#0f1f3d]">
                    🧾 Detalle de Ventas y Comisiones Generadas
                  </h2>
                  <span className="text-xs text-[#5f7298]">
                    {salesWithCommissions.length} registro{salesWithCommissions.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#d6e4ff] bg-gradient-to-b from-[#f5f9ff] to-[#eef5ff] text-xs font-semibold uppercase text-[#5f7298]">
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Venta / Cliente</th>
                        <th className="px-4 py-3">Vendedor</th>
                        <th className="px-4 py-3">Artículos / IMEI</th>
                        <th className="px-4 py-3 text-right">Venta Total</th>
                        <th className="px-4 py-3 text-right">Margen</th>
                        <th className="px-4 py-3 text-right">Comisión</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eef5ff] text-xs text-[#0f1f3d]">
                      {salesWithCommissions.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-sm text-[#5f7298]">
                            No hay transacciones registradas.
                          </td>
                        </tr>
                      ) : (
                        salesWithCommissions.slice(0, 50).map((sale) => (
                          <tr key={sale.saleId} className="hover:bg-[#f8fbff] transition">
                            <td className="px-4 py-3 whitespace-nowrap text-[#5f7298]">
                              {new Date(sale.soldAt).toLocaleDateString("es-MX", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-semibold text-[#0f1f3d]">{sale.saleId}</span>
                              <div className="text-[#5f7298] text-[11px] truncate max-w-[150px]">
                                {sale.customer || "Público General"}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="inline-flex items-center rounded-full bg-[#ebf3ff] px-2.5 py-0.5 text-xs font-semibold text-[#1d4ed8]">
                                {sale.soldBy || "Mostrador General"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="space-y-1 max-w-[280px]">
                                {sale.itemCalculations?.map((item, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-[11px]">
                                    <span className="truncate text-[#0f1f3d]">
                                      {item.model || "Equipo"}
                                    </span>
                                    <span className="ml-2 font-medium text-[#2563eb] whitespace-nowrap">
                                      +{money(item.commissionAmount)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                              {money(sale.totalSale)}
                            </td>
                            <td className="px-4 py-3 text-right text-[#10b981] font-medium whitespace-nowrap">
                              {money(sale.totalMargin)}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-[#2563eb] whitespace-nowrap">
                              {money(sale.totalCommission)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : (
            /* ─────────────── TAB 2: CONFIGURACIÓN DE REGLAS ─────────────── */
            <div className="flex flex-col gap-5">
              <section className="rounded-2xl border border-[#d6e4ff] bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                  <div>
                    <h2 className="text-base font-semibold text-[#0f1f3d]">
                      Reglas de Comisión por Modelo, Categoría o Producto
                    </h2>
                    <p className="text-xs text-[#5f7298] mt-0.5">
                      Las comisiones se evalúan en tiempo real según la regla más específica aplicable.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={resetToDefaults}
                      className="rounded-full border border-[#d6c1ad] bg-white px-3 py-1.5 text-xs font-medium text-[#3b2a1e] hover:bg-[#ebf3ff] transition"
                    >
                      ↺ Restaurar Valores Iniciales
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(true)}
                      className="rounded-full bg-gradient-to-r from-[#2563eb] to-[#0ea5e9] text-white px-4 py-1.5 text-xs font-semibold shadow-sm hover:from-[#1d4ed8] hover:to-[#0284c7] transition"
                    >
                      + Nueva Regla
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className={`rounded-xl border p-4 transition ${
                        rule.enabled
                          ? "border-[#d6e4ff] bg-[#f8fbff]"
                          : "border-dashed border-[#e2edff] bg-white opacity-60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span
                            className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                              rule.scope === "global"
                                ? "bg-[#e0e7ff] text-[#4338ca]"
                                : rule.scope === "category"
                                ? "bg-[#dbeafe] text-[#1e40af]"
                                : "bg-[#fef3c7] text-[#92400e]"
                            }`}
                          >
                            {rule.scope}
                          </span>
                          <h3 className="font-semibold text-sm text-[#0f1f3d] mt-1.5">
                            {rule.name}
                          </h3>
                          {rule.target && (
                            <p className="text-xs text-[#5f7298] mt-0.5">
                              Objetivo: <span className="font-medium text-[#0f1f3d]">{rule.target}</span>
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleRule(rule.id)}
                            className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                              rule.enabled
                                ? "bg-[#dcfce7] text-[#166534] hover:bg-[#bbf7d0]"
                                : "bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]"
                            }`}
                          >
                            {rule.enabled ? "✓ ACTIVA" : "INACTIVA"}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRule(rule.id)}
                            className="text-[#94a3b8] hover:text-[#ef4444] text-sm px-1"
                            title="Eliminar regla"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#e2edff] flex items-center justify-between text-xs">
                        <span className="text-[#5f7298]">Esquema:</span>
                        <span className="font-semibold text-[#2563eb]">
                          {rule.type === "fixed_per_unit"
                            ? `$${rule.fixedAmount} MXN fijos por equipo`
                            : rule.type === "percent_margin"
                            ? `${rule.percentage}% del margen (ganancia)`
                            : rule.type === "percent_price"
                            ? `${rule.percentage}% del precio total`
                            : `$${rule.fixedAmount} + ${rule.percentage}% margen`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* Modal to Create New Rule */}
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
              <div className="w-full max-w-lg rounded-2xl border border-[#d6e4ff] bg-white p-6 shadow-2xl">
                <div className="flex items-center justify-between border-b border-[#eef5ff] pb-4">
                  <h3 className="text-lg font-semibold text-[#0f1f3d]">
                    Crear Nueva Regla de Comisión
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="text-lg font-bold text-[#94a3b8] hover:text-[#0f1f3d]"
                  >
                    ×
                  </button>
                </div>

                <div className="mt-4 space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold text-[#5f7298] uppercase mb-1">
                      Nombre Descriptivo
                    </label>
                    <input
                      type="text"
                      value={newRuleName}
                      onChange={(e) => setNewRuleName(e.target.value)}
                      placeholder="ej. Bono Especial iPhone 15 Pro"
                      className="w-full rounded-xl border border-[#bfd4ff] bg-[#f8fbff] px-3.5 py-2 text-sm text-[#0f1f3d] outline-none focus:border-[#2563eb]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[#5f7298] uppercase mb-1">
                      Ámbito de Aplicación
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { id: "category", label: "Categoría" },
                        { id: "model", label: "Modelo" },
                        { id: "product", label: "Producto" },
                        { id: "global", label: "Global" },
                      ].map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setNewRuleScope(s.id as any)}
                          className={`rounded-xl py-2 font-semibold border transition ${
                            newRuleScope === s.id
                              ? "border-[#2563eb] bg-[#ebf3ff] text-[#2563eb]"
                              : "border-[#d6e4ff] bg-[#f8fbff] text-[#5f7298] hover:text-[#0f1f3d]"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {newRuleScope !== "global" && (
                    <div>
                      <label className="block font-semibold text-[#5f7298] uppercase mb-1">
                        {newRuleScope === "category"
                          ? "Categoría (iphone, ipad, mac, watch, accessories)"
                          : newRuleScope === "model"
                          ? "Texto del Modelo (ej. iPhone 15 Pro, S24)"
                          : "SKU o ID del Producto"}
                      </label>
                      <input
                        type="text"
                        value={newRuleTarget}
                        onChange={(e) => setNewRuleTarget(e.target.value)}
                        placeholder="ej. iphone, 15 pro, etc."
                        className="w-full rounded-xl border border-[#bfd4ff] bg-[#f8fbff] px-3.5 py-2 text-sm text-[#0f1f3d] outline-none focus:border-[#2563eb]"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block font-semibold text-[#5f7298] uppercase mb-1">
                      Tipo de Comisión
                    </label>
                    <select
                      value={newRuleType}
                      onChange={(e) => setNewRuleType(e.target.value as any)}
                      className="w-full rounded-xl border border-[#bfd4ff] bg-[#f8fbff] px-3.5 py-2 text-sm text-[#0f1f3d] outline-none focus:border-[#2563eb]"
                    >
                      <option value="fixed_per_unit">💵 Monto Fijo por Unidad ($ MXN)</option>
                      <option value="percent_margin">📈 Porcentaje sobre Margen de Ganancia (%)</option>
                      <option value="percent_price">🏷️ Porcentaje sobre Precio de Venta Total (%)</option>
                      <option value="combined">✨ Combinado (Fijo + % Margen)</option>
                    </select>
                  </div>

                  {(newRuleType === "fixed_per_unit" || newRuleType === "combined") && (
                    <div>
                      <label className="block font-semibold text-[#5f7298] uppercase mb-1">
                        Monto Fijo en Pesos ($ MXN)
                      </label>
                      <input
                        type="number"
                        value={newRuleFixedAmount}
                        onChange={(e) => setNewRuleFixedAmount(e.target.value)}
                        placeholder="300"
                        className="w-full rounded-xl border border-[#bfd4ff] bg-[#f8fbff] px-3.5 py-2 text-sm text-[#0f1f3d] outline-none focus:border-[#2563eb]"
                      />
                    </div>
                  )}

                  {(newRuleType === "percent_margin" ||
                    newRuleType === "percent_price" ||
                    newRuleType === "combined") && (
                    <div>
                      <label className="block font-semibold text-[#5f7298] uppercase mb-1">
                        Porcentaje (%)
                      </label>
                      <input
                        type="number"
                        value={newRulePercentage}
                        onChange={(e) => setNewRulePercentage(e.target.value)}
                        placeholder="10"
                        className="w-full rounded-xl border border-[#bfd4ff] bg-[#f8fbff] px-3.5 py-2 text-sm text-[#0f1f3d] outline-none focus:border-[#2563eb]"
                      />
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end gap-2 border-t border-[#eef5ff] pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-full border border-[#d6c1ad] bg-white px-4 py-2 text-xs font-semibold text-[#3b2a1e] hover:bg-[#ebf3ff]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateRule}
                    disabled={!newRuleName.trim()}
                    className="rounded-full bg-gradient-to-r from-[#2563eb] to-[#0ea5e9] text-white px-5 py-2 text-xs font-semibold shadow-sm hover:from-[#1d4ed8] hover:to-[#0284c7] disabled:opacity-40 transition"
                  >
                    Guardar y Activar Regla
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
