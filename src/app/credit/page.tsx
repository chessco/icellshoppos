// Safe workspace: new credit page implementation goes here.
// Copy your intended logic, components, and UI here for testing.
// Once validated, this can replace the original page.tsx.

"use client";

import { useEffect, useState, useMemo } from "react";
import AppSidebar from "@/components/AppSidebar";
import { formatCurrencyDisplay } from "@/lib/display-format";

const todayIsoDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toDateInputValue = (isoDate: string | null | undefined) => {
  if (!isoDate) return todayIsoDate();
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return todayIsoDate();
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

type CreditCustomer = {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  balance: number;
  totalOnCredit: number;
  totalCancellations: number;
  totalPayments: number;
  entries: Array<{
    id: string;
    saleId: string | null;
    saleNumber: string | null;
    saleDate: string | null;
    type: string;
    amount: number;
    note: string | null;
    createdAt: string;
    createdBy: string | null;
  }>;
};

type PayableEntry = {
  orgId: string;
  orgName: string;
  customerName: string;
  customerEmail: string | null;
  balance: number;
  entries: Array<{
    id: string;
    type: string;
    amount: number;
    note: string | null;
    paymentMethod: string | null;
    createdAt: string;
  }>;
};

export default function CreditPage() {
  const [activeTab, setActiveTab] = useState<"credits" | "payables">("credits");
  const [customers, setCustomers] = useState<CreditCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [submitting, setSubmitting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [showPaidOff, setShowPaidOff] = useState(false);
  const [payables, setPayables] = useState<PayableEntry[]>([]);
  const [payablesLoading, setPayablesLoading] = useState(false);
  const [payablesError, setPayablesError] = useState("");
  const [expandedPayableOrgId, setExpandedPayableOrgId] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState<string | null>(null);
  const [reconcileMessage, setReconcileMessage] = useState<{ saleId: string; message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/credit-ledger")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const nextError = typeof data?.error === "string" ? data.error : "Failed to load credit data.";
          throw new Error(nextError);
        }
        return data;
      })
      .then((data) => {
        setCustomers(data.customers || []);
        setError("");
        setLoading(false);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to load credit data.";
        setError(message);
        setLoading(false);
        if (message.toLowerCase().includes("admin")) {
          setActiveTab("payables");
        }
      });
  }, [refresh]);

  useEffect(() => {
    if (activeTab !== "payables") return;

    setPayablesLoading(true);
    setPayablesError("");

    fetch("/api/credit-ledger/payables")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const nextError = typeof data?.error === "string" ? data.error : "Failed to load payables.";
          throw new Error(nextError);
        }
        return data;
      })
      .then((data) => {
        setPayables(Array.isArray(data.payables) ? data.payables : []);
        setPayablesLoading(false);
      })
      .catch((err: unknown) => {
        setPayablesError(err instanceof Error ? err.message : "Failed to load payables.");
        setPayablesLoading(false);
      });
  }, [activeTab]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  const paymentHistoryRows = useMemo(() => {
    if (!selectedCustomer) return [] as Array<
      CreditCustomer["entries"][number] & {
        owedBefore: number;
        paymentAmount: number | null;
        outstandingAfter: number;
      }
    >;

    let runningBalance = 0;

    return selectedCustomer.entries.map((entry) => {
      const amountValue = Number(entry.amount);
      const owedBefore = runningBalance;
      const outstandingAfter = owedBefore + amountValue;
      runningBalance = outstandingAfter;

      const isCustomerPayment =
        entry.type === "partial_payment" &&
        !String(entry.note ?? "").startsWith("[CANCELLATION]");

      return {
        ...entry,
        owedBefore,
        paymentAmount: isCustomerPayment ? Math.abs(amountValue) : null,
        outstandingAfter,
      };
    });
  }, [selectedCustomer]);

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !amount.trim()) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/credit-ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          amount: Number(amount),
          paymentDate,
          note: note.trim() || undefined,
          paymentMethod: paymentMethod.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add payment.");
      } else {
        setSuccess("Payment recorded.");
        setAmount("");
        setPaymentDate(todayIsoDate());
        setNote("");
        setPaymentMethod("Cash");
        setRefresh((r) => r + 1);
      }
    } catch {
      setError("Failed to add payment.");
    } finally {
      setSubmitting(false);
    }
  };

  // Edit/Delete state and handlers (must be outside JSX)
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editPaymentDate, setEditPaymentDate] = useState(todayIsoDate());
  const [editSubmitting, setEditSubmitting] = useState(false);
  const handleEditPayment = (entry: any) => {
    setEditingPayment(entry);
    setEditAmount(String(Math.abs(Number(entry.amount))));
    setEditPaymentDate(toDateInputValue(entry.createdAt));
  };
  const handleSaveEdit = async () => {
    if (!editingPayment || !editAmount.trim()) return;
    const amt = Number(editAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Please enter a valid amount.");
      return;
    }
    setEditSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/credit-ledger", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingPayment.id, amount: amt, paymentDate: editPaymentDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update payment.");
      } else {
        setSuccess("Payment updated.");
        setEditingPayment(null);
        setEditAmount("");
        setEditPaymentDate(todayIsoDate());
        setRefresh((r) => r + 1);
      }
    } catch {
      setError("Failed to update payment.");
    } finally {
      setEditSubmitting(false);
    }
  };
  const handleDeletePayment = async (entry: any) => {
    if (!selectedCustomerId) return;
    if (window.confirm("Delete this payment?")) {
      setSubmitting(true);
      setError("");
      setSuccess("");
      try {
        const res = await fetch(`/api/credit-ledger`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: entry.id }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Failed to delete payment.");
        } else {
          setSuccess("Payment deleted.");
          setRefresh((r) => r + 1);
        }
      } catch {
        setError("Failed to delete payment.");
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleReconcileCancelledSale = async (saleNumber: string) => {
    setReconciling(saleNumber);
    setReconcileMessage(null);
    try {
      const res = await fetch("/api/credit-ledger/reconcile-cancelled-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleNumber }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReconcileMessage({
          saleId: saleNumber,
          message: data.error || "Failed to reconcile.",
          type: "error",
        });
      } else {
        setReconcileMessage({
          saleId: saleNumber,
          message: data.changed ? `Reconciled: ${data.summary?.missingAdjustment ? `$${data.summary.missingAdjustment.toFixed(2)} added back` : "No changes needed"}` : "Already in sync.",
          type: "success",
        });
        if (data.changed) {
          setRefresh((r) => r + 1);
        }
      }
    } catch {
      setReconcileMessage({
        saleId: saleNumber,
        message: "Failed to reconcile.",
        type: "error",
      });
    } finally {
      setReconciling(null);
    }
  };

  return (
    <div className="flex min-h-screen">
      <AppSidebar pathname="/credit" />
      <main className="flex-1 px-4 py-8 md:px-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-[#1f3563]">Customer Credit</h1>
          <div className="inline-flex rounded-full border border-[#d6e4ff] bg-[#f7fbff] p-1">
            <button
              type="button"
              onClick={() => setActiveTab("credits")}
              className={`rounded-full px-4 py-1 text-sm font-semibold transition ${
                activeTab === "credits"
                  ? "bg-[#2563eb] text-white"
                  : "text-[#2563eb] hover:bg-[#edf4ff]"
              }`}
            >
              Credits
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("payables")}
              className={`rounded-full px-4 py-1 text-sm font-semibold transition ${
                activeTab === "payables"
                  ? "bg-[#c24d34] text-white"
                  : "text-[#c24d34] hover:bg-[#fff1ed]"
              }`}
            >
              Payables
            </button>
          </div>
        </div>

        {activeTab === "credits" && (
          <>
            {loading ? (
              <div className="text-[#5f7298]">Loading…</div>
            ) : (
              <>
                {error && <div className="mb-4 text-sm text-[#c24d34]">{error}</div>}
                {!error && (
                  <>
                    <div className="mb-4">
                      <button
                        className="rounded-full border border-[#2563eb] bg-white px-4 py-1 text-sm font-semibold text-[#2563eb] transition hover:bg-[#f0f6ff]"
                        onClick={() => setShowPaidOff((v) => !v)}
                        type="button"
                      >
                        {showPaidOff ? "Hide Paid Off Customers" : "Show Paid Off Customers"}
                      </button>
                    </div>
                    {(() => {
                      const filtered = showPaidOff
                        ? customers
                        : customers.filter((c) => c.balance !== 0);
                      if (filtered.length === 0) {
                        return (
                          <div className="text-[#5f7298]">
                            No customers with {showPaidOff ? "credit records" : "outstanding balance"}.
                          </div>
                        );
                      }
                      return (
                        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                          {filtered.map((c) => (
                            <div
                              key={c.id}
                              className={[
                                "cursor-pointer rounded-2xl border border-[#d6e4ff] bg-white p-5 shadow-sm transition hover:shadow-lg",
                                selectedCustomerId === c.id ? "ring-2 ring-[#2563eb]" : "",
                              ].join(" ")}
                              onClick={() => setSelectedCustomerId(c.id)}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-lg font-semibold text-[#0f1f3d]">{c.name}</div>
                                  <div className="text-xs text-[#5f7298]">
                                    {c.email} {c.whatsapp && <>· {c.whatsapp}</>}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div
                                    className={[
                                      "text-sm font-semibold",
                                      c.balance < 0
                                        ? "text-[#1a5c30]"
                                        : c.balance > 0
                                          ? "text-[#c24d34]"
                                          : "text-[#1f3563]",
                                    ].join(" ")}
                                  >
                                    {formatCurrencyDisplay(c.balance)}
                                  </div>
                                  <div className="text-xs text-[#5f7298]">Outstanding</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </>
                )}
              </>
            )}
          </>
        )}

        {activeTab === "payables" && (
          <>
            <p className="mb-4 text-sm text-[#5f7298]">
              Balances your organization owes to other organizations where your members are registered as customers.
            </p>
            {payablesLoading && <div className="text-[#5f7298]">Loading…</div>}
            {!payablesLoading && payablesError && <div className="text-sm text-[#c24d34]">{payablesError}</div>}
            {!payablesLoading && !payablesError && payables.length === 0 && (
              <div className="rounded-2xl border border-[#d6e4ff] bg-white p-6 text-center text-[#1f3563]">
                You owe nothing
              </div>
            )}
            {!payablesLoading && !payablesError && payables.length > 0 && (
              <div className="grid gap-6 md:grid-cols-2">
                {payables.map((payable) => (
                  <div key={`${payable.orgId}-${payable.customerEmail ?? payable.customerName}`} className="rounded-2xl border border-[#f0d2cb] bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-[#9b5d52]">You owe</div>
                        <div className="text-base font-semibold text-[#0f1f3d]">{payable.orgName}</div>
                        <div className="text-xs text-[#5f7298]">
                          {payable.customerName}
                          {payable.customerEmail ? ` · ${payable.customerEmail}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-bold text-[#c24d34]">
                          {formatCurrencyDisplay(payable.balance)}
                        </div>
                        <div className="text-xs text-[#5f7298]">Outstanding</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedPayableOrgId((prev) =>
                          prev === payable.orgId ? null : payable.orgId
                        )
                      }
                      className="mt-3 text-xs font-semibold text-[#2563eb] hover:underline"
                    >
                      {expandedPayableOrgId === payable.orgId ? "Hide details" : "View details"}
                    </button>
                    {expandedPayableOrgId === payable.orgId && (
                      <div className="mt-3 overflow-x-auto rounded-xl border border-[#f3e2de]">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[#f3e2de] text-left text-[#8d5147]">
                              <th className="px-3 py-2">Date</th>
                              <th className="px-3 py-2">Type</th>
                              <th className="px-3 py-2">Amount</th>
                              <th className="px-3 py-2">Note</th>
                            </tr>
                          </thead>
                          <tbody>
                            {payable.entries.map((entry) => (
                              <tr key={entry.id} className="border-b border-[#f7ece9] last:border-b-0">
                                <td className="px-3 py-2 text-[#29477e]">
                                  {new Date(entry.createdAt).toLocaleDateString("en-US", {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </td>
                                <td className="px-3 py-2">{entry.type.replace(/_/g, " ")}</td>
                                <td
                                  className={[
                                    "px-3 py-2 font-semibold",
                                    entry.amount < 0 ? "text-[#1a5c30]" : "text-[#c24d34]",
                                  ].join(" ")}
                                >
                                  {formatCurrencyDisplay(entry.amount)}
                                </td>
                                <td className="px-3 py-2 text-[#5f7298]">{entry.note || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "credits" && selectedCustomer && !error && (
          <div className="mt-10 max-w-2xl">
            <div className="mb-6 rounded-2xl border border-[#d6e4ff] bg-[#f7fbff] p-6">
              <div className="mb-2 text-lg font-semibold text-[#0f1f3d]">{selectedCustomer.name} Credit Summary</div>
              <div className="flex flex-wrap gap-4">
                <div>
                  <div className="text-xs text-[#5f7298]">Total on Credit</div>
                  <div className="font-bold text-[#1f3563]">{formatCurrencyDisplay(selectedCustomer.totalOnCredit)}</div>
                </div>
                <div>
                  <div className="text-xs text-[#5f7298]">Total Payments</div>
                  <div className="font-bold text-[#1a5c30]">{formatCurrencyDisplay(selectedCustomer.totalPayments)}</div>
                </div>
                <div>
                  <div className="text-xs text-[#5f7298]">Cancellations</div>
                  <div className="font-bold text-[#7a4e0e]">{formatCurrencyDisplay(selectedCustomer.totalCancellations)}</div>
                </div>
                <div>
                  <div className="text-xs text-[#5f7298]">Outstanding</div>
                  <div className={["font-bold", selectedCustomer.balance < 0 ? "text-[#1a5c30]" : selectedCustomer.balance > 0 ? "text-[#c24d34]" : "text-[#1f3563]"].join(" ")}>{formatCurrencyDisplay(selectedCustomer.balance)}</div>
                </div>
              </div>
            </div>

            <form onSubmit={handleAddPayment} className="mb-8 rounded-2xl border border-[#d6e4ff] bg-white p-6">
              <div className="mb-2 text-base font-semibold text-[#0f1f3d]">Record Payment</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount"
                  className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                  required
                />
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                  required
                />
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                  required
                >
                  <option value="Cash">Cash</option>
                  <option value="Transfer">Transfer</option>
                </select>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (optional)"
                  className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                />
              </div>
              {error && <div className="mt-2 text-sm text-[#c24d34]">{error}</div>}
              {success && <div className="mt-2 text-sm text-[#1a5c30]">{success}</div>}
              <button
                type="submit"
                disabled={submitting}
                className="mt-3 rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
              >
                {submitting ? "Saving..." : "Add Payment"}
              </button>
            </form>

            <div className="rounded-2xl border border-[#d6e4ff] bg-white p-6">
              <div className="mb-2 text-base font-semibold text-[#0f1f3d]">Payment History</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#eef4ff] text-left text-xs uppercase tracking-wider text-[#4b6292]">
                      <th className="pb-2 pr-4 font-semibold">Date</th>
                      <th className="pb-2 pr-4 font-semibold">Owed Before</th>
                      <th className="pb-2 pr-4 font-semibold">Payment</th>
                      <th className="pb-2 pr-4 font-semibold">Outstanding After</th>
                      <th className="pb-2 pr-4 font-semibold">Amount</th>
                      <th className="pb-2 pr-4 font-semibold">Type</th>
                      <th className="pb-2 pr-4 font-semibold">Note</th>
                      <th className="pb-2 pr-4 font-semibold">By</th>
                      <th className="pb-2 pr-4 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef4ff]">
                    {paymentHistoryRows.map((e) => (
                      <tr key={e.id}>
                        <td className="py-2 pr-4 text-[#29477e]">
                          {e.createdAt ? new Date(e.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : ""}
                        </td>
                        <td className="py-2 pr-4 text-[#1f3563]">
                          {formatCurrencyDisplay(e.owedBefore)}
                        </td>
                        <td className="py-2 pr-4 text-[#1a5c30] font-semibold">
                          {e.paymentAmount === null ? "—" : formatCurrencyDisplay(e.paymentAmount)}
                        </td>
                        <td className="py-2 pr-4 text-[#1f3563] font-semibold">
                          {formatCurrencyDisplay(e.outstandingAfter)}
                        </td>
                        <td className={["py-2 pr-4 font-semibold", e.amount < 0 ? "text-[#1a5c30]" : e.amount > 0 ? "text-[#c24d34]" : "text-[#1f3563]"].join(" ")}>{formatCurrencyDisplay(e.amount)}</td>
                        <td className="py-2 pr-4">{e.type.replace(/_/g, " ")}</td>
                        <td className="py-2 pr-4 text-xs">{e.note}</td>
                        <td className="py-2 pr-4 text-xs">{e.createdBy}</td>
                        <td className="py-2 pr-4 flex gap-2">
                          {e.type === "sale_on_credit" && e.saleNumber && (
                            <button
                              className="text-xs text-orange-600 hover:underline disabled:opacity-60"
                              onClick={() => handleReconcileCancelledSale(e.saleNumber!)}
                              type="button"
                              disabled={reconciling === e.saleNumber}
                            >
                              {reconciling === e.saleNumber ? "Reconciling..." : "Reconcile"}
                            </button>
                          )}
                          {e.type === "partial_payment" && !String(e.note ?? "").startsWith("[CANCELLATION]") && (
                            <button
                              className="text-xs text-blue-600 hover:underline"
                              onClick={() => handleEditPayment(e)}
                              type="button"
                            >Edit</button>
                          )}
                          {e.type === "partial_payment" && !String(e.note ?? "").startsWith("[CANCELLATION]") && (
                            <button
                              className="text-xs text-red-600 hover:underline"
                              onClick={() => handleDeletePayment(e)}
                              type="button"
                            >Delete</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selectedCustomer.entries.length === 0 && (
                  <div className="py-4 text-center text-[#5f7298]">No payment history.</div>
                )}
              </div>
              {reconcileMessage && (
                <div className={`mt-4 rounded-lg px-3 py-2 text-sm ${
                  reconcileMessage.type === "success"
                    ? "bg-[#f0fde4] text-[#1a5c30]"
                    : "bg-[#fde4e4] text-[#c24d34]"
                }`}>
                  <strong>{reconcileMessage.saleId}:</strong> {reconcileMessage.message}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {editingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 text-base font-semibold text-[#0f1f3d]">Edit Payment</div>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#5f7298]">Amount</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="w-full rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                autoFocus
              />
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-[#5f7298]">Payment date</label>
              <input
                type="date"
                value={editPaymentDate}
                onChange={(e) => setEditPaymentDate(e.target.value)}
                className="w-full rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                required
              />
            </div>
            {error && <div className="mb-2 text-sm text-[#c24d34]">{error}</div>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={editSubmitting}
                className="rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
              >
                {editSubmitting ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingPayment(null);
                  setEditAmount("");
                  setEditPaymentDate(todayIsoDate());
                }}
                className="rounded-full border border-[#bfd4ff] px-5 py-2 text-sm font-semibold text-[#5f7298] transition hover:bg-[#f0f6ff]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
