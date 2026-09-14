"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";

type Plan = {
  id: string;
  code: string;
  name: string;
  basePriceCents: number;
  includedSeats: number;
  extraSeatPriceCents: number;
  trialDays: number;
  stripePriceId: string | null;
};

type ActiveSub = {
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  plan: { code: string; name: string } | null;
} | null;

type Payment = {
  id: string;
  createdAt: string;
  amountCents: number;
  currency: string;
  status: string;
  errorMessage?: string | null;
};

export default function UserBillingPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><p className="text-sm text-[#5f7298]">Loading billing…</p></div>}>
      <BillingPageInner />
    </Suspense>
  );
}

const fmt = (cents: number) =>
  cents === 0 ? "Free" : `$${(cents / 100).toFixed(2)}/mo`;

const statusBadge = (status: string) => {
  const s = status.toLowerCase();
  if (s === "active" || s === "succeeded") return "bg-[#d1ffd9] text-[#1a6b2a]";
  if (s === "trialing") return "bg-[#fff3cd] text-[#7a5700]";
  if (s === "refunded") return "bg-[#dbeafe] text-[#1e40af]";
  return "bg-[#ffd9d1] text-[#9b2c2c]";
};

const PLAN_FEATURES: Record<string, string[]> = {
  free: ["14-day free trial", "1 seat", "Full inventory management", "Sales & purchase orders"],
  basic: ["$7.99/mo base", "1 included seat", "All Free features", "Extra seats at $2.99/seat"],
  pro: ["$14.99/mo", "Unlimited seats", "All Basic features", "Custom public inventory slug"],
};

function BillingPageInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activeSub, setActiveSub] = useState<ActiveSub>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [pendingPlan, setPendingPlan] = useState<{ plan: Plan; label: string; isUpgrade: boolean } | null>(null);

  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");
    const refunded = searchParams.get("refunded");
    if (refunded && Number(refunded) > 0) {
      setFlash({ type: "success", msg: `Your plan has been downgraded. A refund of $${(Number(refunded) / 100).toFixed(2)} has been issued to your payment method.` });
    } else if (success) {
      setFlash({ type: "success", msg: "Your plan has been updated successfully!" });
    }
    if (canceled) setFlash({ type: "error", msg: "Checkout was canceled. No changes were made." });
  }, [searchParams]);

  useEffect(() => {
    Promise.all([
      fetch("/api/org/summary").then((r) => r.json()).catch(() => null),
      fetch("/api/billing/payments").then((r) => r.json()).catch(() => null),
      fetch("/api/billing/plans").then((r) => r.json()).catch(() => null),
    ]).then(([orgData, paymentsData, plansData]) => {
      const loadedPlans = plansData?.plans ?? [];
      if (!Array.isArray(plansData?.plans)) {
        console.error("[billing] plans API error:", plansData);
      }
      setPlans(loadedPlans);
      const sub = orgData?.organization?.subscriptions?.[0] ?? null;
      setActiveSub(sub);
      setPayments(paymentsData?.payments ?? []);
      setLoading(false);
    }).catch((err) => {
      console.error("[billing] data load failed:", err);
      setLoading(false);
    });
  }, []);

  const handleAction = async (planOrPriceId: string | null, label: string, isUpgrade?: boolean) => {
    const isManageAction = label === "manage";
    if (!isManageAction && !planOrPriceId) {
      setFlash({ type: "error", msg: "Plan configuration error — please refresh the page." });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setActionLoading(label);
    setFlash(null);
    try {
      const res = await fetch("/api/billing/create-stripe-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: isManageAction ? null : planOrPriceId, returnUrl: "/billing", isUpgrade: isUpgrade ?? true }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.upgraded) {
        // Direct API change — reload billing page with appropriate flash
        const qs = data.refundedCents > 0 ? `?refunded=${data.refundedCents}` : "?success=1";
        window.location.href = `/billing${qs}`;
      } else {
        const msg = data.error ?? "Failed to start checkout.";
        console.error("[billing] checkout error:", msg, { planOrPriceId, status: res.status });
        setFlash({ type: "error", msg });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      console.error("[billing] request failed:", err);
      setFlash({ type: "error", msg: "Request failed. Please try again." });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setActionLoading(null);
    }
  };

  const currentPlanCode = activeSub?.plan?.code?.toLowerCase() ?? "none";
  const currentStatus = activeSub?.status?.toLowerCase() ?? "none";
  const isTrialExpired =
    activeSub?.status === "trialing" &&
    activeSub.trialEndsAt &&
    new Date(activeSub.trialEndsAt) < new Date();
  const isPaidAndActive = (currentPlanCode === "basic" || currentPlanCode === "pro") && currentStatus === "active" && !isTrialExpired;

  const getOrderedPlans = () => {
    const order = ["free", "basic", "pro"];
    return [...plans].sort(
      (a, b) => order.indexOf(a.code) - order.indexOf(b.code)
    );
  };

  const planButtonLabel = (plan: Plan) => {
    const code = plan.code.toLowerCase();
    if (code === currentPlanCode && !isTrialExpired) return null; // shown via "Current" badge, not a button
    if (code === "free") return null; // free is never "upgradeable to"

    // If user is not currently on an active paid plan (e.g. free/canceled/legacy trial code),
    // always allow upgrading to paid plans.
    if (!isPaidAndActive) return `Upgrade to ${plan.name}`;

    if (code === "pro" && currentPlanCode === "basic") return "Upgrade to Pro";
    if (code === "basic" && currentPlanCode === "pro") return "Downgrade to Basic";
    return null;
  };

  return (
    <div className="app-shell">
      <nav className="sticky top-0 z-30 border-b border-[#d6e4ff] bg-[rgba(255,255,255,0.92)] px-6 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-2 text-sm font-semibold text-[#1f3563]">
          <span>Billing</span>
        </div>
      </nav>

      <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-8 px-6 py-10">
          <header>
            <h1 className="text-3xl font-semibold text-[#0f1f3d]">Billing &amp; Plans</h1>
            <p className="text-sm text-[#5f7298]">Manage your subscription, upgrade your plan, or add seats.</p>
          </header>

          {flash && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${flash.type === "success" ? "border-[#d1ffd9] bg-[#f3fff6] text-[#2a7c3b]" : "border-[#ffd9d1] bg-[#fff6f3] text-[#c24d34]"}`}>
              {flash.msg}
            </div>
          )}

          {/* Current Plan Summary */}
          {!loading && activeSub && (
            <section className="rounded-2xl border border-[#d6e4ff] bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#4b6292]">Current Plan</h2>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xl font-bold text-[#0f1f3d]">{activeSub.plan?.name ?? "—"}</p>
                  <p className="mt-1 text-sm text-[#5f7298]">
                    {activeSub.trialEndsAt
                      ? isTrialExpired
                        ? "Trial expired"
                        : `Trial ends ${new Date(activeSub.trialEndsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
                      : activeSub.currentPeriodEnd
                      ? `Renews ${new Date(activeSub.currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
                      : ""}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusBadge(isTrialExpired ? "expired" : activeSub.status)}`}>
                  {isTrialExpired ? "Trial Expired" : activeSub.status}
                </span>
              </div>
              {isTrialExpired && (
                <p className="mt-3 rounded-xl border border-[#ffd9d1] bg-[#fff6f3] px-3 py-2 text-sm text-[#c24d34]">
                  Your free trial has ended. Inventory viewing and adding are still available. To re-enable sales checkout and public inventory, please upgrade to a paid plan.
                </p>
              )}
            </section>
          )}

          {/* Plan Cards */}
          {loading ? (
            <p className="text-sm text-[#5f7298]">Loading plans…</p>
          ) : error ? (
            <p className="text-sm text-[#c24d34]">{error}</p>
          ) : (
            <section>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#4b6292]">Available Plans</h2>
              {plans.length === 0 ? (
                <p className="text-sm text-[#c24d34]">Plans could not be loaded. Please refresh the page or contact support.</p>
              ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                {getOrderedPlans().map((plan) => {
                  const code = plan.code.toLowerCase();
                  const isCurrent = code === currentPlanCode && !isTrialExpired;
                  const btnLabel = planButtonLabel(plan);
                  const features = PLAN_FEATURES[code] ?? [];

                  return (
                    <div
                      key={plan.id}
                      className={`flex flex-col rounded-2xl border p-5 shadow-sm transition ${isCurrent ? "border-[#2563eb] bg-[#f0f7ff]" : "border-[#d6e4ff] bg-white"}`}
                    >
                      {isCurrent && (
                        <span className="mb-2 w-fit rounded-full bg-[#2563eb] px-2.5 py-0.5 text-xs font-semibold text-white">Current</span>
                      )}
                      <h3 className="text-lg font-bold text-[#0f1f3d]">{plan.name}</h3>
                      <p className="mt-1 text-2xl font-semibold text-[#0f1f3d]">{fmt(plan.basePriceCents)}</p>
                      <ul className="mt-4 flex-1 space-y-1.5">
                        {features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-sm text-[#29477e]">
                            <span className="mt-0.5 text-[#2563eb]">✓</span> {f}
                          </li>
                        ))}
                      </ul>
                      {btnLabel ? (
                        <button
                          onClick={() => {
                            const currentPlanPrice = plans.find(p => p.code === currentPlanCode)?.basePriceCents ?? 0;
                            const isUpgrade = plan.basePriceCents >= currentPlanPrice;
                            setPendingPlan({ plan, label: btnLabel, isUpgrade });
                          }}
                          disabled={actionLoading === `upgrade-${plan.code}`}
                          className={`mt-5 rounded-xl py-2 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60 ${
                            btnLabel.startsWith("Downgrade")
                              ? "bg-[#64748b] hover:bg-[#475569]"
                              : "bg-gradient-to-r from-[#2563eb] to-[#0ea5e9] hover:from-[#1d4ed8] hover:to-[#0284c7]"
                          }`}
                        >
                          {actionLoading === `upgrade-${plan.code}` ? "Processing…" : btnLabel}
                        </button>
                      ) : !btnLabel && isCurrent && activeSub?.stripeSubscriptionId ? (
                        <button
                          onClick={() => handleAction("", "manage")}
                          disabled={actionLoading === "manage"}
                          className="mt-5 rounded-xl border border-[#bfd4ff] py-2 text-sm font-semibold text-[#1f3563] transition hover:bg-[#eef5ff] disabled:opacity-60"
                        >
                          {actionLoading === "manage" ? "Redirecting…" : "Manage Subscription"}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              )}
            </section>
          )}

          {/* Plan Change Confirmation Modal */}
          {pendingPlan && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,31,61,0.45)]">
              <div className="mx-4 w-full max-w-md rounded-2xl border border-[#d6e4ff] bg-white p-6 shadow-2xl">
                <h2 className="text-lg font-bold text-[#0f1f3d]">
                  {pendingPlan.isUpgrade ? "Confirm Upgrade" : "Confirm Downgrade"}
                </h2>
                <p className="mt-3 text-sm text-[#29477e]">
                  You are about to switch to the <strong>{pendingPlan.plan.name}</strong> plan ({fmt(pendingPlan.plan.basePriceCents)}).
                </p>
                {pendingPlan.isUpgrade ? (
                  <p className="mt-2 rounded-xl border border-[#d6e4ff] bg-[#f0f7ff] px-3 py-2 text-sm text-[#29477e]">
                    A prorated charge for the remaining days in your billing cycle will be applied immediately to your saved payment method.
                  </p>
                ) : (
                  <p className="mt-2 rounded-xl border border-[#fff3cd] bg-[#fffdf0] px-3 py-2 text-sm text-[#7a5700]">
                    Your plan will be downgraded immediately. A prorated credit will be applied to your next invoice — no refund to your card.
                  </p>
                )}
                <div className="mt-5 flex gap-3">
                  <button
                    onClick={() => {
                      const id = pendingPlan.plan.stripePriceId ?? pendingPlan.plan.code;
                      const label = `upgrade-${pendingPlan.plan.code}`;
                      setPendingPlan(null);
                      handleAction(id, label, pendingPlan.isUpgrade);
                    }}
                    disabled={!!actionLoading}
                    className={`flex-1 rounded-xl py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${
                      pendingPlan.isUpgrade
                        ? "bg-gradient-to-r from-[#2563eb] to-[#0ea5e9] hover:from-[#1d4ed8] hover:to-[#0284c7]"
                        : "bg-[#64748b] hover:bg-[#475569]"
                    }`}
                  >
                    {pendingPlan.isUpgrade ? "Yes, Upgrade" : "Yes, Downgrade"}
                  </button>
                  <button
                    onClick={() => setPendingPlan(null)}
                    className="flex-1 rounded-xl border border-[#bfd4ff] py-2 text-sm font-semibold text-[#1f3563] transition hover:bg-[#eef5ff]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Add a Seat */}
          {!loading && activeSub && (
            <section className="rounded-2xl border border-[#d6e4ff] bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-[#0f1f3d]">Add a Seat</h2>
                  <p className="mt-1 text-sm text-[#5f7298]">
                    {currentPlanCode === "pro"
                      ? "Pro includes unlimited seats — no extra charges."
                      : `Extra seats are billed at ${
                          plans.find((p) => p.code === currentPlanCode)
                            ? fmt((plans.find((p) => p.code === currentPlanCode)!.extraSeatPriceCents))
                            : "$2.99"
                        } each per month.`}
                  </p>
                </div>
                {activeSub.stripeSubscriptionId ? (
                  <button
                    onClick={() => handleAction(activeSub.plan?.code === "pro" ? "pro" : currentPlanCode, "seat")}
                    disabled={actionLoading === "seat"}
                    className="rounded-xl bg-[#0f1f3d] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1f3563] disabled:opacity-60"
                  >
                    {actionLoading === "seat" ? "Redirecting…" : "Add Seat via Portal"}
                  </button>
                ) : (
                  <span className="rounded-xl border border-[#d6e4ff] px-4 py-2 text-sm text-[#5f7298]">
                    Available after subscribing to a paid plan
                  </span>
                )}
              </div>
            </section>
          )}

          {/* Billing History */}
          <section className="rounded-2xl border border-[#d6e4ff] bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-[#0f1f3d]">Billing History</h2>
            {loading ? (
              <p className="text-sm text-[#5f7298]">Loading…</p>
            ) : payments.length === 0 ? (
              <p className="text-sm text-[#5f7298]">No payment records yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#eef4ff] text-left text-xs uppercase tracking-wider text-[#4b6292]">
                      <th className="pb-2 pr-4 font-semibold">Date</th>
                      <th className="pb-2 pr-4 font-semibold">Amount</th>
                      <th className="pb-2 pr-4 font-semibold">Status</th>
                      <th className="pb-2 font-semibold">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef4ff]">
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 pr-4 text-[#29477e]">
                          {new Date(p.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                        </td>
                        <td className="py-2 pr-4 font-medium text-[#0f1f3d]">
                          {p.status === "refunded" ? "-" : ""}${(p.amountCents / 100).toFixed(2)} {p.currency.toUpperCase()}
                        </td>
                        <td className="py-2 pr-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusBadge(p.status)}`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="py-2 text-xs text-[#5f7298]">{p.errorMessage ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

