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

  useEffect(() => {
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
  }, []);

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
                        <td className="px-3 py-2">{sub.orgName}</td>
                        <td className="px-3 py-2">{sub.planName} <span className="text-xs text-[#a88]">({sub.planCode})</span></td>
                        <td className="px-3 py-2">{sub.status}</td>
                        <td className="px-3 py-2">{formatDollars(sub.planPrice)}</td>
                        <td className="px-3 py-2">{sub.planTrial}</td>
                        <td className="px-3 py-2">{sub.createdAt ? new Date(sub.createdAt).toLocaleDateString() : "-"}</td>
                        <td className="px-3 py-2">{sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString() : "-"}</td>
                        <td className="px-3 py-2">
                          <button className="rounded-full bg-[#1f1a16] px-4 py-2 text-sm font-semibold text-white" title="Impersonate Org" onClick={() => alert(`Impersonate ${sub.orgName}`)}>Impersonate</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {subscriptions.length === 0 && <div className="text-[#6a4d3a] mt-4">No subscriptions found.</div>}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

