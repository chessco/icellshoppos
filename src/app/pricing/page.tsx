"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import CurrentOrgBadge from "@/components/CurrentOrgBadge";
import { formatCurrencyDisplay } from "@/lib/display-format";
import { defaultModelCatalog, fetchModelCatalog, type ModelCatalog } from "@/lib/modelCatalog";
import { useSubscriptionStatus } from "@/lib/useSubscriptionStatus";
import ToolUnavailableBanner from "@/components/ToolUnavailableBanner";

type PricingRule = {
  id: string;
  model: string;
  capacity: string;
  price: string;
  price2: string;
  price3: string;
};

type DraftRow = {
  model: string;
  capacity: string;
  price: string;
  price2: string;
  price3: string;
  id?: string;
};

const parseAmount = (value: string) => {
  const numeric = Number(String(value).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
};

const toMoneyWhole = (value: string) => {
  const parsed = parseAmount(value);
  if (parsed === null) return "";
  return String(Math.round(parsed));
};

const displayMoney = (value: string) => {
  const parsed = parseAmount(value);
  if (parsed === null) return "";
  return formatCurrencyDisplay(Math.round(parsed));
};

const modelOrder = Object.keys(defaultModelCatalog);

const parseGeneration = (model: string) => {
  const match = model.match(/iphone\s+(\d+)/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
};

const variantRank = (model: string) => {
  const lower = model.toLowerCase();
  if (lower.includes("mini")) return 1;
  if (lower.includes("plus")) return 2;
  if (lower.includes("pro max")) return 4;
  if (lower.includes("pro")) return 3;
  if (lower.includes("air")) return 5;
  return 0;
};

const capacityToGb = (capacity: string) => {
  const match = capacity.trim().toLowerCase().match(/(\d+)\s*(gb|tb)/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return Number.MAX_SAFE_INTEGER;
  return match[2] === "tb" ? value * 1024 : value;
};

export default function PricingPage() {
  const { isActive, loading: subLoading } = useSubscriptionStatus();
  const pathname = usePathname();
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [catalog, setCatalog] = useState<ModelCatalog>(defaultModelCatalog);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});

  const loadRules = async () => {
    try {
      setBusy(true);
      const res = await fetch("/api/pricing-rules");
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error ?? "Failed to load pricing rules.");
        return;
      }
      setRules(data.rules ?? []);
      setStatus(null);
    } catch {
      setStatus("Failed to load pricing rules.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  useEffect(() => {
    void (async () => {
      const loadedCatalog = await fetchModelCatalog();
      setCatalog(loadedCatalog);
    })();
  }, []);

  const allRows = useMemo(() => {
    const map = new Map<string, DraftRow>();

    Object.entries(catalog).forEach(([model, entry]) => {
      entry.capacities.forEach((capacity) => {
        const key = `${model}||${capacity}`;
        map.set(key, { model, capacity, price: "", price2: "", price3: "" });
      });
    });

    rules.forEach((rule) => {
      const key = `${rule.model}||${rule.capacity}`;
      map.set(key, {
        id: rule.id,
        model: rule.model,
        capacity: rule.capacity,
        price: rule.price,
        price2: rule.price2,
        price3: rule.price3,
      });
    });

    return Array.from(map.values()).sort((a, b) => {
      const aKnownIndex = modelOrder.indexOf(a.model);
      const bKnownIndex = modelOrder.indexOf(b.model);

      if (aKnownIndex !== -1 || bKnownIndex !== -1) {
        if (aKnownIndex === -1) return 1;
        if (bKnownIndex === -1) return -1;
        if (aKnownIndex !== bKnownIndex) return aKnownIndex - bKnownIndex;
      }

      const byGeneration = parseGeneration(a.model) - parseGeneration(b.model);
      if (byGeneration !== 0) return byGeneration;

      const byVariant = variantRank(a.model) - variantRank(b.model);
      if (byVariant !== 0) return byVariant;

      const byModelName = a.model.localeCompare(b.model);
      if (byModelName !== 0) return byModelName;

      const byCapacitySize = capacityToGb(a.capacity) - capacityToGb(b.capacity);
      if (byCapacitySize !== 0) return byCapacitySize;

      return a.capacity.localeCompare(b.capacity);
    });
  }, [catalog, rules]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return allRows;
    return allRows.filter(
      (row) => row.model.toLowerCase().includes(query) || row.capacity.toLowerCase().includes(query)
    );
  }, [allRows, search]);

  const getDraft = (row: DraftRow) => drafts[`${row.model}||${row.capacity}`] ?? row;

  const setDraftField = (row: DraftRow, field: "price" | "price2" | "price3", value: string) => {
    const key = `${row.model}||${row.capacity}`;
    setDrafts((prev) => {
      const current = prev[key] ?? row;
      return {
        ...prev,
        [key]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  const saveRow = async (row: DraftRow) => {
    const key = `${row.model}||${row.capacity}`;
    const draft = drafts[key] ?? row;

    const payload = {
      model: draft.model,
      capacity: draft.capacity,
      price: toMoneyWhole(draft.price),
      price2: toMoneyWhole(draft.price2),
      price3: toMoneyWhole(draft.price3),
    };

    if (!payload.price || !payload.price2 || !payload.price3) {
      setStatus(`All prices are required for ${draft.model} ${draft.capacity}.`);
      return;
    }

    try {
      setBusy(true);
      const res = await fetch("/api/pricing-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error ?? "Failed to save pricing rule.");
        return;
      }
      setStatus(`Saved ${draft.model} ${draft.capacity}.`);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await loadRules();
    } catch {
      setStatus("Failed to save pricing rule.");
    } finally {
      setBusy(false);
    }
  };

  if (!subLoading && isActive === false) {
    return (
      <div className="app-shell">
        <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-4 py-3 backdrop-blur md:px-6">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 text-sm text-[#5c4332]">
            <CurrentOrgBadge />
          </div>
        </nav>
        <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
          <AppSidebar pathname={pathname} />
          <main className="flex min-w-0 flex-col gap-5 px-4 py-6 md:gap-6 md:px-6 md:py-10">
            <ToolUnavailableBanner toolName="Pricing" />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 text-sm text-[#5c4332]">
          <CurrentOrgBadge />
        </div>
      </nav>

      <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-5 px-4 py-6 md:gap-6 md:px-6 md:py-10">
          <header>
            <h1 className="text-2xl font-semibold text-[#1f1a16] md:text-3xl">Pricing</h1>
            <p className="text-sm text-[#6a4d3a]">
              Manage price rules by model and capacity. Device guide combinations are preloaded.
            </p>
          </header>

          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search model or capacity"
                className="w-full max-w-sm rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 text-sm outline-none focus:border-[#1f1a16]"
              />
              <button
                type="button"
                onClick={loadRules}
                disabled={busy}
                className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-medium text-[#3b2a1e] disabled:opacity-60"
              >
                Refresh
              </button>
            </div>
          </section>

          <div className="rounded-2xl border border-[#e6d6c6] bg-white p-3 md:p-4">
            <div className="mobile-scroll max-h-[70vh] overflow-auto">
              <table className="min-w-[760px] text-left text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-[#ead8c6] text-[#6a4d3a]">
                    <th className="px-3 py-2">Model</th>
                    <th className="px-3 py-2">Capacity</th>
                    <th className="px-3 py-2">Price</th>
                    <th className="px-3 py-2">Price 2</th>
                    <th className="px-3 py-2">Price 3</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const draft = getDraft(row);
                    return (
                      <tr key={`${row.model}||${row.capacity}`} className="border-b border-[#f1e4d6]">
                        <td className="px-3 py-2 whitespace-nowrap font-medium text-[#1f1a16]">{row.model}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.capacity}</td>
                        <td className="px-3 py-2">
                          <input
                            value={displayMoney(draft.price)}
                            onChange={(event) => setDraftField(row, "price", event.target.value)}
                            className="w-28 rounded-lg border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 outline-none focus:border-[#1f1a16]"
                            placeholder="$0"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={displayMoney(draft.price2)}
                            onChange={(event) => setDraftField(row, "price2", event.target.value)}
                            className="w-28 rounded-lg border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 outline-none focus:border-[#1f1a16]"
                            placeholder="$0"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={displayMoney(draft.price3)}
                            onChange={(event) => setDraftField(row, "price3", event.target.value)}
                            className="w-28 rounded-lg border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 outline-none focus:border-[#1f1a16]"
                            placeholder="$0"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => saveRow(row)}
                            disabled={busy}
                            className="rounded-full bg-[#1f1a16] px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            Save
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-[#6a4d3a]">
                        No rows found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {status && (
            <div className="rounded-2xl border border-[#e6d6c6] bg-[#fff6ea] px-4 py-3 text-sm text-[#5c4332]">
              {status}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

