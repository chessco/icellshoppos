"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";

type OrgSubscription = {
  id: string;
  status: string;
  createdAt: string;
  expiresAt?: string | null;
  plan?: {
    name?: string | null;
    code?: string | null;
    basePriceCents?: number | null;
    trialDays?: number | null;
  } | null;
};

type OrganizationWithSubscriptions = {
  id: string;
  name: string;
  subscriptions?: OrgSubscription[];
};

type SubscriptionRow = OrgSubscription & {
  orgName: string;
  orgId: string;
  planName?: string | null;
  planCode?: string | null;
  planPrice?: number | null;
  planTrial?: number | null;
};

export default function AdminSubscriptionsPage() {
  const pathname = usePathname();
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [availablePlans, setAvailablePlans] = useState<
    Array<{ id: string; name: string; code: string; basePriceCents: number; trialDays: number }>
  >([]);
  const [editingSub, setEditingSub] = useState<SubscriptionRow | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<"active" | "trialing">("active");
  const [savingUpgrade, setSavingUpgrade] = useState(false);
  const [modalMessage, setModalMessage] = useState("");

  const loadSubscriptions = () => {
    setLoading(true);
    fetch("/api/admin/organizations")
      .then((res) => res.json())
      .then((data) => {
        // Flatten all org subscriptions into a single array
        const subs = ((data.organizations || []) as OrganizationWithSubscriptions[]).flatMap((org) =>
          (org.subscriptions || []).map((sub) => ({
            ...sub,
            orgName: org.name,
            orgId: org.id,
            planName: sub.plan?.name,
            planCode: sub.plan?.code,
            planPrice: sub.plan?.basePriceCents,
            planTrial: sub.plan?.trialDays,
          }))
        );
        setSubscriptions(subs);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load subscriptions");
        setLoading(false);
      });
  };

  useEffect(() => {
    loadSubscriptions();
    fetch("/api/org/plans")
      .then((res) => res.json())
      .then((data) => {
        if (data.plans) setAvailablePlans(data.plans);
      })
      .catch(() => null);
  }, []);

  const openUpgradeModal = (sub: SubscriptionRow) => {
    setEditingSub(sub);
    setModalMessage("");
    // Find matching plan id or default to first
    const currentPlan = availablePlans.find((p) => p.name === sub.planName || p.code === sub.planCode);
    setSelectedPlanId(currentPlan ? currentPlan.id : availablePlans[0]?.id || "");
    setSelectedStatus(sub.status === "trialing" ? "trialing" : "active");
  };

  const handleSaveUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSub || !selectedPlanId) return;

    setSavingUpgrade(true);
    setModalMessage("");
    try {
      const res = await fetch("/api/admin/subscriptions/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: editingSub.orgId,
          planId: selectedPlanId,
          status: selectedStatus,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setModalMessage("¡Suscripción actualizada exitosamente!");
        setTimeout(() => {
          setEditingSub(null);
          loadSubscriptions();
        }, 1200);
      } else {
        setModalMessage(data.error || "Error al actualizar suscripción");
      }
    } catch {
      setModalMessage("Error de conexión al actualizar");
    } finally {
      setSavingUpgrade(false);
    }
  };

  const formatDollars = (cents?: number | null) =>
    cents == null ? "-" : `$${Math.round(cents / 100).toLocaleString("en-US")}`;

  return (
    <div className="app-shell">
      <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-6 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 text-sm text-[#5c4332]">
          <span className="font-bold">Super Admin &gt; Subscriptions</span>
        </div>
      </nav>
      <div className="grid w-full md:grid-cols-[220px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-8 px-6 py-10">
          <header>
            <h1 className="text-3xl font-semibold text-[#1f1a16]">All Subscriptions</h1>
            <p className="text-sm text-[#6a4d3a]">View, filter, and manage all organization subscriptions in one place.</p>
          </header>
          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-6">
            <h2 className="text-lg font-semibold text-[#1f1a16] mb-2">Active & Expired Subscriptions</h2>
            {loading ? (
              <div>Loading...</div>
            ) : error ? (
              <div className="text-red-600">{error}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-[#f7f2ec]">
                      <th className="px-3 py-2 text-left">Org</th>
                      <th className="px-3 py-2 text-left">Plan</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Price</th>
                      <th className="px-3 py-2 text-left">Trial Days</th>
                      <th className="px-3 py-2 text-left">Start</th>
                      <th className="px-3 py-2 text-left">End</th>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((sub) => (
                      <tr key={sub.id} className="border-b border-[#e6d6c6]">
                        <td className="px-3 py-2 font-medium text-[#1f1a16]">{sub.orgName}</td>
                        <td className="px-3 py-2">
                          <span className="font-semibold text-blue-900">{sub.planName}</span>{" "}
                          <span className="text-xs text-[#a88]">({sub.planCode})</span>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                              sub.status === "active"
                                ? "bg-emerald-100 text-emerald-800"
                                : sub.status === "trialing"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {sub.status}
                          </span>
                        </td>
                        <td className="px-3 py-2">{formatDollars(sub.planPrice)}</td>
                        <td className="px-3 py-2">{sub.planTrial}</td>
                        <td className="px-3 py-2">{sub.createdAt ? new Date(sub.createdAt).toLocaleDateString() : "-"}</td>
                        <td className="px-3 py-2">{sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString() : "-"}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openUpgradeModal(sub)}
                              className="rounded-full bg-amber-500 hover:bg-amber-600 px-3 py-1 text-xs font-bold text-white transition shadow-xs"
                            >
                              ⚡ Cambiar Plan
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-gray-300 bg-white hover:bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700"
                              title="Impersonate Org"
                              onClick={() => alert(`Impersonate ${sub.orgName}`)}
                            >
                              Impersonate
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {subscriptions.length === 0 && <div className="text-[#6a4d3a] mt-4">No subscriptions found.</div>}
              </div>
            )}
          </section>

          {/* Superadmin Upgrade Modal */}
          {editingSub && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-amber-200 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⚡</span>
                    <h3 className="text-base font-bold text-gray-900">
                      Modificar / Ascender Plan
                    </h3>
                  </div>
                  <button
                    onClick={() => setEditingSub(null)}
                    className="text-gray-400 hover:text-gray-600 font-bold p-1"
                  >
                    ✕
                  </button>
                </div>

                <div className="my-3 text-xs text-gray-600 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                  Organización: <strong className="text-gray-900">{editingSub.orgName}</strong>
                  <br />
                  Plan actual: <span className="font-semibold text-blue-700">{editingSub.planName}</span> ({editingSub.status})
                </div>

                <form onSubmit={handleSaveUpgrade} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Nuevo Plan Asignado
                    </label>
                    <select
                      value={selectedPlanId}
                      onChange={(e) => setSelectedPlanId(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                      disabled={savingUpgrade}
                    >
                      {availablePlans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.code}) — ${(p.basePriceCents / 100).toFixed(2)}/mes
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Estado de la Suscripción
                    </label>
                    <select
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value as "active" | "trialing")}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                      disabled={savingUpgrade}
                    >
                      <option value="active">Activo (Full Access)</option>
                      <option value="trialing">Trialing (Periodo de Prueba)</option>
                    </select>
                  </div>

                  {modalMessage && (
                    <div className="rounded-lg bg-amber-50 border border-amber-300 p-2.5 text-xs font-medium text-amber-900">
                      {modalMessage}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setEditingSub(null)}
                      disabled={savingUpgrade}
                      className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={savingUpgrade}
                      className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:brightness-105 disabled:opacity-50"
                    >
                      {savingUpgrade ? "Guardando..." : "Confirmar Cambio"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

