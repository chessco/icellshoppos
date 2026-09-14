import { useEffect, useMemo, useRef, useState } from "react";
import { ColorType, createChart, CrosshairMode } from "lightweight-charts";

type CustomerTypeFilter = "all" | "retail" | "wholesale";

type DashboardProps = {
  baseUrl: string;
  signedIn: boolean;
};

const formatCurrency = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;
const formatCount = (value: number) => Math.round(value).toLocaleString("en-US");

const getDefaultFromDate = () => {
  const now = new Date();
  const from = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  return from.toISOString().slice(0, 10);
};

const getDefaultToDate = () => new Date().toISOString().slice(0, 10);

export function DesktopDashboard({ baseUrl, signedIn }: DashboardProps) {
  const [fromDate, setFromDate] = useState(getDefaultFromDate);
  const [toDate, setToDate] = useState(getDefaultToDate);
  const [customerType, setCustomerType] = useState<CustomerTypeFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<DesktopDashboardPayload | null>(null);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!signedIn) {
      setPayload(null);
      setError("Sign in to load dashboard analytics.");
      return;
    }

    let cancelled = false;

    const loadDashboard = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await window.desktop.dashboard.overview({
          baseUrl,
          from: fromDate,
          to: toDate,
          customerType,
        });
        if (!cancelled) {
          setPayload(response);
        }
      } catch (loadError: unknown) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard analytics.");
          setPayload(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [baseUrl, customerType, fromDate, signedIn, toDate]);

  useEffect(() => {
    if (!payload || !chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0f1727" },
        textColor: "#b4c7e8",
      },
      grid: {
        vertLines: { color: "rgba(136, 163, 207, 0.18)" },
        horzLines: { color: "rgba(136, 163, 207, 0.18)" },
      },
      rightPriceScale: {
        borderColor: "rgba(136, 163, 207, 0.35)",
      },
      timeScale: {
        borderColor: "rgba(136, 163, 207, 0.35)",
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      localization: {
        priceFormatter: (value: number) => formatCurrency(value),
      },
    });

    const revenueSeries = chart.addAreaSeries({
      lineColor: "#62a9ff",
      topColor: "rgba(98, 169, 255, 0.42)",
      bottomColor: "rgba(98, 169, 255, 0.05)",
      lineWidth: 2,
    });

    const marginSeries = chart.addHistogramSeries({
      priceFormat: {
        type: "price",
        precision: 0,
        minMove: 1,
      },
      base: 0,
    });

    revenueSeries.setData(
      payload.salesByDate.map((point) => ({
        time: point.date,
        value: point.revenue,
      }))
    );

    marginSeries.setData(
      payload.marginByDate.map((point) => ({
        time: point.date,
        value: point.margin,
        color: point.margin >= 0 ? "rgba(43, 199, 155, 0.72)" : "rgba(234, 86, 120, 0.82)",
      }))
    );

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver(() => {
      if (!chartContainerRef.current) return;
      chart.applyOptions({
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
      });
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [payload]);

  const grossMarginPercent = useMemo(() => {
    if (!payload || payload.metrics.soldRevenue <= 0) return 0;
    return (payload.metrics.grossProfit / payload.metrics.soldRevenue) * 100;
  }, [payload]);

  const topCustomerRows = useMemo(() => {
    if (!payload) return [];
    return payload.salesByCustomer.slice(0, 6);
  }, [payload]);

  const hasData = Boolean(payload && payload.salesByDate.length > 0);

  return (
    <div className="dashboard-shell">
      <section className="dashboard-filter-row">
        <label>
          From
          <input type="date" value={fromDate} max={toDate} onChange={(event) => setFromDate(event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={toDate} min={fromDate} onChange={(event) => setToDate(event.target.value)} />
        </label>
        <label>
          Customer type
          <select
            value={customerType}
            onChange={(event) => setCustomerType(event.target.value as CustomerTypeFilter)}
          >
            <option value="all">All</option>
            <option value="retail">Retail</option>
            <option value="wholesale">Wholesale</option>
          </select>
        </label>
      </section>

      {error ? <p className="hint">{error}</p> : null}
      {loading ? <p className="hint">Loading dashboard data...</p> : null}

      {payload ? (
        <>
          <section className="dashboard-kpi-grid">
            <article className="dashboard-kpi-card">
              <p>Available Inventory Cost</p>
              <h3>{formatCurrency(payload.metrics.inventoryCost)}</h3>
              <span>{formatCount(payload.metrics.availableUnits)} units available</span>
            </article>
            <article className="dashboard-kpi-card">
              <p>Sold Revenue</p>
              <h3>{formatCurrency(payload.metrics.soldRevenue)}</h3>
              <span>{formatCount(payload.metrics.ordersCount)} orders closed</span>
            </article>
            <article className="dashboard-kpi-card">
              <p>Gross Profit</p>
              <h3>{formatCurrency(payload.metrics.grossProfit)}</h3>
              <span>{grossMarginPercent.toFixed(1)}% gross margin</span>
            </article>
            <article className="dashboard-kpi-card">
              <p>Average Ticket</p>
              <h3>{formatCurrency(payload.metrics.averageTicket)}</h3>
              <span>Sell-through {payload.metrics.sellThroughRate.toFixed(1)}%</span>
            </article>
          </section>

          <section className="dashboard-main-grid">
            <article className="dashboard-panel chart-panel">
              <div className="dashboard-panel__header">
                <h2>Revenue & Margin Trend</h2>
                <p>Finance chart with revenue area and positive/negative margin bars.</p>
              </div>
              <div className="dashboard-chart" ref={chartContainerRef} />
              {!hasData ? <p className="hint">No data in selected range.</p> : null}
            </article>

            <article className="dashboard-panel">
              <div className="dashboard-panel__header">
                <h2>Top Customers</h2>
                <p>Removed duplicated metrics and focused on profitability quality.</p>
              </div>
              <div className="dashboard-customer-table-wrap">
                <table className="dashboard-customer-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Revenue</th>
                      <th>Margin</th>
                      <th>Margin %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCustomerRows.map((row) => (
                      <tr key={`${row.customer}-${row.revenue}`}>
                        <td>{row.customer}</td>
                        <td>{formatCurrency(row.revenue)}</td>
                        <td>{formatCurrency(row.profit)}</td>
                        <td>{row.marginPercent.toFixed(1)}%</td>
                      </tr>
                    ))}
                    {topCustomerRows.length === 0 ? (
                      <tr>
                        <td colSpan={4}>No customer sales yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          <section className="dashboard-bottom-grid">
            <article className="dashboard-panel">
              <div className="dashboard-panel__header">
                <h2>Inventory Snapshot</h2>
              </div>
              <div className="dashboard-status-stack">
                {payload.inventoryByStatus.map((statusRow) => (
                  <div key={statusRow.status} className="dashboard-bar-row">
                    <span>{statusRow.status}</span>
                    <strong>{formatCount(statusRow.count)}</strong>
                  </div>
                ))}
              </div>
              <div className="dashboard-aging-grid">
                {payload.inventoryAging.map((agingRow) => (
                  <div key={agingRow.bucket} className="dashboard-aging-card">
                    <p>{agingRow.bucket}</p>
                    <h4>{formatCount(agingRow.count)}</h4>
                  </div>
                ))}
              </div>
            </article>

            <article className="dashboard-panel">
              <div className="dashboard-panel__header">
                <h2>Insights</h2>
                <p>Single source summaries without repeated cards.</p>
              </div>
              <div className="dashboard-insights">
                <div>
                  <p>Best sales day</p>
                  <h4>{payload.insights.bestSalesDay}</h4>
                  <span>{formatCurrency(payload.insights.bestSalesDayRevenue)}</span>
                </div>
                <div>
                  <p>Top customer</p>
                  <h4>{payload.insights.topCustomer}</h4>
                  <span>{formatCurrency(payload.insights.topCustomerRevenue)}</span>
                </div>
                <div>
                  <p>Top model</p>
                  <h4>{payload.insights.topModel}</h4>
                  <span>{formatCount(payload.insights.topModelUnits)} sold</span>
                </div>
              </div>
            </article>
          </section>
        </>
      ) : null}
    </div>
  );
}
