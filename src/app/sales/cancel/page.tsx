"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";

type SaleLine = {
  imei: string;
  model: string;
  capacity: string;
  color: string;
  status: string;
};

type SaleRecord = {
  saleId: string;
  soldAt: string;
  customer: string;
  lines: SaleLine[];
};

export default function CancelSalesPage() {
  const pathname = usePathname();
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [saleId, setSaleId] = useState("");
  const [reason, setReason] = useState("");
  const [selectedImeis, setSelectedImeis] = useState<Set<string>>(new Set());
  const [cancelMode, setCancelMode] = useState<"partial" | "full">("partial");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const loadSales = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/sales");
      const data = await response.json();
      if (!response.ok) {
        setStatus(data.error ?? "Failed to load sales.");
        return;
      }

      setSales(data.sales ?? []);
      setStatus(null);
    } catch {
      setStatus("Failed to load sales.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
  }, []);

  const selectedSale = useMemo(
    () => sales.find((sale) => sale.saleId === saleId) ?? null,
    [sales, saleId]
  );

  const cancellableLines = useMemo(
    () => (selectedSale?.lines ?? []).filter((line) => line.status !== "Cancelled"),
    [selectedSale]
  );

  const toggleImei = (imei: string) => {
    setSelectedImeis((current) => {
      const next = new Set(current);
      if (next.has(imei)) next.delete(imei);
      else next.add(imei);
      return next;
    });
  };

  const canSubmit =
    saleId.trim().length > 0 &&
    reason.trim().length > 0 &&
    (cancelMode === "full" || selectedImeis.size > 0);

  const handleSubmit = async () => {
    if (!canSubmit) {
      setStatus("Select a sale, enter a reason, and choose items (or full sale).");
      return;
    }

    try {
      setLoading(true);
      const payload = {
        saleId,
        reason: reason.trim(),
        fullSale: cancelMode === "full",
        items:
          cancelMode === "full"
            ? []
            : Array.from(selectedImeis).map((imei) => ({ imei })),
      };

      const response = await fetch("/api/cancel-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        setStatus(data.error ?? "Failed to cancel sale items.");
        return;
      }

      setStatus(data.message ?? "Sale cancellation completed.");
      setReason("");
      setSelectedImeis(new Set());
      await loadSales();
    } catch {
      setStatus("Failed to cancel sale items.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-6 px-6 py-10">
          <header>
            <h1 className="text-3xl font-semibold text-[#1f1a16]">Cancel Sales</h1>
            <p className="text-sm text-[#6a4d3a]">Cancel a full sale or selected IMEIs. Cancelled items return to Available status.</p>
          </header>

          <section className="rounded-xl border-2 border-[#eddac7] bg-white p-5">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-[#1f1a16]">
                Sale ID
                <select
                  value={saleId}
                  onChange={(event) => {
                    setSaleId(event.target.value);
                    setSelectedImeis(new Set());
                  }}
                  className="rounded-lg border border-[#eddac7] bg-[#fff9f0] px-3 py-2"
                >
                  <option value="">Select sale…</option>
                  {sales.map((sale) => (
                    <option key={sale.saleId} value={sale.saleId}>
                      {sale.saleId} — {sale.customer || "Walk-in"} — {new Date(sale.soldAt).toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-[#1f1a16]">
                Cancellation Reason
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why is this being cancelled?"
                  className="rounded-lg border border-[#eddac7] bg-[#fff9f0] px-3 py-2"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setCancelMode("partial")}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  cancelMode === "partial"
                    ? "bg-[#ff6b4a] text-white"
                    : "border border-[#eddac7] text-[#6a4d3a]"
                }`}
              >
                Partial by IMEI
              </button>
              <button
                type="button"
                onClick={() => setCancelMode("full")}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  cancelMode === "full"
                    ? "bg-[#ff6b4a] text-white"
                    : "border border-[#eddac7] text-[#6a4d3a]"
                }`}
              >
                Full Sale
              </button>
            </div>

            {selectedSale && (
              <div className="mt-5 rounded-lg border border-[#eddac7] bg-[#fff9f0] p-4">
                <p className="mb-3 text-sm font-semibold text-[#3b2a1e]">Sale Items</p>
                <div className="space-y-2">
                  {cancellableLines.length === 0 ? (
                    <p className="text-sm text-[#6a4d3a]">No cancellable items in this sale.</p>
                  ) : (
                    cancellableLines.map((line) => (
                      <label key={line.imei} className="flex items-center justify-between rounded bg-white px-3 py-2">
                        <span className="text-sm text-[#1f1a16]">
                          {line.imei} — {line.model} {line.capacity} {line.color}
                        </span>
                        <input
                          type="checkbox"
                          checked={selectedImeis.has(line.imei)}
                          onChange={() => toggleImei(line.imei)}
                          disabled={cancelMode === "full"}
                        />
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || loading}
                className="rounded-lg bg-[#c24d34] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading ? "Processing…" : cancelMode === "full" ? "Cancel Full Sale" : "Cancel Selected IMEIs"}
              </button>
              <button
                type="button"
                onClick={loadSales}
                className="rounded-lg border border-[#eddac7] px-5 py-2 text-sm font-semibold text-[#6a4d3a]"
              >
                Refresh
              </button>
            </div>
          </section>

          {status && (
            <div className="rounded-lg border-2 border-[#eddac7] bg-[#fff9f0] px-4 py-3 text-sm text-[#5c4332]">
              {status}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
