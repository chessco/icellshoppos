"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { formatCurrencyDisplay } from "@/lib/display-format";

type BillingResponse = {
  totals?: {
    revenueCents: number;
    successfulPayments: number;
  };
  byPlan?: Array<{ plan: string; revenueCents: number; payments: number }>;
  byMonth?: Array<{ month: string; revenueCents: number; payments: number }>;
  payments?: Array<{
    id: string;
    createdAt: string;
    amountCents: number;
    currency: string;
    status: string;
    organizationName: string;
    planName: string;
  }>;
  error?: string;
};

export default function AdminBillingPage() {
  const pathname = usePathname();
  const [billing, setBilling] = useState<BillingResponse | null>(null);
  const [planFilter, setPlanFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadBilling = async () => {
    try {
      setLoading(true);
      setError("");

      const query = new URLSearchParams();
      if (planFilter) query.set("plan", planFilter);
      if (fromDate) query.set("from", fromDate);
      if (toDate) query.set("to", toDate);

      const response = await fetch(`/api/admin/billing${query.toString() ? `?${query.toString()}` : ""}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as BillingResponse;

      if (!response.ok) {
        setError(data.error ?? "Failed to load billing info");
        setBilling(null);
        return;
      }

      setBilling(data);
    } catch {
      setError("Failed to load billing info");
      setBilling(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBilling();
  }, []);

  const plans = Array.from(new Set((billing?.byPlan ?? []).map((item) => item.plan))).sort();
  const money = (cents: number) => formatCurrencyDisplay(Math.round(cents / 100));

  return (
    <div className="app-shell">
      <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-6 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 text-sm text-[#5c4332]">
          <span className="font-bold">Super Admin &gt; Billing</span>
        </div>
      </nav>
      <div className="grid w-full md:grid-cols-[220px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-8 px-6 py-10">
          <header>
            <h1 className="text-3xl font-semibold text-[#1f1a16]">Billing Overview</h1>
            <p className="text-sm text-[#6a4d3a]">App income analytics by plan and month with payment filters.</p>
          </header>

          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <select
                value={planFilter}
                onChange={(event) => setPlanFilter(event.target.value)}
                className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 text-sm"
              >
                <option value="">All plans</option>
                {plans.map((plan) => (
                  <option key={plan} value={plan.toLowerCase()}>
                    {plan}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void loadBilling()}
                className="rounded-xl border border-[#d6c1ad] px-3 py-2 text-sm font-medium text-[#3b2a1e]"
              >
                Apply Filters
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-6">
            <h2 className="mb-2 text-lg font-semibold text-[#1f1a16]">Income Summary</h2>
            {loading ? (
              <div>Loading...</div>
            ) : error ? (
              <div className="text-red-600">{error}</div>
            ) : !billing ? (
              <div>No billing information found.</div>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <div className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-4 py-3">
                    <p className="text-[#6a4d3a]">Total Income</p>
                    <p className="text-lg font-semibold text-[#1f1a16]">{money(billing.totals?.revenueCents ?? 0)}</p>
                  </div>
                  <div className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-4 py-3">
                    <p className="text-[#6a4d3a]">Successful Payments</p>
                    <p className="text-lg font-semibold text-[#1f1a16]">{billing.totals?.successfulPayments ?? 0}</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-[#3b2a1e]">Income by Plan</h3>
                    <div className="space-y-2 text-sm">
                      {(billing.byPlan ?? []).map((item) => (
                        <div key={item.plan} className="flex items-center justify-between rounded-lg border border-[#e6d6c6] px-3 py-2">
                          <span>{item.plan}</span>
                          <span className="font-semibold">{money(item.revenueCents)}</span>
                        </div>
                      ))}
                      {(billing.byPlan ?? []).length === 0 && <p className="text-[#6a4d3a]">No plan income data.</p>}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-[#3b2a1e]">Income by Month</h3>
                    <div className="space-y-2 text-sm">
                      {(billing.byMonth ?? []).slice(-6).map((item) => (
                        <div key={item.month} className="flex items-center justify-between rounded-lg border border-[#e6d6c6] px-3 py-2">
                          <span>{item.month}</span>
                          <span className="font-semibold">{money(item.revenueCents)}</span>
                        </div>
                      ))}
                      {(billing.byMonth ?? []).length === 0 && <p className="text-[#6a4d3a]">No monthly income data.</p>}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold text-[#3b2a1e]">Recent Payments</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#ead8c6] text-[#6a4d3a]">
                          <th className="px-2 py-2 text-left">Date</th>
                          <th className="px-2 py-2 text-left">Organization</th>
                          <th className="px-2 py-2 text-left">Plan</th>
                          <th className="px-2 py-2 text-left">Amount</th>
                          <th className="px-2 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(billing.payments ?? []).map((payment) => (
                          <tr key={payment.id} className="border-b border-[#f1e4d6]">
                            <td className="px-2 py-2">{new Date(payment.createdAt).toLocaleString()}</td>
                            <td className="px-2 py-2">{payment.organizationName}</td>
                            <td className="px-2 py-2">{payment.planName}</td>
                            <td className="px-2 py-2">{money(payment.amountCents)}</td>
                            <td className="px-2 py-2">{payment.status}</td>
                          </tr>
                        ))}
                        {(billing.payments ?? []).length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-2 py-4 text-center text-[#6a4d3a]">
                              No payments found for current filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

