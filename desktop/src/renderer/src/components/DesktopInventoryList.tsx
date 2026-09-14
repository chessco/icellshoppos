import { useEffect, useMemo, useState } from "react";

type Props = {
  baseUrl: string;
  signedIn: boolean;
  onGoToAddDevice: () => void;
  onEditDevice: (row: DesktopInventoryListItem) => void;
};

type InventoryColumnKey =
  | "imei"
  | "serial"
  | "model"
  | "capacity"
  | "color"
  | "carrier"
  | "condition"
  | "grade"
  | "site"
  | "supplier"
  | "cost"
  | "price"
  | "price2"
  | "price3"
  | "status"
  | "createdAt";

type SortDirection = "asc" | "desc";

const COLUMN_STORAGE_KEY = "desktop-inventory-visible-columns";

const ALL_COLUMNS: Array<{ key: InventoryColumnKey; label: string; always?: boolean }> = [
  { key: "imei", label: "IMEI", always: true },
  { key: "serial", label: "SN" },
  { key: "model", label: "Model", always: true },
  { key: "capacity", label: "Capacity" },
  { key: "color", label: "Color" },
  { key: "carrier", label: "Carrier" },
  { key: "condition", label: "Condition" },
  { key: "grade", label: "Grade" },
  { key: "site", label: "Site" },
  { key: "supplier", label: "Supplier" },
  { key: "cost", label: "Cost" },
  { key: "price", label: "Price" },
  { key: "price2", label: "Price 2" },
  { key: "price3", label: "Price 3" },
  { key: "status", label: "Status", always: true },
  { key: "createdAt", label: "Created" },
];

const DEFAULT_VISIBLE_COLUMNS: InventoryColumnKey[] = [
  "imei",
  "serial",
  "model",
  "capacity",
  "color",
  "carrier",
  "cost",
  "price",
  "status",
  "createdAt",
];

const moneyFormat = (value: string | number | null | undefined) => {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(parsed)) return "-";
  return `$${Math.round(parsed).toLocaleString("en-US")}`;
};

const textValue = (value: unknown) => String(value ?? "").trim();

const getCellValue = (row: DesktopInventoryListItem, key: InventoryColumnKey) => {
  switch (key) {
    case "imei":
      return textValue(row.imei);
    case "serial":
      return textValue(row.serialNumber);
    case "model":
      return textValue(row.model);
    case "capacity":
      return textValue(row.capacity);
    case "color":
      return textValue(row.color);
    case "carrier":
      return textValue(row.carrier);
    case "condition":
      return textValue(row.condition);
    case "grade":
      return textValue(row.grade);
    case "site":
      return textValue(row.site?.name);
    case "supplier":
      return textValue(row.supplier?.name);
    case "cost":
      return moneyFormat(row.costPesos);
    case "price":
      return moneyFormat(row.price);
    case "price2":
      return moneyFormat(row.price2);
    case "price3":
      return moneyFormat(row.price3);
    case "status":
      return textValue(row.status);
    case "createdAt":
      return row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "-";
    default:
      return "";
  }
};

const getSortableValue = (row: DesktopInventoryListItem, key: InventoryColumnKey) => {
  if (key === "createdAt") return new Date(row.createdAt).getTime() || 0;
  if (key === "cost") return Number(row.costPesos ?? 0);
  if (key === "price") return Number(row.price ?? 0);
  if (key === "price2") return Number(row.price2 ?? 0);
  if (key === "price3") return Number(row.price3 ?? 0);
  return getCellValue(row, key).toLowerCase();
};

export function DesktopInventoryList({ baseUrl, signedIn, onGoToAddDevice, onEditDevice }: Props) {
  const [rows, setRows] = useState<DesktopInventoryListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [siteFilter, setSiteFilter] = useState("All");
  const [sortKey, setSortKey] = useState<InventoryColumnKey>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [density, setDensity] = useState<"compact" | "comfortable">("compact");
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<InventoryColumnKey>>(
    new Set(DEFAULT_VISIBLE_COLUMNS)
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMN_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as InventoryColumnKey[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      setVisibleColumns(new Set(parsed));
    } catch {
      // ignore invalid storage
    }
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setRows([]);
      setError("Sign in to load inventory.");
      return;
    }

    let cancelled = false;

    const load = async () => {
      setBusy(true);
      setError("");
      try {
        const payload = await window.desktop.inventory.list({
          baseUrl,
          status: statusFilter === "All" ? "" : statusFilter,
        });
        if (!cancelled) {
          setRows(payload.inventoryItems ?? []);
          setPage(1);
        }
      } catch (loadError: unknown) {
        if (!cancelled) {
          setRows([]);
          setError(loadError instanceof Error ? loadError.message : "Failed to load inventory.");
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [baseUrl, signedIn, statusFilter]);

  const sites = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const site = textValue(row.site?.name);
      if (site) set.add(site);
    }
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const status = textValue(row.status);
      if (status) set.add(status);
    }
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (siteFilter !== "All") {
        const site = textValue(row.site?.name);
        if (site !== siteFilter) return false;
      }

      if (q) {
        const haystack = [
          row.imei,
          row.serialNumber,
          row.model,
          row.capacity,
          row.color,
          row.carrier,
          row.condition,
          row.grade,
          row.status,
          row.site?.name,
          row.supplier?.name,
        ]
          .map((value) => textValue(value).toLowerCase())
          .join(" ");

        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [query, rows, siteFilter]);

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows].sort((a, b) => {
      const av = getSortableValue(a, sortKey);
      const bv = getSortableValue(b, sortKey);

      if (typeof av === "number" && typeof bv === "number") {
        return av - bv;
      }

      return String(av).localeCompare(String(bv));
    });

    if (sortDirection === "desc") sorted.reverse();
    return sorted;
  }, [filteredRows, sortDirection, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));

  const pagedRows = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [page, pageSize, sortedRows, totalPages]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const visibleColumnList = ALL_COLUMNS.filter((column) => visibleColumns.has(column.key));

  const toggleColumn = (key: InventoryColumnKey) => {
    const column = ALL_COLUMNS.find((entry) => entry.key === key);
    if (column?.always) return;

    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const updateSort = (key: InventoryColumnKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  return (
    <div className="inventory-shell">
      <div className="inventory-toolbar">
        <div className="inventory-toolbar__left">
          <input
            placeholder="Search IMEI, model, SN, carrier, supplier..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {statuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)}>
            {sites.map((site) => (
              <option key={site} value={site}>{site}</option>
            ))}
          </select>
          <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
          <select value={density} onChange={(event) => setDensity(event.target.value as "compact" | "comfortable")}>
            <option value="compact">Compact rows</option>
            <option value="comfortable">Comfortable rows</option>
          </select>
        </div>
        <div className="inventory-toolbar__right">
          <button type="button" onClick={() => setColumnMenuOpen((prev) => !prev)}>Columns</button>
          <button type="button" onClick={onGoToAddDevice}>Add Device (USB Intake)</button>
        </div>
      </div>

      {columnMenuOpen ? (
        <div className="inventory-columns-menu">
          {ALL_COLUMNS.map((column) => (
            <label key={column.key}>
              <input
                type="checkbox"
                checked={visibleColumns.has(column.key)}
                onChange={() => toggleColumn(column.key)}
                disabled={Boolean(column.always)}
              />
              <span>{column.label}</span>
            </label>
          ))}
        </div>
      ) : null}

      {error ? <p className="hint">{error}</p> : null}
      {busy ? <p className="hint">Loading inventory...</p> : null}

      <div className="inventory-table-wrap">
        <table className={`inventory-table ${density === "compact" ? "compact" : "comfortable"}`}>
          <thead>
            <tr>
              {visibleColumnList.map((column) => (
                <th key={column.key}>
                  <button type="button" onClick={() => updateSort(column.key)}>
                    {column.label}
                    {sortKey === column.key ? (sortDirection === "asc" ? " ▲" : " ▼") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row) => (
              <tr
                key={row.id}
                className="inventory-row-clickable"
                onClick={() => onEditDevice(row)}
                title="Open device edit page"
              >
                {visibleColumnList.map((column) => (
                  <td key={`${row.id}-${column.key}`}>{getCellValue(row, column.key) || "-"}</td>
                ))}
              </tr>
            ))}
            {!busy && pagedRows.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnList.length}>No inventory rows found for selected filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="inventory-pagination">
        <span>
          Showing {sortedRows.length === 0 ? 0 : (page - 1) * pageSize + 1} - {Math.min(page * pageSize, sortedRows.length)} of {sortedRows.length}
        </span>
        <div>
          <button type="button" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Prev</button>
          <span>{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>Next</button>
        </div>
      </div>
    </div>
  );
}
