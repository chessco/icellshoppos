"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  memberships?: Array<{
    user?: {
      fullName?: string | null;
      email?: string | null;
    } | null;
  }>;
};

export default function AdminOrganizationsPage() {
  const pathname = usePathname();
  const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/organizations")
      .then((res) => res.json())
      .then((data) => {
        setOrgs(data.organizations || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load organizations");
        setLoading(false);
      });
  }, []);

  return (
    <div className="app-shell">
      <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-6 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 text-sm text-[#5c4332]">
          <span className="font-bold">Super Admin &gt; Organizations</span>
        </div>
      </nav>
      <div className="grid w-full md:grid-cols-[220px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-8 px-6 py-10">
          <header>
            <h1 className="text-3xl font-semibold text-[#1f1a16]">All Organizations</h1>
            <p className="text-sm text-[#6a4d3a]">View, search, and manage all organizations and their users.</p>
          </header>
          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-6">
            <h2 className="text-lg font-semibold text-[#1f1a16] mb-2">Organizations</h2>
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
                      <th className="px-3 py-2 text-left">Slug</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Users</th>
                      <th className="px-3 py-2 text-left">Created</th>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgs.map((org) => (
                      <tr key={org.id} className="border-b border-[#e6d6c6]">
                        <td className="px-3 py-2">{org.name}</td>
                        <td className="px-3 py-2">{org.slug}</td>
                        <td className="px-3 py-2">{org.status}</td>
                        <td className="px-3 py-2">{org.memberships?.map((m) => m.user?.fullName || m.user?.email).join(", ")}</td>
                        <td className="px-3 py-2">{org.createdAt ? new Date(org.createdAt).toLocaleDateString() : "-"}</td>
                        <td className="px-3 py-2">
                          <button className="rounded-full bg-[#1f1a16] px-4 py-2 text-sm font-semibold text-white mr-2" title="Impersonate Org" onClick={() => alert(`Impersonate ${org.name}`)}>Impersonate</button>
                          <button className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-semibold text-[#3b2a1e]" title="Deactivate Org" onClick={() => alert(`Deactivate ${org.name}`)}>Deactivate</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {orgs.length === 0 && <div className="text-[#6a4d3a] mt-4">No organizations found.</div>}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

