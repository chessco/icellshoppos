"use client";

import { useEffect, useMemo, useState } from "react";
import AppSidebar from "@/components/AppSidebar";
import { formatCurrencyDisplay } from "@/lib/display-format";

type AgingEntry = {
  saleId: string;
  saleNumber: string;
  originalAmount: number;
  paidAmount: number;
  balance: number;
  ageDays: number;
  createdAt: string;
};

type AgingCustomer = {
  customerId: string;
  customerName: string;
  buckets: Record<string, number>;
  totalBalance: number;
  entries: AgingEntry[];
};

type AuditHistoryRow = {
  id: string;
  periodStartAt: string;
  periodEndAt: string;
  expectedCashAmount: number;
  countedCashAmount: number;
  cashDifferenceAmount: number;
  expectedTransferAmount: number;
  countedTransferAmount: number;
  transferDifferenceAmount: number;
  notes: string;
  auditedBy: string;
  createdAt: string;
};

type AuditExpectedDetail = {
  id: string;
  channel: "cash" | "transfer";
  source: "sale" | "credit_payment_current" | "credit_payment_past";
  saleId: string;
  customer: string;
  customerType: "retail" | "wholesale";
  itemSummary: string;
  paymentMethod: string;
  totalCents: number;
  createdAt: string;
};

type AuditSummary = {
  periodStart: string;
  periodEnd: string;
  expectedCashCents: number;
  expectedTransferCents: number;
  cashFromSalesCents: number;
  transferFromSalesCents: number;
  creditGrantedCents: number;
  cashFromPastCreditPaymentsCents: number;
  transferFromPastCreditPaymentsCents: number;
  cashFromCurrentCreditPaymentsCents: number;
  transferFromCurrentCreditPaymentsCents: number;
  expectedCashDetails: AuditExpectedDetail[];
  expectedTransferDetails: AuditExpectedDetail[];
  creditAgingBuckets: AgingCustomer[];
  auditHistory: AuditHistoryRow[];
};

const money = (cents: number) => formatCurrencyDisplay(Math.round(cents / 100));
const moneyRaw = (raw: number) => formatCurrencyDisplay(Math.round(raw));

const diffClass = (diff: number) =>
  diff === 0
    ? "text-green-700 font-semibold"
    : diff > 0
    ? "text-blue-700 font-semibold"
    : "text-red-700 font-semibold";

const sumDetailCents = (rows: AuditExpectedDetail[]) =>
  rows.reduce((sum, row) => sum + row.totalCents, 0);

const customerTypeLabel = (value: "retail" | "wholesale") =>
  value === "wholesale" ? "Wholesale" : "Retail";

const detailSourceLabel = (value: AuditExpectedDetail["source"]) => {
  switch (value) {
    case "sale":
      return "Sale";
    case "credit_payment_current":
      return "Credit payment (current-period sale)";
    case "credit_payment_past":
      return "Credit payment (past sale)";
    default:
      return value;
  }
};

export default function AuditPage() {
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);

  // Close-out form
  const [countedCash, setCountedCash] = useState("");
  const [countedTransfer, setCountedTransfer] = useState("");
  const [auditNotes, setAuditNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [customerTypeFilter, setCustomerTypeFilter] = useState<"all" | "retail" | "wholesale">("all");

  // Expanded aging customer
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/audit")
      .then(async (res) => {
        if (res.status === 403) { setForbidden(true); return null; }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError((data as { error?: string }).error ?? "Failed to load audit data.");
          return null;
        }
        return res.json();
      })
      .then((data: AuditSummary | null) => {
        if (data) setSummary(data);
      })
      .catch(() => setError("Network error loading audit data."))
      .finally(() => setLoading(false));
  }, []);

  const filteredExpectedCashDetails = useMemo(() => {
    if (!summary) return [];
    if (customerTypeFilter === "all") return summary.expectedCashDetails;
    return summary.expectedCashDetails.filter((row) => row.customerType === customerTypeFilter);
  }, [summary, customerTypeFilter]);

  const filteredExpectedTransferDetails = useMemo(() => {
    if (!summary) return [];
    if (customerTypeFilter === "all") return summary.expectedTransferDetails;
    return summary.expectedTransferDetails.filter((row) => row.customerType === customerTypeFilter);
  }, [summary, customerTypeFilter]);

  const filteredExpectedCashCents = useMemo(
    () => sumDetailCents(filteredExpectedCashDetails),
    [filteredExpectedCashDetails]
  );

  const filteredExpectedTransferCents = useMemo(
    () => sumDetailCents(filteredExpectedTransferDetails),
    [filteredExpectedTransferDetails]
  );

  const openSalePopup = (saleId: string) => {
    if (!saleId || typeof window === "undefined") return;
    window.open(
      `/sales/history?search=${encodeURIComponent(saleId)}`,
      `audit-sale-${saleId}`,
      "popup=yes,width=1280,height=820,noopener,noreferrer"
    );
  };

  const handleCloseRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary) return;
    setSubmitting(true);
    setSubmitMessage(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countedCashAmount: Number(countedCash) || 0,
          countedTransferAmount: Number(countedTransfer) || 0,
          expectedCashAmount: summary.expectedCashCents / 100,
          expectedTransferAmount: summary.expectedTransferCents / 100,
          notes: auditNotes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitMessage({ text: (data as { error?: string }).error ?? "Failed to close register.", type: "error" });
      } else {
        setSubmitMessage({ text: "Register closed successfully. Reloading…", type: "success" });
        setCountedCash("");
        setCountedTransfer("");
        setAuditNotes("");
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch {
      setSubmitMessage({ text: "Network error. Please try again.", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  if (forbidden) {
    return (
      <div className="flex min-h-screen bg-[#f0f6ff]">
        <AppSidebar pathname="/audit" />
        <main className="flex-1 p-8 flex items-center justify-center">
          <p className="text-red-600 text-lg font-semibold">You do not have permission to view this page.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#f0f6ff]">
      <AppSidebar pathname="/audit" />
      <main className="flex-1 p-6 max-w-6xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold text-[#0f1f3d]">Register Audit</h1>

        {loading && <p className="text-gray-500">Loading audit data…</p>}
        {error && <p className="text-red-600">{error}</p>}

        {summary && (
          <>
            {/* Period info */}
            <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-4 space-y-3 text-sm text-gray-600">
              <div>
                <span className="font-medium text-[#0f1f3d]">Period: </span>
                {new Date(summary.periodStart).toLocaleString()} — {new Date(summary.periodEnd).toLocaleString()}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm font-medium text-[#0f1f3d]" htmlFor="audit-customer-type-filter">
                  Customer type
                </label>
                <select
                  id="audit-customer-type-filter"
                  value={customerTypeFilter}
                  onChange={(event) =>
                    setCustomerTypeFilter(event.target.value as "all" | "retail" | "wholesale")
                  }
                  className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-[#0f1f3d] focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="all">All customers</option>
                  <option value="retail">Retail only</option>
                  <option value="wholesale">Wholesale only</option>
                </select>
              </div>
            </div>

            {/* Cash / Transfer summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Cash card */}
              <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6 space-y-3">
                <h2 className="text-lg font-bold text-[#0f1f3d]">Cash</h2>
                {customerTypeFilter !== "all" && (
                  <p className="text-xs text-gray-500">
                    Filtered expected cash: {money(filteredExpectedCashCents)} · Register total: {money(summary.expectedCashCents)}
                  </p>
                )}
                <div className="space-y-1 text-sm text-gray-700">
                  <div className="flex justify-between">
                    <span>From sales</span>
                    <span className="font-medium">{money(summary.cashFromSalesCents)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Credit payments (this period)</span>
                    <span className="font-medium">{money(summary.cashFromCurrentCreditPaymentsCents)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Credit payments (past sales)</span>
                    <span className="font-medium">{money(summary.cashFromPastCreditPaymentsCents)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 text-base font-bold text-[#0f1f3d]">
                    <span>{customerTypeFilter === "all" ? "Expected cash" : "Filtered cash"}</span>
                    <span>{money(customerTypeFilter === "all" ? summary.expectedCashCents : filteredExpectedCashCents)}</span>
                  </div>
                </div>
              </div>

              {/* Transfer card */}
              <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6 space-y-3">
                <h2 className="text-lg font-bold text-[#0f1f3d]">Transfer / Card</h2>
                {customerTypeFilter !== "all" && (
                  <p className="text-xs text-gray-500">
                    Filtered expected transfer: {money(filteredExpectedTransferCents)} · Register total: {money(summary.expectedTransferCents)}
                  </p>
                )}
                <div className="space-y-1 text-sm text-gray-700">
                  <div className="flex justify-between">
                    <span>From sales</span>
                    <span className="font-medium">{money(summary.transferFromSalesCents)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Credit payments (this period)</span>
                    <span className="font-medium">{money(summary.transferFromCurrentCreditPaymentsCents)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Credit payments (past sales)</span>
                    <span className="font-medium">{money(summary.transferFromPastCreditPaymentsCents)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 text-base font-bold text-[#0f1f3d]">
                    <span>{customerTypeFilter === "all" ? "Expected transfer" : "Filtered transfer"}</span>
                    <span>{money(customerTypeFilter === "all" ? summary.expectedTransferCents : filteredExpectedTransferCents)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Expected details */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-[#0f1f3d]">Expected Cash Details</h2>
                  <span className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-semibold text-[#1f4db8]">
                    {money(filteredExpectedCashCents)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="py-2 pr-3">Sale ID</th>
                        <th className="py-2 pr-3">Customer</th>
                        <th className="py-2 pr-3">Item</th>
                        <th className="py-2 pr-3">Source</th>
                        <th className="py-2 pr-3">Payment</th>
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExpectedCashDetails.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-sm text-gray-500">
                            No cash entries for this filter.
                          </td>
                        </tr>
                      ) : (
                        filteredExpectedCashDetails.map((row) => (
                          <tr key={row.id} className="border-b border-blue-50 align-top hover:bg-blue-50/60 transition">
                            <td className="py-2 pr-3">
                              {row.saleId ? (
                                <button
                                  type="button"
                                  onClick={() => openSalePopup(row.saleId)}
                                  className="font-semibold text-[#2563eb] hover:underline"
                                >
                                  {row.saleId}
                                </button>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="py-2 pr-3">
                              <div className="font-medium text-[#0f1f3d]">{row.customer}</div>
                              <div className="text-xs text-gray-500">{customerTypeLabel(row.customerType)}</div>
                            </td>
                            <td className="py-2 pr-3 text-[#1f3563]">{row.itemSummary}</td>
                            <td className="py-2 pr-3 text-xs text-gray-500">{detailSourceLabel(row.source)}</td>
                            <td className="py-2 pr-3">{row.paymentMethod}</td>
                            <td className="py-2 pr-3 text-xs text-gray-500">
                              {new Date(row.createdAt).toLocaleString()}
                            </td>
                            <td className="py-2 text-right font-semibold text-[#0f1f3d]">{money(row.totalCents)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-[#0f1f3d]">Expected Transfer Details</h2>
                  <span className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-semibold text-[#1f4db8]">
                    {money(filteredExpectedTransferCents)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="py-2 pr-3">Sale ID</th>
                        <th className="py-2 pr-3">Customer</th>
                        <th className="py-2 pr-3">Item</th>
                        <th className="py-2 pr-3">Source</th>
                        <th className="py-2 pr-3">Payment</th>
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExpectedTransferDetails.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-sm text-gray-500">
                            No transfer or card entries for this filter.
                          </td>
                        </tr>
                      ) : (
                        filteredExpectedTransferDetails.map((row) => (
                          <tr key={row.id} className="border-b border-blue-50 align-top hover:bg-blue-50/60 transition">
                            <td className="py-2 pr-3">
                              {row.saleId ? (
                                <button
                                  type="button"
                                  onClick={() => openSalePopup(row.saleId)}
                                  className="font-semibold text-[#2563eb] hover:underline"
                                >
                                  {row.saleId}
                                </button>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="py-2 pr-3">
                              <div className="font-medium text-[#0f1f3d]">{row.customer}</div>
                              <div className="text-xs text-gray-500">{customerTypeLabel(row.customerType)}</div>
                            </td>
                            <td className="py-2 pr-3 text-[#1f3563]">{row.itemSummary}</td>
                            <td className="py-2 pr-3 text-xs text-gray-500">{detailSourceLabel(row.source)}</td>
                            <td className="py-2 pr-3">{row.paymentMethod}</td>
                            <td className="py-2 pr-3 text-xs text-gray-500">
                              {new Date(row.createdAt).toLocaleString()}
                            </td>
                            <td className="py-2 text-right font-semibold text-[#0f1f3d]">{money(row.totalCents)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Credit granted this period */}
            <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-4 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Credit granted this period</span>
              <span className="font-bold text-[#0f1f3d]">{money(summary.creditGrantedCents)}</span>
            </div>

            {/* Credit aging */}
            {summary.creditAgingBuckets.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6 space-y-4">
                <h2 className="text-lg font-bold text-[#0f1f3d]">Credit Aging</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="py-2 pr-4">Customer</th>
                        <th className="py-2 pr-4 text-right">0–30 days</th>
                        <th className="py-2 pr-4 text-right">31–60 days</th>
                        <th className="py-2 pr-4 text-right">61–90 days</th>
                        <th className="py-2 pr-4 text-right">90+ days</th>
                        <th className="py-2 text-right font-bold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.creditAgingBuckets.map((row) => (
                        <>
                          <tr
                            key={row.customerId}
                            className="border-b cursor-pointer hover:bg-blue-50 transition"
                            onClick={() =>
                              setExpandedCustomer(
                                expandedCustomer === row.customerId ? null : row.customerId
                              )
                            }
                          >
                            <td className="py-2 pr-4 font-medium text-[#1f3563]">
                              {row.customerName}
                              <span className="ml-1 text-xs text-gray-400">
                                {expandedCustomer === row.customerId ? "▲" : "▼"}
                              </span>
                            </td>
                            <td className="py-2 pr-4 text-right">{moneyRaw(row.buckets["0-30"] / 100)}</td>
                            <td className="py-2 pr-4 text-right">{moneyRaw(row.buckets["31-60"] / 100)}</td>
                            <td className="py-2 pr-4 text-right">{moneyRaw(row.buckets["61-90"] / 100)}</td>
                            <td className="py-2 pr-4 text-right">{moneyRaw(row.buckets["90+"] / 100)}</td>
                            <td className="py-2 text-right font-bold text-[#0f1f3d]">
                              {moneyRaw(row.totalBalance / 100)}
                            </td>
                          </tr>
                          {expandedCustomer === row.customerId && (
                            <tr key={`${row.customerId}-detail`}>
                              <td colSpan={6} className="py-2 pl-4 bg-[#f8faff]">
                                <table className="w-full text-xs text-gray-600">
                                  <thead>
                                    <tr className="text-left border-b border-gray-200">
                                      <th className="py-1 pr-3">Sale #</th>
                                      <th className="py-1 pr-3">Date</th>
                                      <th className="py-1 pr-3 text-right">Original</th>
                                      <th className="py-1 pr-3 text-right">Paid</th>
                                      <th className="py-1 text-right">Balance</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.entries.map((e) => (
                                      <tr key={e.saleId} className="border-b border-gray-100">
                                        <td className="py-1 pr-3">{e.saleNumber}</td>
                                        <td className="py-1 pr-3">
                                          {new Date(e.createdAt).toLocaleDateString()} ({e.ageDays}d)
                                        </td>
                                        <td className="py-1 pr-3 text-right">{moneyRaw(e.originalAmount / 100)}</td>
                                        <td className="py-1 pr-3 text-right">{moneyRaw(e.paidAmount / 100)}</td>
                                        <td className="py-1 text-right font-semibold text-red-600">
                                          {moneyRaw(e.balance / 100)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Close-out form */}
            <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6 space-y-4">
              <h2 className="text-lg font-bold text-[#0f1f3d]">Balance Register</h2>
              <form onSubmit={handleCloseRegister} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Counted Cash (expected: {money(summary.expectedCashCents)})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={countedCash}
                      onChange={(e) => setCountedCash(e.target.value)}
                      placeholder="0.00"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      required
                    />
                    {countedCash !== "" && (
                      <p className={`text-xs mt-1 ${diffClass(Number(countedCash) - summary.expectedCashCents / 100)}`}>
                        Difference: {moneyRaw(Number(countedCash) - summary.expectedCashCents / 100)}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Counted Transfer (expected: {money(summary.expectedTransferCents)})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={countedTransfer}
                      onChange={(e) => setCountedTransfer(e.target.value)}
                      placeholder="0.00"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      required
                    />
                    {countedTransfer !== "" && (
                      <p className={`text-xs mt-1 ${diffClass(Number(countedTransfer) - summary.expectedTransferCents / 100)}`}>
                        Difference: {moneyRaw(Number(countedTransfer) - summary.expectedTransferCents / 100)}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                  <textarea
                    value={auditNotes}
                    onChange={(e) => setAuditNotes(e.target.value)}
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Any discrepancy explanation or notes…"
                  />
                </div>
                {submitMessage && (
                  <p
                    className={`text-sm font-medium ${
                      submitMessage.type === "success" ? "text-green-700" : "text-red-600"
                    }`}
                  >
                    {submitMessage.text}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-[#2563eb] text-white px-6 py-2 rounded-xl text-sm font-semibold hover:bg-[#1d4ed8] disabled:opacity-50 transition"
                >
                  {submitting ? "Closing…" : "Close Register"}
                </button>
              </form>
            </div>

            {/* Audit history */}
            {summary.auditHistory.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6 space-y-4">
                <h2 className="text-lg font-bold text-[#0f1f3d]">Audit History</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="py-2 pr-3">Period</th>
                        <th className="py-2 pr-3 text-right">Exp. Cash</th>
                        <th className="py-2 pr-3 text-right">Counted Cash</th>
                        <th className="py-2 pr-3 text-right">Cash Diff</th>
                        <th className="py-2 pr-3 text-right">Exp. Transfer</th>
                        <th className="py-2 pr-3 text-right">Counted Transfer</th>
                        <th className="py-2 pr-3 text-right">Transfer Diff</th>
                        <th className="py-2 pr-3">Auditor</th>
                        <th className="py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.auditHistory.map((row) => (
                        <tr key={row.id} className="border-b hover:bg-blue-50 transition">
                          <td className="py-2 pr-3 text-xs text-gray-500">
                            {new Date(row.periodStartAt).toLocaleDateString()} –{" "}
                            {new Date(row.periodEndAt).toLocaleDateString()}
                          </td>
                          <td className="py-2 pr-3 text-right">{moneyRaw(row.expectedCashAmount)}</td>
                          <td className="py-2 pr-3 text-right">{moneyRaw(row.countedCashAmount)}</td>
                          <td className={`py-2 pr-3 text-right ${diffClass(row.cashDifferenceAmount)}`}>
                            {moneyRaw(row.cashDifferenceAmount)}
                          </td>
                          <td className="py-2 pr-3 text-right">{moneyRaw(row.expectedTransferAmount)}</td>
                          <td className="py-2 pr-3 text-right">{moneyRaw(row.countedTransferAmount)}</td>
                          <td className={`py-2 pr-3 text-right ${diffClass(row.transferDifferenceAmount)}`}>
                            {moneyRaw(row.transferDifferenceAmount)}
                          </td>
                          <td className="py-2 pr-3 text-xs">{row.auditedBy}</td>
                          <td className="py-2 text-xs text-gray-500">{row.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
