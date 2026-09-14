"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";

type AuditLogRow = {
  id: string;
  createdAt: string;
  action: string;
  details: string | null;
  user?: {
    fullName?: string | null;
    email?: string | null;
  } | null;
  organization?: {
    name?: string | null;
  } | null;
};

export default function AdminLogsPage() {
  const pathname = usePathname();
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/logs")
      .then((res) => res.json())
      .then((data) => {
        setLogs(data.logs || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load logs");
        setLoading(false);
      });
  }, []);

  return (
    <div className="app-shell">
      <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-6 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 text-sm text-[#5c4332]">
          <span className="font-bold">Super Admin &gt; System Logs</span>
        </div>
      </nav>
      <div className="grid w-full md:grid-cols-[220px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-8 px-6 py-10">
          <header>
            <h1 className="text-3xl font-semibold text-[#1f1a16]">System Logs</h1>
            <p className="text-sm text-[#6a4d3a]">Audit log of key actions, logins, and changes across the platform.</p>
          </header>
          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-6">
            <h2 className="text-lg font-semibold text-[#1f1a16] mb-2">Recent Events</h2>
            {loading ? (
              <div>Loading...</div>
            ) : error ? (
              <div className="text-red-600">{error}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-[#f7f2ec]">
                      <th className="px-3 py-2 text-left">Timestamp</th>
                      <th className="px-3 py-2 text-left">User</th>
                      <th className="px-3 py-2 text-left">Org</th>
                      <th className="px-3 py-2 text-left">Action</th>
                      <th className="px-3 py-2 text-left">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b border-[#e6d6c6]">
                        <td className="px-3 py-2">{log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"}</td>
                        <td className="px-3 py-2">{log.user?.fullName || log.user?.email || "-"}</td>
                        <td className="px-3 py-2">{log.organization?.name || "-"}</td>
                        <td className="px-3 py-2">{log.action}</td>
                        <td className="px-3 py-2">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {logs.length === 0 && <div className="text-[#6a4d3a] mt-4">No logs found.</div>}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

