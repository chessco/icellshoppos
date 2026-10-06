"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";

type Plan = {
  id: string;
  code: string;
  name: string;
  basePriceCents: number;
  includedSeats?: number | null;
  trialDays?: number | null;
};

type OrgDetails = {
  id: string;
  name: string;
  slug: string;
  userCount: number;
  planId: string | null;
  planCode: string | null;
  planName: string | null;
  planPriceCents: number | null;
  subscriptionStatus: string | null;
};

type GroupedOrg = {
  orgId: string;
  orgName: string;
  planName: string;
  planCode: string;
  planId: string | null;
  subscriptionStatus: string;
  users: Array<{ id: string; fullName: string | null; email: string; status: string; role: string }>;
};

type GroupedUsers = Record<string, GroupedOrg>;

type UserRow = {
  id: string;
  fullName?: string | null;
  email: string;
  role?: "superadmin" | "admin" | "staff" | null;
  status: string;
  createdAt: string;
  memberships?: Array<{
    id: string;
    role?: string | null;
    organization?: {
      id?: string | null;
      name?: string | null;
      subscriptions?: Array<{
        id: string;
        status: string;
        planId: string;
        plan?: {
          id: string;
          code: string;
          name: string;
          basePriceCents: number;
        } | null;
      }>;
    } | null;
  }>;
};

export default function AdminUsersPage() {
  const pathname = usePathname();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [organizations, setOrganizations] = useState<Record<string, OrgDetails>>({});
  const [groupedUsers, setGroupedUsers] = useState<GroupedUsers>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Failed to load users");
        return;
      }
      setUsers(data.users || []);
      setPlans(data.plans || []);
      setOrganizations(data.organizations || {});
      setGroupedUsers(data.groupedByOrganization || {});
    } catch {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleSetStatus = async (user: UserRow, nextStatus: "active" | "inactive") => {
    try {
      setBusyAction(`${user.id}:status`);
      setFeedback(null);
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-status", userId: user.id, status: nextStatus }),
      });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error ?? "Failed to update user status.");
        return;
      }
      setUsers((current) =>
        current.map((row) => (row.id === user.id ? { ...row, status: nextStatus } : row))
      );
      setFeedback(`User ${user.email} set to ${nextStatus}.`);
      await loadUsers();
    } catch {
      setFeedback("Failed to update user status.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleSetMembershipRole = async (
    membershipId: string,
    role: "superadmin" | "admin" | "staff"
  ) => {
    try {
      setBusyAction(`${membershipId}:role`);
      setFeedback(null);
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-membership-role", membershipId, role }),
      });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error ?? "Failed to update membership role.");
        return;
      }
      setFeedback("Membership role updated.");
      await loadUsers();
    } catch {
      setFeedback("Failed to update membership role.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleSetOrgPlan = async (
    organizationId: string,
    planId: string,
    subscriptionStatus: "active" | "trialing" | "past_due" | "canceled" | "unpaid" = "active"
  ) => {
    try {
      setBusyAction(`${organizationId}:plan`);
      setFeedback(null);
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-org-plan",
          organizationId,
          planId,
          subscriptionStatus,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error ?? "Error al actualizar el plan.");
        return;
      }
      setFeedback(`Plan actualizado a ${data.plan?.name || "seleccionado"} (${subscriptionStatus}).`);
      await loadUsers();
    } catch {
      setFeedback("Error al actualizar el plan.");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="app-shell">
      <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-6 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 text-sm text-[#5c4332]">
          <span className="font-bold">Super Admin &gt; Users</span>
        </div>
      </nav>
      <div className="grid w-full md:grid-cols-[220px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-8 px-6 py-10">
          <header>
            <h1 className="text-3xl font-semibold text-[#1f1a16]">All Users</h1>
            <p className="text-sm text-[#6a4d3a]">
              Grouped by organization with billing plan, status, membership roles, and ban/unban controls.
            </p>
          </header>

          {feedback && (
            <div className="rounded-2xl border border-[#22c55e] bg-[#f0fdf4] px-4 py-3 text-sm font-semibold text-[#15803d] shadow-sm animate-in fade-in duration-200">
              ✓ {feedback}
            </div>
          )}

          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-6">
            <h2 className="mb-2 text-lg font-semibold text-[#1f1a16]">Users by Organization &amp; Billing Plan</h2>
            <p className="mb-4 text-xs text-[#6a4d3a]">
              Cambia el plan (Free Trial, Basic, Pro) y el estado de suscripción directamente desde aquí.
            </p>
            {loading ? (
              <div className="py-4 text-sm text-[#6a4d3a]">Cargando organizaciones...</div>
            ) : error ? (
              <div className="text-red-600">{error}</div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedUsers).map(([organization, orgInfo]) => {
                  const currentPlanId =
                    orgInfo.planId ||
                    plans.find((p) => p.code === orgInfo.planCode)?.id ||
                    "";
                  const currentStatus = (orgInfo.subscriptionStatus || "active") as
                    | "active"
                    | "trialing"
                    | "past_due"
                    | "canceled"
                    | "unpaid";

                  return (
                    <div
                      key={organization}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#e6d6c6] bg-[#fffaf3] p-4 shadow-sm"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold text-[#3b2a1e]">
                            {orgInfo.orgName || organization}
                          </h3>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              currentStatus === "active"
                                ? "border border-emerald-300 bg-emerald-100 text-emerald-800"
                                : currentStatus === "trialing"
                                ? "border border-amber-300 bg-amber-100 text-amber-800"
                                : "border border-rose-300 bg-rose-100 text-rose-800"
                            }`}
                          >
                            {orgInfo.planName || "Free Trial"} ({currentStatus})
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-[#6a4d3a]">
                          {orgInfo.users.length} {orgInfo.users.length === 1 ? "usuario" : "usuarios"}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-[#5c4332]">Plan:</label>
                          <select
                            value={currentPlanId}
                            onChange={(event) =>
                              void handleSetOrgPlan(orgInfo.orgId, event.target.value, currentStatus)
                            }
                            disabled={busyAction === `${orgInfo.orgId}:plan`}
                            className="rounded-lg border border-[#d9c4b0] bg-white px-3 py-1.5 text-xs font-medium text-[#3b2a1e] shadow-sm hover:border-[#b89f8a] focus:outline-none focus:ring-2 focus:ring-[#8c674b] disabled:opacity-50"
                          >
                            <option value="" disabled>
                              Seleccionar plan...
                            </option>
                            {plans.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} {p.basePriceCents ? `($${(p.basePriceCents / 100).toFixed(2)}/mo)` : "(Free)"}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-[#5c4332]">Estado:</label>
                          <select
                            value={currentStatus}
                            onChange={(event) =>
                              void handleSetOrgPlan(
                                orgInfo.orgId,
                                currentPlanId || plans[0]?.id || "",
                                event.target.value as "active" | "trialing" | "past_due" | "canceled" | "unpaid"
                              )
                            }
                            disabled={busyAction === `${orgInfo.orgId}:plan`}
                            className="rounded-lg border border-[#d9c4b0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#3b2a1e] shadow-sm hover:border-[#b89f8a] focus:outline-none focus:ring-2 focus:ring-[#8c674b] disabled:opacity-50"
                          >
                            <option value="active">Active</option>
                            <option value="trialing">Trialing</option>
                            <option value="past_due">Past Due</option>
                            <option value="canceled">Canceled</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {Object.keys(groupedUsers).length === 0 && (
                  <div className="text-[#6a4d3a]">No organizations found.</div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-6">
            <h2 className="mb-2 text-lg font-semibold text-[#1f1a16]">Users</h2>
            {loading ? (
              <div className="py-4 text-sm text-[#6a4d3a]">Cargando usuarios...</div>
            ) : error ? (
              <div className="text-red-600">{error}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-[#f7f2ec]">
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Email</th>
                      <th className="px-3 py-2 text-left">Role</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Orgs &amp; Plan</th>
                      <th className="px-3 py-2 text-left">Membership</th>
                      <th className="px-3 py-2 text-left">Created</th>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-[#e6d6c6]">
                        <td className="px-3 py-2 font-medium text-[#1f1a16]">{user.fullName || "-"}</td>
                        <td className="px-3 py-2 text-[#3b2a1e]">{user.email}</td>
                        <td className="px-3 py-2">{user.role || user.memberships?.[0]?.role || "-"}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              user.status === "active"
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {user.status}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-2">
                            {user.memberships?.map((m) => {
                              const orgId = m.organization?.id;
                              const orgData = orgId ? organizations[orgId] : null;
                              const currentPlanId =
                                orgData?.planId ||
                                m.organization?.subscriptions?.[0]?.planId ||
                                plans.find((p) => p.code === orgData?.planCode)?.id ||
                                "";
                              const currentSubStatus = (orgData?.subscriptionStatus ||
                                m.organization?.subscriptions?.[0]?.status ||
                                "active") as "active" | "trialing" | "past_due" | "canceled" | "unpaid";

                              return (
                                <div key={m.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                                  <span className="font-semibold text-[#3b2a1e]">
                                    {m.organization?.name || "Org"}:
                                  </span>
                                  {orgId && (
                                    <div className="flex items-center gap-1">
                                      <select
                                        value={currentPlanId}
                                        onChange={(e) =>
                                          void handleSetOrgPlan(orgId, e.target.value, currentSubStatus)
                                        }
                                        disabled={busyAction === `${orgId}:plan`}
                                        className="rounded-lg border border-[#d9c4b0] bg-white px-2 py-1 text-xs font-medium text-[#3b2a1e] shadow-sm hover:border-[#b89f8a] focus:outline-none focus:ring-2 focus:ring-[#8c674b] disabled:opacity-50"
                                      >
                                        <option value="" disabled>Plan...</option>
                                        {plans.map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.name} {p.basePriceCents ? `($${(p.basePriceCents / 100).toFixed(2)})` : "(Free)"}
                                          </option>
                                        ))}
                                      </select>
                                      <select
                                        value={currentSubStatus}
                                        onChange={(e) =>
                                          void handleSetOrgPlan(
                                            orgId,
                                            currentPlanId || plans[0]?.id || "",
                                            e.target.value as "active" | "trialing" | "past_due" | "canceled" | "unpaid"
                                          )
                                        }
                                        disabled={busyAction === `${orgId}:plan`}
                                        className="rounded-lg border border-[#d9c4b0] bg-[#fffaf3] px-1.5 py-1 text-[11px] text-[#5c4332] shadow-sm hover:border-[#b89f8a] focus:outline-none disabled:opacity-50"
                                      >
                                        <option value="active">Active</option>
                                        <option value="trialing">Trialing</option>
                                        <option value="past_due">Past Due</option>
                                        <option value="canceled">Canceled</option>
                                      </select>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-2">
                            {(user.memberships ?? []).map((membership) => (
                              <div key={membership.id} className="flex items-center gap-2">
                                <span className="text-xs text-[#6a4d3a]">{membership.organization?.name}:</span>
                                <select
                                  value={(membership.role as "superadmin" | "admin" | "staff" | undefined) ?? "staff"}
                                  onChange={(event) =>
                                    void handleSetMembershipRole(
                                      membership.id,
                                      event.target.value as "superadmin" | "admin" | "staff"
                                    )
                                  }
                                  disabled={busyAction === `${membership.id}:role`}
                                  className="rounded-lg border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs"
                                >
                                  <option value="superadmin">superadmin</option>
                                  <option value="admin">admin</option>
                                  <option value="staff">staff</option>
                                </select>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-[#6a4d3a]">
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}
                        </td>
                        <td className="px-3 py-2">
                          {user.status === "inactive" ? (
                            <button
                              className="mr-2 rounded-full bg-[#1f1a16] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                              onClick={() => void handleSetStatus(user, "active")}
                              disabled={busyAction === `${user.id}:status`}
                            >
                              Unban
                            </button>
                          ) : (
                            <button
                              className="mr-2 rounded-full border border-[#c24d34] px-4 py-1.5 text-xs font-semibold text-[#c24d34] disabled:opacity-60"
                              onClick={() => void handleSetStatus(user, "inactive")}
                              disabled={busyAction === `${user.id}:status`}
                            >
                              Ban
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {users.length === 0 && <div className="mt-4 text-[#6a4d3a]">No users found.</div>}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}


