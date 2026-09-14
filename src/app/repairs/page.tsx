"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppSidebar from "@/components/AppSidebar";
import { formatCurrencyDisplay } from "@/lib/display-format";
import { formatWhatsappForDisplay } from "@/lib/whatsapp";

type RepairTicketListItem = {
  id: string;
  repairId: string;
  repairNumber: string;
  brand: string;
  model: string;
  color: string | null;
  imei: string | null;
  customerName: string;
  customerWhatsapp: string;
  customerEmail: string | null;
  stage: string;
  status: string;
  diagnosisPending: boolean;
  quotedTotal: number | null;
  partsCost: number | null;
  createdAt: string;
  updatedAt: string;
  readyForPickupAt: string | null;
  partsSupplier: { id: string; name: string } | null;
  statusLogs?: Array<{
    id: string;
    stage: string;
    status: string;
    notes: string | null;
    createdAt: string;
    changedBy: string;
  }>;
};

const stageTabs = [
  { key: "", label: "All" },
  { key: "receive", label: "Receive" },
  { key: "diagnosis", label: "Diagnosis" },
  { key: "repairing", label: "Repairing" },
  { key: "ready_for_pickup", label: "Ready for pickup" },
  { key: "completed", label: "Completed" },
];

const stageLabel = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export default function RepairsPage() {
  const [tickets, setTickets] = useState<RepairTicketListItem[]>([]);
  const [stage, setStage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    const loadTickets = async () => {
      try {
        setLoading(true);
        setError("");
        setForbidden(false);

        const params = new URLSearchParams();
        if (stage) params.set("stage", stage);

        const response = await fetch(`/api/repairs?${params.toString()}`);
        if (response.status === 403) {
          setForbidden(true);
          setTickets([]);
          return;
        }

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load repairs.");
        }

        setTickets(payload.tickets ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load repairs.");
      } finally {
        setLoading(false);
      }
    };

    void loadTickets();
  }, [stage]);

  return (
    <div className="flex min-h-screen bg-[#f0f6ff]">
      <AppSidebar pathname="/repairs" />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dbe7ff] md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#4c6cb3]">Repairs</p>
              <h1 className="mt-2 text-3xl font-semibold text-[#112146]">Repair workflow</h1>
              <p className="mt-2 max-w-2xl text-sm text-[#5a6d93]">
                Receive devices, document diagnosis, track internal repair progress, and move tickets into the pickup queue.
              </p>
            </div>
            <Link
              href="/repairs/new"
              className="inline-flex items-center justify-center rounded-2xl bg-[#1d4ed8] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(29,78,216,0.25)] transition hover:bg-[#1e40af]"
            >
              Receive device
            </Link>
          </div>

          <div className="flex flex-wrap gap-3">
            {stageTabs.map((tab) => (
              <button
                key={tab.key || "all"}
                type="button"
                onClick={() => setStage(tab.key)}
                className={[
                  "rounded-full px-4 py-2 text-sm font-medium transition",
                  stage === tab.key
                    ? "bg-[#0f1f3d] text-white"
                    : "bg-white text-[#1f3563] ring-1 ring-[#dbe7ff] hover:bg-[#ebf3ff]",
                ].join(" ")}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {forbidden && (
            <div className="rounded-2xl bg-white p-6 text-sm font-medium text-red-600 shadow-sm ring-1 ring-[#dbe7ff]">
              You do not have permission to manage repairs.
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-white p-6 text-sm font-medium text-red-600 shadow-sm ring-1 ring-[#dbe7ff]">
              {error}
            </div>
          )}

          <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[#dbe7ff]">
            <div className="border-b border-[#e6eeff] px-6 py-4">
              <h2 className="text-lg font-semibold text-[#112146]">Repair tickets</h2>
            </div>

            {loading ? (
              <div className="px-6 py-8 text-sm text-[#5a6d93]">Loading repairs...</div>
            ) : tickets.length === 0 ? (
              <div className="px-6 py-8 text-sm text-[#5a6d93]">No repair tickets found for this filter.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#f8fbff] text-left text-[#5870a0]">
                    <tr>
                      <th className="px-6 py-3 font-medium">Ticket</th>
                      <th className="px-6 py-3 font-medium">Customer</th>
                      <th className="px-6 py-3 font-medium">Device</th>
                      <th className="px-6 py-3 font-medium">Stage</th>
                      <th className="px-6 py-3 font-medium">Quote</th>
                      <th className="px-6 py-3 font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((ticket) => (
                      <tr key={ticket.id} className="border-t border-[#edf3ff] align-top hover:bg-[#fbfdff]">
                        <td className="px-6 py-4">
                          <Link href={`/repairs/${ticket.id}`} className="font-semibold text-[#1d4ed8] hover:text-[#1e40af]">
                            {ticket.repairId}
                          </Link>
                          <div className="mt-1 text-xs text-[#6b7fa8]">{ticket.status.split("_").join(" ")}</div>
                        </td>
                        <td className="px-6 py-4 text-[#1f3563]">
                          <div className="font-medium">{ticket.customerName}</div>
                          <div className="mt-1 text-xs text-[#6b7fa8]">{formatWhatsappForDisplay(ticket.customerWhatsapp)}</div>
                          {ticket.customerEmail && <div className="mt-1 text-xs text-[#6b7fa8]">{ticket.customerEmail}</div>}
                        </td>
                        <td className="px-6 py-4 text-[#1f3563]">
                          <div className="font-medium">{ticket.brand} {ticket.model}</div>
                          <div className="mt-1 text-xs text-[#6b7fa8]">
                            {[ticket.color, ticket.imei].filter(Boolean).join(" · ") || "No extra device identifiers"}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-[#1f3563]">
                          <span className="rounded-full bg-[#eaf2ff] px-3 py-1 text-xs font-semibold text-[#2452ad]">
                            {stageLabel(ticket.stage)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-[#1f3563]">
                          {ticket.quotedTotal === null
                            ? ticket.diagnosisPending
                              ? "Pending diagnosis"
                              : "-"
                            : formatCurrencyDisplay(ticket.quotedTotal)}
                        </td>
                        <td className="px-6 py-4 text-xs text-[#6b7fa8]">{new Date(ticket.updatedAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}