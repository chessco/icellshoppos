import { useEffect, useMemo, useState } from "react";

type Props = {
  baseUrl: string;
  signedIn: boolean;
};

const parseMoney = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

const getStatus = (sale: DesktopSaleRecord) => {
  const statuses = Array.from(new Set(sale.lines.map((line) => line.status)));
  if (statuses.length === 1 && statuses[0] === "Cancelled") return "Cancelled";
  if (statuses.includes("Cancelled")) return "Partially Cancelled";
  if (statuses.length === 1 && statuses[0] === "Finished") return "Finished";
  return "Pending";
};

export function DesktopSalesHistory({ baseUrl, signedIn }: Props) {
  const [busy, setBusy] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [sendingEmailSaleId, setSendingEmailSaleId] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [sales, setSales] = useState<DesktopSaleRecord[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerTypeFilter, setCustomerTypeFilter] = useState("all");

  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [showCancelOptions, setShowCancelOptions] = useState(false);
  const [cancelMode, setCancelMode] = useState<"full" | "partial">("full");
  const [cancelReason, setCancelReason] = useState("");
  const [selectedCancelLineIds, setSelectedCancelLineIds] = useState<Set<string>>(new Set());

  const loadSales = async () => {
    if (!signedIn) {
      setError("Sign in to use Sales History.");
      setSales([]);
      return;
    }

    if (!window.desktop?.sales?.history) {
      setError("Desktop bridge is outdated. Restart the desktop app to load Sales History support.");
      setSales([]);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const payload = await window.desktop.sales.history({ baseUrl });
      const nextSales = payload.sales ?? [];
      setSales(nextSales);
      setStatus(
        nextSales.length === 0
          ? "No sales logs returned for the active organization yet."
          : `Loaded ${nextSales.length} sale logs.`
      );

      if (nextSales.length > 0) {
        setSelectedSaleId((current) =>
          current && nextSales.some((sale) => sale.saleId === current) ? current : nextSales[0].saleId
        );
      } else {
        setSelectedSaleId("");
      }
    } catch (loadError: unknown) {
      setSales([]);
      setError(loadError instanceof Error ? loadError.message : "Failed to load sales history.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadSales();
  }, [baseUrl, signedIn]);

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales.filter((sale) => {
      const saleStatus = getStatus(sale);
      if (statusFilter !== "all" && saleStatus !== statusFilter) return false;
      if (customerTypeFilter !== "all" && sale.customerType !== customerTypeFilter) return false;
      if (!q) return true;

      return [
        sale.saleId,
        sale.customer,
        sale.customerEmail,
        sale.customerWhatsapp,
        sale.paymentMethod,
        sale.soldBy,
        sale.notes,
        ...sale.lines.flatMap((line) => [line.imei, line.serialNumber, line.model, line.capacity, line.color]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [customerTypeFilter, sales, search, statusFilter]);

  const selectedSale = useMemo(() => {
    if (!selectedSaleId) return filteredSales[0] ?? null;
    return filteredSales.find((sale) => sale.saleId === selectedSaleId) ?? filteredSales[0] ?? null;
  }, [filteredSales, selectedSaleId]);

  const summary = useMemo(() => {
    const transactions = filteredSales.length;
    const items = filteredSales.reduce((sum, sale) => sum + sale.lines.length, 0);
    const totalCost = filteredSales.reduce(
      (sum, sale) => sum + sale.lines.reduce((lineSum, line) => lineSum + parseMoney(line.costPesos), 0),
      0
    );
    const totalSale = filteredSales.reduce(
      (sum, sale) => sum + sale.lines.reduce((lineSum, line) => lineSum + parseMoney(line.salePrice), 0),
      0
    );
    return {
      transactions,
      items,
      totalCost,
      totalSale,
      margin: totalSale - totalCost,
    };
  }, [filteredSales]);

  const handleExportCsv = () => {
    if (filteredSales.length === 0) return;

    const headers = [
      "Sale ID",
      "Sold At",
      "Customer",
      "Customer Type",
      "Email",
      "WhatsApp",
      "Payment",
      "Sold By",
      "IMEI",
      "Serial",
      "Model",
      "Capacity",
      "Color",
      "Cost",
      "Sale",
      "Line Status",
      "Sale Status",
    ];

    const rows = filteredSales.flatMap((sale) =>
      sale.lines.map((line) => [
        sale.saleId,
        sale.soldAt,
        sale.customer,
        sale.customerType,
        sale.customerEmail,
        sale.customerWhatsapp,
        sale.paymentMethod,
        sale.soldBy,
        line.imei,
        line.serialNumber ?? "",
        line.model,
        line.capacity,
        line.color,
        String(Math.round(parseMoney(line.costPesos))),
        String(Math.round(parseMoney(line.salePrice))),
        line.status,
        getStatus(sale),
      ])
    );

    const csvEscape = (value: string) => {
      const needsQuotes = /[",\n\r]/.test(value);
      const escaped = value.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    };

    const content = [headers, ...rows]
      .map((row) => row.map((cell) => csvEscape(String(cell ?? ""))).join(","))
      .join("\n");

    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `desktop-sales-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const buildReceiptText = (sale: DesktopSaleRecord) => {
    const total = sale.lines.reduce((sum, line) => sum + parseMoney(line.salePrice), 0);
    const lines = sale.lines
      .map((line, index) => {
        const salePrice = money(parseMoney(line.salePrice));
        return `${index + 1}. ${line.model} ${line.capacity} ${line.color} • ${line.imei || line.serialNumber || "-"} • ${salePrice}`;
      })
      .join("\n");

    return [
      `Receipt ${sale.saleId}`,
      `Date: ${new Date(sale.soldAt).toLocaleString()}`,
      `Customer: ${sale.customer || "N/A"}`,
      "",
      lines,
      "",
      `Payment: ${sale.paymentMethod || "N/A"}`,
      `Total: ${money(total)}`,
    ].join("\n");
  };

  const handlePrintReceipt = (sale: DesktopSaleRecord) => {
    const printWindow = window.open("", "_blank", "width=880,height=760");
    if (!printWindow) {
      setStatus("Could not open print preview window.");
      return;
    }

    const total = sale.lines.reduce((sum, line) => sum + parseMoney(line.salePrice), 0);
    const rowsHtml = sale.lines
      .map((line) => {
        const device = `${line.model} ${line.capacity} ${line.color}`.trim();
        const identifier = line.imei || line.serialNumber || "-";
        return `<tr><td>${identifier}</td><td>${device}</td><td>${money(parseMoney(line.salePrice))}</td></tr>`;
      })
      .join("");

    printWindow.document.write(`<!doctype html><html><head><title>Receipt ${sale.saleId}</title><style>body{font-family:Segoe UI,Arial,sans-serif;color:#111;padding:24px}h1{margin:0 0 8px;font-size:20px}p{margin:2px 0 0;font-size:12px;color:#334155}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left;font-size:12px}tfoot td{font-weight:700}@media print{body{padding:0}}</style></head><body><h1>${sale.saleId}</h1><p>${new Date(sale.soldAt).toLocaleString()}</p><p>Customer: ${sale.customer || "-"}</p><table><thead><tr><th>IMEI / SN</th><th>Device</th><th>Sale</th></tr></thead><tbody>${rowsHtml}</tbody><tfoot><tr><td colspan="2">Total</td><td>${money(total)}</td></tr></tfoot></table><script>window.onload=()=>window.print();</script></body></html>`);
    printWindow.document.close();
  };

  const handleSendViaEmail = async (sale: DesktopSaleRecord) => {
    if (!sale.customerEmail?.trim()) {
      setStatus("Customer email is missing for this sale.");
      return;
    }

    if (!window.desktop?.sales?.sendReceiptEmail) {
      setStatus("Desktop bridge is outdated. Restart the desktop app to use email receipts.");
      return;
    }

    try {
      setSendingEmailSaleId(sale.saleId);
      const response = await window.desktop.sales.sendReceiptEmail({ baseUrl, saleId: sale.saleId });
      if (response?.error) {
        setStatus(response.error);
        return;
      }
      setStatus(`Receipt email sent for ${sale.saleId}.`);
    } catch (sendError: unknown) {
      setStatus(sendError instanceof Error ? sendError.message : "Failed to send receipt email.");
    } finally {
      setSendingEmailSaleId("");
    }
  };

  const handleShareViaWhatsapp = async (sale: DesktopSaleRecord) => {
    if (!sale.customerWhatsapp?.trim()) {
      setStatus("Customer WhatsApp is missing for this sale.");
      return;
    }

    const digits = sale.customerWhatsapp.replace(/\D/g, "");
    if (!digits) {
      setStatus("Customer WhatsApp is invalid.");
      return;
    }

    const text = buildReceiptText(sale);
    const shareUrl = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
    try {
      if (window.desktop?.openExternal) {
        await window.desktop.openExternal(shareUrl);
      } else {
        window.open(shareUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      window.open(shareUrl, "_blank", "noopener,noreferrer");
    }
  };

  const openCancelEditor = () => {
    if (!selectedSale) return;
    const cancellable = selectedSale.lines.filter((line) => line.status !== "Cancelled").map((line) => line.id);
    setCancelMode("full");
    setSelectedCancelLineIds(new Set(cancellable));
    setCancelReason("");
    setShowCancelOptions(true);
  };

  const toggleCancelLine = (lineId: string) => {
    setSelectedCancelLineIds((current) => {
      const next = new Set(current);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const handleCancelSale = async () => {
    if (!selectedSale) return;
    if (!window.desktop?.sales?.cancel) {
      setStatus("Desktop bridge is outdated. Restart the desktop app to use cancellation.");
      return;
    }
    if (!cancelReason.trim()) {
      setStatus("Cancellation reason is required.");
      return;
    }

    if (cancelMode === "partial" && selectedCancelLineIds.size === 0) {
      setStatus("Select at least one item for partial cancellation.");
      return;
    }

    setCanceling(true);
    try {
      const response = await window.desktop.sales.cancel({
        baseUrl,
        data: {
          saleId: selectedSale.saleId,
          reason: cancelReason.trim(),
          fullSale: cancelMode === "full",
          items:
            cancelMode === "partial"
              ? Array.from(selectedCancelLineIds).map((saleItemId) => ({ saleItemId }))
              : [],
        },
      });

      setStatus(response.message ?? `Cancellation completed for ${selectedSale.saleId}.`);
      await loadSales();
      setShowCancelOptions(false);
    } catch (cancelError: unknown) {
      setStatus(cancelError instanceof Error ? cancelError.message : "Failed to cancel sale items.");
    } finally {
      setCanceling(false);
    }
  };

  const selectedTotals = useMemo(() => {
    if (!selectedSale) return { total: 0, cost: 0, margin: 0 };
    const total = selectedSale.lines.reduce((sum, line) => sum + parseMoney(line.salePrice), 0);
    const cost = selectedSale.lines.reduce((sum, line) => sum + parseMoney(line.costPesos), 0);
    return { total, cost, margin: total - cost };
  }, [selectedSale]);

  return (
    <div className="sales-history-shell">
      <section className="sales-history-toolbar">
        <div>
          <h2>Sales History</h2>
          <p>Review transactions, margins, and cancellation status from your organization.</p>
        </div>
        <div className="sales-history-toolbar__actions">
          <button type="button" onClick={() => void loadSales()} disabled={busy}>
            {busy ? "Refreshing..." : "Refresh"}
          </button>
          <button type="button" onClick={handleExportCsv} disabled={filteredSales.length === 0 || busy}>
            Export CSV
          </button>
        </div>
      </section>

      <section className="sales-history-filters">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search sale, customer, IMEI, serial"
        />
        <select value={customerTypeFilter} onChange={(event) => setCustomerTypeFilter(event.target.value)}>
          <option value="all">All customer types</option>
          <option value="retail">Retail</option>
          <option value="wholesale">Wholesale</option>
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="Finished">Finished</option>
          <option value="Cancelled">Cancelled</option>
          <option value="Partially Cancelled">Partially Cancelled</option>
          <option value="Pending">Pending</option>
        </select>
      </section>

      <section className="sales-history-kpis">
        <div><span>Transactions</span><strong>{summary.transactions}</strong></div>
        <div><span>Items</span><strong>{summary.items}</strong></div>
        <div><span>Total Cost</span><strong>{money(summary.totalCost)}</strong></div>
        <div><span>Total Sale</span><strong>{money(summary.totalSale)}</strong></div>
        <div><span>Margin</span><strong>{money(summary.margin)}</strong></div>
      </section>

      <section className="sales-history-content">
        <div className="sales-history-list">
          <table className="sales-history-table">
            <thead>
              <tr>
                <th>Sale</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((sale) => {
                const total = sale.lines.reduce((sum, line) => sum + parseMoney(line.salePrice), 0);
                const isActive = selectedSale?.saleId === sale.saleId;
                return (
                  <tr
                    key={sale.saleId}
                    className={isActive ? "active" : ""}
                    onClick={() => {
                      setSelectedSaleId(sale.saleId);
                      setShowCancelOptions(false);
                    }}
                  >
                    <td>{sale.saleId}</td>
                    <td>{new Date(sale.soldAt).toLocaleString()}</td>
                    <td>{sale.customer || "-"}</td>
                    <td>{sale.lines.length}</td>
                    <td>{money(total)}</td>
                    <td>{getStatus(sale)}</td>
                  </tr>
                );
              })}
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    {sales.length > 0
                      ? "No sales match current filters."
                      : "No sales logs available for this organization/account."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <aside className="sales-history-detail">
          {selectedSale ? (
            <>
              <div className="sales-history-detail__header">
                <h3>{selectedSale.saleId}</h3>
                <p>{new Date(selectedSale.soldAt).toLocaleString()}</p>
              </div>
              <div className="sales-history-detail__actions">
                <button type="button" onClick={() => handlePrintReceipt(selectedSale)}>Print</button>
                <button
                  type="button"
                  onClick={() => void handleSendViaEmail(selectedSale)}
                  disabled={sendingEmailSaleId === selectedSale.saleId}
                >
                  {sendingEmailSaleId === selectedSale.saleId ? "Sending..." : "Send Email"}
                </button>
                <button type="button" onClick={() => void handleShareViaWhatsapp(selectedSale)}>WhatsApp</button>
                <button
                  type="button"
                  className="sales-history-cancel-toggle"
                  onClick={() => {
                    if (showCancelOptions) {
                      setShowCancelOptions(false);
                      return;
                    }
                    openCancelEditor();
                  }}
                >
                  Cancel
                </button>
              </div>
              <div className="sales-history-detail__meta">
                <div>Customer: <strong>{selectedSale.customer || "-"}</strong></div>
                <div>Type: <strong>{selectedSale.customerType}</strong></div>
                <div>Payment: <strong>{selectedSale.paymentMethod || "-"}</strong></div>
                <div>Sold by: <strong>{selectedSale.soldBy || "-"}</strong></div>
                <div>Cost: <strong>{money(selectedTotals.cost)}</strong></div>
                <div>Total: <strong>{money(selectedTotals.total)}</strong></div>
                <div>Margin: <strong>{money(selectedTotals.margin)}</strong></div>
              </div>

              <div className="sales-history-lines-wrap">
                <table className="sales-history-lines">
                  <thead>
                    <tr>
                      <th>IMEI / SN</th>
                      <th>Device</th>
                      <th>Cost</th>
                      <th>Sold</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSale.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.imei || line.serialNumber || "-"}</td>
                        <td>{line.model} {line.capacity} {line.color}</td>
                        <td>{money(parseMoney(line.costPesos))}</td>
                        <td>{money(parseMoney(line.salePrice))}</td>
                        <td>{line.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {showCancelOptions ? (
                <div className="sales-history-cancel">
                  <h4>Cancel Sale Items</h4>
                  <div className="sales-history-cancel__mode">
                    <label>
                      <input
                        type="radio"
                        checked={cancelMode === "full"}
                        onChange={() => setCancelMode("full")}
                      />
                      <span>Full sale</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        checked={cancelMode === "partial"}
                        onChange={() => setCancelMode("partial")}
                      />
                      <span>Partial</span>
                    </label>
                  </div>

                  {cancelMode === "partial" ? (
                    <div className="sales-history-cancel__items">
                      {selectedSale.lines.map((line) => {
                        const isCancelled = line.status === "Cancelled";
                        return (
                          <label key={line.id} className={isCancelled ? "is-disabled" : ""}>
                            <input
                              type="checkbox"
                              checked={selectedCancelLineIds.has(line.id)}
                              disabled={isCancelled}
                              onChange={() => toggleCancelLine(line.id)}
                            />
                            <span>{line.imei || line.serialNumber || line.id}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}

                  <textarea
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    rows={2}
                    placeholder="Cancellation reason"
                  />
                  <button type="button" onClick={() => void handleCancelSale()} disabled={canceling || busy}>
                    {canceling ? "Cancelling..." : "Apply Cancellation"}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <p className="hint">Select a sale to inspect full line details.</p>
          )}
        </aside>
      </section>

      {error ? <p className="hint">{error}</p> : null}
      {status ? <p className="hint">{status}</p> : null}
    </div>
  );
}
