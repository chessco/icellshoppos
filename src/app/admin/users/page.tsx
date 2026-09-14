"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";

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
    } | null;
  }>;
};

type GroupedUsers = Record<
  string,
  Array<{ id: string; fullName: string | null; email: string; status: string; role: string }>
>;

export default function AdminUsersPage() {
  const pathname = usePathname();
  const [users, setUsers] = useState<UserRow[]>([]);
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
            <p className="text-sm text-[#6a4d3a]">Grouped by organization with ban/unban and membership controls.</p>
          </header>

          {feedback && (
            <div className="rounded-2xl border border-[#e6d6c6] bg-[#fff6ea] px-4 py-3 text-sm text-[#5c4332]">
              {feedback}
            </div>
          )}

          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-6">
            <h2 className="mb-2 text-lg font-semibold text-[#1f1a16]">Users by Organization</h2>
            {loading ? (
              <div>Loading...</div>
            ) : error ? (
              <div className="text-red-600">{error}</div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedUsers).map(([organization, organizationUsers]) => (
                  <div key={organization} className="rounded-xl border border-[#e6d6c6] p-3">
                    <h3 className="text-sm font-semibold text-[#3b2a1e]">{organization}</h3>
                    <div className="mt-2 text-sm text-[#6a4d3a]">{organizationUsers.length} users</div>
                  </div>
                ))}
                {Object.keys(groupedUsers).length === 0 && <div className="text-[#6a4d3a]">No organizations found.</div>}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-6">
            <h2 className="text-lg font-semibold text-[#1f1a16] mb-2">Users</h2>
            {loading ? (
              <div>Loading...</div>
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
                      <th className="px-3 py-2 text-left">Orgs</th>
                      <th className="px-3 py-2 text-left">Membership</th>
                      <th className="px-3 py-2 text-left">Created</th>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-[#e6d6c6]">
                        <td className="px-3 py-2">{user.fullName}</td>
                        <td className="px-3 py-2">{user.email}</td>
                        <td className="px-3 py-2">{user.role || user.memberships?.[0]?.role || "-"}</td>
                        <td className="px-3 py-2">{user.status}</td>
                        <td className="px-3 py-2">{user.memberships?.map((m) => m.organization?.name).join(", ")}</td>
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
                        <td className="px-3 py-2">{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}</td>
                        <td className="px-3 py-2">
                          {user.status === "inactive" ? (
                            <button
                              className="mr-2 rounded-full bg-[#1f1a16] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                              onClick={() => void handleSetStatus(user, "active")}
                              disabled={busyAction === `${user.id}:status`}
                            >
                              Unban
                            </button>
                          ) : (
                            <button
                              className="mr-2 rounded-full border border-[#c24d34] px-4 py-2 text-sm font-semibold text-[#c24d34] disabled:opacity-60"
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
                {users.length === 0 && <div className="text-[#6a4d3a] mt-4">No users found.</div>}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

