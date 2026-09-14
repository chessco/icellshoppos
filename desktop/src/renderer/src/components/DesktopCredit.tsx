import { useEffect, useMemo, useState } from "react";

type Props = {
  baseUrl: string;
  signedIn: boolean;
};

const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

const parseMoney = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function DesktopCredit({ baseUrl, signedIn }: Props) {
  const [tab, setTab] = useState<"credits" | "payables">("credits");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const [customers, setCustomers] = useState<DesktopCreditCustomer[]>([]);
  const [payables, setPayables] = useState<DesktopCreditPayable[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedLinkedSaleKey, setSelectedLinkedSaleKey] = useState("");
  const [showPaidOff, setShowPaidOff] = useState(false);

  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [note, setNote] = useState("");

  const [editingEntryId, setEditingEntryId] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [reconcilingSaleNumber, setReconcilingSaleNumber] = useState("");

  const [sales, setSales] = useState<DesktopSaleRecord[]>([]);

  const loadCredits = async () => {
    if (!signedIn) {
      setError("Sign in to use Credit.");
      setCustomers([]);
      return;
    }

    if (!window.desktop?.credit?.ledger) {
      setError("Desktop bridge is outdated. Restart the desktop app to load Credit support.");
      setCustomers([]);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const payload = await window.desktop.credit.ledger({ baseUrl });
      const rows = payload.customers ?? [];
      setCustomers(rows);
      setStatus(rows.length === 0 ? "No credit customers found." : `Loaded ${rows.length} credit customers.`);
      if (rows.length > 0) {
        setSelectedCustomerId((current) => (current && rows.some((row) => row.id === current) ? current : rows[0].id));
      } else {
        setSelectedCustomerId("");
      }
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load credit ledger.");
      setCustomers([]);
    } finally {
      setBusy(false);
    }
  };

  const loadPayables = async () => {
    if (!signedIn || !window.desktop?.credit?.payables) return;
    setBusy(true);
    setError("");
    try {
      const payload = await window.desktop.credit.payables({ baseUrl });
      const rows = payload.payables ?? [];
      setPayables(rows);
      setStatus(rows.length === 0 ? "No payables found." : `Loaded ${rows.length} payable account(s).`);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load payables.");
      setPayables([]);
    } finally {
      setBusy(false);
    }
  };

  const loadSales = async () => {
    if (!window.desktop?.sales?.history) return;
    try {
      const payload = await window.desktop.sales.history({ baseUrl });
      setSales(payload.sales ?? []);
    } catch {
      setSales([]);
    }
  };

  useEffect(() => {
    void loadCredits();
    void loadSales();
  }, [baseUrl, signedIn]);

  useEffect(() => {
    if (tab === "payables") {
      void loadPayables();
    }
  }, [tab]);

  const visibleCustomers = useMemo(() => {
    if (showPaidOff) return customers;
    return customers.filter((customer) => Number(customer.balance ?? 0) !== 0);
  }, [customers, showPaidOff]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );

  const selectedCustomerEntries = useMemo(() => {
    if (!selectedCustomer) return [];
    const entries = Array.isArray(selectedCustomer.entries) ? selectedCustomer.entries : [];
    return [...entries].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return bTime - aTime;
    });
  }, [selectedCustomer]);

  const selectedLinkedSale = useMemo(() => {
    if (!selectedLinkedSaleKey) return null;
    return (
      sales.find((sale) => {
        const bySaleId = String(sale.saleId ?? "") === selectedLinkedSaleKey;
        const bySaleNumber = String((sale as { saleNumber?: string }).saleNumber ?? "") === selectedLinkedSaleKey;
        return bySaleId || bySaleNumber;
      }) ?? null
    );
  }, [sales, selectedLinkedSaleKey]);

  const handleAddPayment = async () => {
    if (!selectedCustomer || !window.desktop?.credit?.addPayment) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setStatus("Enter a valid payment amount.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await window.desktop.credit.addPayment({
        baseUrl,
        data: {
          customerId: selectedCustomer.id,
          amount: value,
          paymentMethod,
          note: note.trim() || undefined,
        },
      });
      setAmount("");
      setNote("");
      setStatus("Payment recorded.");
      await loadCredits();
    } catch (addError: unknown) {
      setError(addError instanceof Error ? addError.message : "Failed to record payment.");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdatePayment = async () => {
    if (!editingEntryId || !window.desktop?.credit?.updatePayment) return;
    const value = Number(editAmount);
    if (!Number.isFinite(value) || value <= 0) {
      setStatus("Enter a valid amount.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await window.desktop.credit.updatePayment({
        baseUrl,
        data: {
          id: editingEntryId,
          amount: value,
        },
      });
      setEditingEntryId("");
      setEditAmount("");
      setStatus("Payment updated.");
      await loadCredits();
    } catch (updateError: unknown) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update payment.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePayment = async (id: string) => {
    if (!window.desktop?.credit?.deletePayment) return;
    setBusy(true);
    setError("");
    try {
      await window.desktop.credit.deletePayment({ baseUrl, data: { id } });
      setStatus("Payment deleted.");
      await loadCredits();
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete payment.");
    } finally {
      setBusy(false);
    }
  };

  const handleReconcileCancelledSale = async (saleNumber: string) => {
    if (!saleNumber || !window.desktop?.credit?.reconcileCancelledSale) return;

    setReconcilingSaleNumber(saleNumber);
    setError("");
    try {
      const response = await window.desktop.credit.reconcileCancelledSale({
        baseUrl,
        data: { saleNumber },
      });
      setStatus(response.message ?? `Reconcile completed for ${saleNumber}.`);
      await loadCredits();
    } catch (reconcileError: unknown) {
      setError(reconcileError instanceof Error ? reconcileError.message : "Failed to reconcile cancelled sale.");
    } finally {
      setReconcilingSaleNumber("");
    }
  };

  return (
    <div className="credit-shell">
      <section className="credit-toolbar">
        <div>
          <h2>Customer Credit</h2>
          <p>Track balances, payments, and payable accounts.</p>
        </div>
        <div className="credit-toolbar__actions">
          <button type="button" onClick={() => void loadCredits()} disabled={busy}>Refresh</button>
          <button type="button" onClick={() => setTab((current) => (current === "credits" ? "payables" : "credits"))}>
            {tab === "credits" ? "Open Payables" : "Open Credits"}
          </button>
        </div>
      </section>

      {tab === "credits" ? (
        <>
          <section className="credit-controls">
            <label className="credit-toggle-inline">
              <input type="checkbox" checked={showPaidOff} onChange={(event) => setShowPaidOff(event.target.checked)} />
              <span>Show paid-off customers</span>
            </label>
          </section>

          <section className="credit-layout">
            <div className="credit-customers">
              <div className={visibleCustomers.length >= 5 ? "credit-customers-list is-scrollable" : "credit-customers-list"}>
                {visibleCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    className={selectedCustomerId === customer.id ? "credit-customer active" : "credit-customer"}
                    onClick={() => {
                      setSelectedCustomerId(customer.id);
                      setSelectedLinkedSaleKey("");
                    }}
                  >
                    <strong>{customer.name}</strong>
                    <span>{money(customer.balance)}</span>
                  </button>
                ))}
                {visibleCustomers.length === 0 ? <p className="hint">No customers for current filter.</p> : null}
              </div>

              {selectedCustomer ? (
                <div className="credit-summary-grid credit-summary-grid--left">
                  <div><span>On Credit</span><strong>{money(selectedCustomer.totalOnCredit)}</strong></div>
                  <div><span>Payments</span><strong>{money(selectedCustomer.totalPayments)}</strong></div>
                  <div><span>Cancellations</span><strong>{money(selectedCustomer.totalCancellations)}</strong></div>
                  <div><span>Outstanding</span><strong>{money(selectedCustomer.balance)}</strong></div>
                </div>
              ) : null}
            </div>

            <div className="credit-main">
              {selectedCustomer ? (
                <>
                  <div className="credit-payment-form">
                    <input
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Payment amount"
                    />
                    <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                      <option value="Cash">Cash</option>
                      <option value="Transfer">Transfer</option>
                    </select>
                    <input
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Note (optional)"
                    />
                    <button type="button" onClick={() => void handleAddPayment()} disabled={busy}>Add Payment</button>
                  </div>

                  <div className="credit-entries-wrap">
                    <table className="credit-entries-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Sale</th>
                          <th>Type</th>
                          <th>Amount</th>
                          <th>Note</th>
                          <th>By</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCustomerEntries.map((entry) => {
                          const isEditable = entry.type === "partial_payment" && !String(entry.note ?? "").startsWith("[CANCELLATION]");
                          return (
                            <tr key={entry.id}>
                              <td>{new Date(entry.createdAt).toLocaleDateString()}</td>
                              <td>
                                {entry.saleNumber ? (
                                  <button
                                    type="button"
                                    className="credit-sale-link"
                                    onClick={() =>
                                      setSelectedLinkedSaleKey(entry.saleNumber ?? entry.saleId ?? "")
                                    }
                                  >
                                    {entry.saleNumber}
                                  </button>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td>{entry.type.replace(/_/g, " ")}</td>
                              <td>{money(entry.amount)}</td>
                              <td>{entry.note || "-"}</td>
                              <td>{entry.createdBy || "-"}</td>
                              <td>
                                {isEditable ? (
                                  <div className="credit-entry-actions">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingEntryId(entry.id);
                                        setEditAmount(String(Math.abs(Number(entry.amount))));
                                      }}
                                    >
                                      Edit
                                    </button>
                                    <button type="button" onClick={() => void handleDeletePayment(entry.id)}>Delete</button>
                                  </div>
                                ) : null}
                                {entry.type === "sale_on_credit" && entry.saleNumber ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleReconcileCancelledSale(entry.saleNumber ?? "")}
                                    disabled={reconcilingSaleNumber === entry.saleNumber}
                                  >
                                    {reconcilingSaleNumber === entry.saleNumber ? "Reconciling..." : "Reconcile"}
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                        {selectedCustomerEntries.length === 0 ? (
                          <tr>
                            <td colSpan={7}>No credit entries.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="hint">Select a customer to inspect credit ledger.</p>
              )}
            </div>

            <aside className="credit-sale-detail">
              <h3>Linked Sale Detail</h3>
              {selectedLinkedSale ? (
                <>
                  <p>{selectedLinkedSale.saleId} • {new Date(selectedLinkedSale.soldAt).toLocaleString()}</p>
                  <p>Customer: {selectedLinkedSale.customer || "-"}</p>
                  <p>Payment: {selectedLinkedSale.paymentMethod || "-"}</p>
                  <div className="credit-sale-lines-wrap">
                    <table className="credit-sale-lines">
                      <thead>
                        <tr>
                          <th>IMEI / SN</th>
                          <th>Device</th>
                          <th>Sold</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedLinkedSale.lines.map((line) => (
                          <tr key={line.id}>
                            <td>{line.imei || line.serialNumber || "-"}</td>
                            <td>{line.model} {line.capacity} {line.color}</td>
                            <td>{money(parseMoney(line.salePrice))}</td>
                            <td>{line.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="hint">Click a Sale ID in the ledger table to open related sale details here.</p>
              )}
            </aside>
          </section>
        </>
      ) : (
        <section className="credit-payables-grid">
          {payables.map((payable) => (
            <article key={`${payable.orgId}-${payable.customerName}`} className="credit-payable-card">
              <h3>{payable.orgName}</h3>
              <p>{payable.customerName}</p>
              <strong>{money(payable.balance)}</strong>
            </article>
          ))}
          {payables.length === 0 ? <p className="hint">No payable balances.</p> : null}
        </section>
      )}

      {editingEntryId ? (
        <section className="credit-edit-inline">
          <h3>Edit Payment</h3>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={editAmount}
            onChange={(event) => setEditAmount(event.target.value)}
          />
          <button type="button" onClick={() => void handleUpdatePayment()} disabled={busy}>Save</button>
          <button type="button" onClick={() => setEditingEntryId("")}>Cancel</button>
        </section>
      ) : null}

      {error ? <p className="hint">{error}</p> : null}
      {status ? <p className="hint">{status}</p> : null}
    </div>
  );
}
