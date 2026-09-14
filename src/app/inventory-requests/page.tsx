"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";

type ToastState = {
  message: string;
  type: "success" | "error";
} | null;

type TransferItem = {
  id: string;
  imei: string;
  model: string;
  capacity: string;
  color: string;
  sourceSalePrice: string;
  importedAt: string | null;
};

type TransferRequest = {
  id: string;
  status: string;
  customerEmail: string;
  sourceOrganizationId: string;
  sourceOrganization: { id: string; name: string };
  sale: { id: string; saleNumber: string; createdAt: string };
  createdAt: string;
  isTradeIn: boolean;
  importedCount: number;
  pendingCount: number;
  items: TransferItem[];
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function InventoryRequestsPage() {
  const pathname = usePathname();
  const [requests, setRequests] = useState<TransferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast(null);
    }, 2600);

    return () => window.clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory-requests", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to load inventory requests.", "error");
        return;
      }
      setRequests(data.requests ?? []);
      setToast(null);
    } catch {
      showToast("Failed to load inventory requests.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const importRequest = async (requestId: string) => {
    setBusyId(requestId);
    try {
      const res = await fetch("/api/inventory-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to import inventory request.", "error");
        return;
      }
      showToast(data.message ?? "Inventory request imported.", "success");
      await load();
    } catch {
      showToast("Failed to import inventory request.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const deleteRequest = async (requestId: string) => {
    if (!window.confirm("Delete this pending inventory request? This cannot be undone.")) {
      return;
    }

    setBusyId(requestId);
    try {
      const res = await fetch("/api/inventory-requests", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to delete inventory request.", "error");
        return;
      }
      showToast(data.message ?? "Inventory request deleted.", "success");
      await load();
    } catch {
      showToast("Failed to delete inventory request.", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="app-shell">
      <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-6 px-6 py-10">
          <header>
            <h1 className="text-3xl font-semibold text-[#1f1a16]">Inventory Requests</h1>
            <p className="text-sm text-[#6a4d3a]">
              Accept inventory purchased from other Pro Buyer companies and add it to your inventory. OR add the Trade-in devices you have received from completed purchases.
            </p>
          </header>

          {toast && (
            <div className="pointer-events-none fixed right-6 top-6 z-40">
              <div
                className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-sm ${
                  toast.type === "success"
                    ? "border-[#d6c1ad] bg-[#fffaf3] text-[#1f1a16]"
                    : "border-[#c24d34] bg-[#fff7f5] text-[#6a4d3a]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <p>{toast.message}</p>
                  <button
                    type="button"
                    onClick={() => setToast(null)}
                    className="text-xs font-semibold text-[#6a4d3a]"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-4">
            {loading ? (
              <p className="text-sm text-[#5f7298]">Loading requests...</p>
            ) : requests.length === 0 ? (
              <p className="text-sm text-[#5f7298]">No incoming inventory requests yet.</p>
            ) : (
              <div className="space-y-6">
                {/* B2B Section */}
                {requests.filter((r) => !r.isTradeIn).length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-[#1f1a16] mb-3">B2B Purchases</h2>
                    <div className="space-y-2">
                      {requests
                        .filter((r) => !r.isTradeIn)
                        .map((requestRecord) => (
                          <article key={requestRecord.id} className="rounded-xl border border-[#ead8c6] bg-[#fffdf8] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-[#1f1a16]">
                                  {requestRecord.sourceOrganization.name} → Sale {requestRecord.sale.saleNumber}
                                </p>
                                <p className="text-xs text-[#6a4d3a]">
                                  Customer Email: {requestRecord.customerEmail} · Created: {fmtDate(requestRecord.createdAt)}
                                </p>
                                <p className="text-xs text-[#6a4d3a]">
                                  Pending: {requestRecord.pendingCount} · Imported: {requestRecord.importedCount}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={busyId === requestRecord.id || requestRecord.pendingCount === 0}
                                  onClick={() => importRequest(requestRecord.id)}
                                  className="rounded-full bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                                >
                                  {busyId === requestRecord.id ? "Importing..." : "Import Pending Items"}
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === requestRecord.id || requestRecord.importedCount > 0}
                                  onClick={() => deleteRequest(requestRecord.id)}
                                  className="rounded-full border border-[#c24d34] px-4 py-2 text-xs font-semibold text-[#c24d34] disabled:opacity-60"
                                  title={requestRecord.importedCount > 0 ? "Cannot delete partially imported requests" : "Delete pending request"}
                                >
                                  {busyId === requestRecord.id ? "Working..." : "Delete Request"}
                                </button>
                              </div>
                            </div>

                            <div className="mt-3 overflow-auto">
                              <table className="min-w-full text-left text-xs">
                                <thead>
                                  <tr className="border-b border-[#ead8c6] text-[#6a4d3a]">
                                    <th className="px-2 py-1">IMEI</th>
                                    <th className="px-2 py-1">Model</th>
                                    <th className="px-2 py-1">Capacity</th>
                                    <th className="px-2 py-1">Color</th>
                                    <th className="px-2 py-1">Sale Price</th>
                                    <th className="px-2 py-1">State</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {requestRecord.items.map((item) => (
                                    <tr key={item.id} className="border-b border-[#f2e8dc]">
                                      <td className="px-2 py-1">{item.imei}</td>
                                      <td className="px-2 py-1">{item.model}</td>
                                      <td className="px-2 py-1">{item.capacity}</td>
                                      <td className="px-2 py-1">{item.color}</td>
                                      <td className="px-2 py-1">{item.sourceSalePrice}</td>
                                      <td className="px-2 py-1">{item.importedAt ? "Imported" : "Pending"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </article>
                        ))}
                    </div>
                  </div>
                )}

                {/* Trade-In Section */}
                {requests.filter((r) => r.isTradeIn).length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-[#1f1a16] mb-3">Trade-In Devices</h2>
                    <div className="space-y-2">
                      {requests
                        .filter((r) => r.isTradeIn)
                        .map((requestRecord) => (
                          <article key={requestRecord.id} className="rounded-xl border border-[#e6d6c6] bg-[#f8f7f6] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-[#1f1a16]">
                                  Trade-In from Sale {requestRecord.sale.saleNumber}
                                </p>
                                <p className="text-xs text-[#6a4d3a]">
                                  Customer Email: {requestRecord.customerEmail} · Created: {fmtDate(requestRecord.createdAt)}
                                </p>
                                <p className="text-xs text-[#6a4d3a]">
                                  Pending: {requestRecord.pendingCount} · Imported: {requestRecord.importedCount}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={busyId === requestRecord.id || requestRecord.pendingCount === 0}
                                  onClick={() => importRequest(requestRecord.id)}
                                  className="rounded-full bg-[#7c3aed] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                                >
                                  {busyId === requestRecord.id ? "Importing..." : "Import Pending Items"}
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === requestRecord.id || requestRecord.importedCount > 0}
                                  onClick={() => deleteRequest(requestRecord.id)}
                                  className="rounded-full border border-[#c24d34] px-4 py-2 text-xs font-semibold text-[#c24d34] disabled:opacity-60"
                                  title={requestRecord.importedCount > 0 ? "Cannot delete partially imported requests" : "Delete pending request"}
                                >
                                  {busyId === requestRecord.id ? "Working..." : "Delete Request"}
                                </button>
                              </div>
                            </div>

                            <div className="mt-3 overflow-auto">
                              <table className="min-w-full text-left text-xs">
                                <thead>
                                  <tr className="border-b border-[#e6d6c6] text-[#6a4d3a]">
                                    <th className="px-2 py-1">IMEI</th>
                                    <th className="px-2 py-1">Model</th>
                                    <th className="px-2 py-1">Capacity</th>
                                    <th className="px-2 py-1">Color</th>
                                    <th className="px-2 py-1">Sale Price</th>
                                    <th className="px-2 py-1">State</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {requestRecord.items.map((item) => (
                                    <tr key={item.id} className="border-b border-[#f2e8dc]">
                                      <td className="px-2 py-1">{item.imei}</td>
                                      <td className="px-2 py-1">{item.model}</td>
                                      <td className="px-2 py-1">{item.capacity}</td>
                                      <td className="px-2 py-1">{item.color}</td>
                                      <td className="px-2 py-1">{item.sourceSalePrice}</td>
                                      <td className="px-2 py-1">{item.importedAt ? "Imported" : "Pending"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </article>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
