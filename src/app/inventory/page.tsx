"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
// Simple modal component for bulk add
function BulkAddModal({ open, onClose, onParse }: { open: boolean; onClose: () => void; onParse: (rows: string) => void }) {
  const [text, setText] = useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-lg font-bold">×</button>
        <h2 className="text-xl font-semibold mb-2">Add Inventory in Bulk</h2>
        <p className="mb-2 text-sm text-[#6a4d3a]">Paste comma-separated rows below. Each line = 1 device. Example:<br/><span className="font-mono text-xs">352703949779022,iPhone 16 Pro Desert Titanium 256GB,.99,232,18.7.1,KG29RNGPP6,2025/12/23</span></p>
        <textarea
          className="w-full border rounded p-2 font-mono text-xs mb-4"
          rows={10}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste rows here..."
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="rounded px-4 py-2 border">Cancel</button>
          <button
            onClick={() => { onParse(text); setText(""); onClose(); }}
            className="rounded px-4 py-2 bg-[#1f1a16] text-white font-semibold"
            disabled={!text.trim()}
          >Parse & Preview</button>
        </div>
      </div>
    </div>
  );
}

import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { defaultCarrierOptions, fetchCarrierOptions, resolveCarrierOption } from "@/lib/carrier-options";
import LabelPreview from "@/components/LabelPreview";
import { formatCurrencyDisplay } from "@/lib/display-format";
import {
  appendInventoryRow,
  fetchInventoryRows,
  InventoryRow,
} from "@/lib/sheets";
import { fetchOrgLogoDataUrl } from "@/lib/org-logo";

type AgePreset = "all" | "0-7" | "8-30" | "31-60" | "61-90" | "90+";

const headers = [
  "IMEI",
  "Type",
  "Site",
  "Device",
  "Carrier",
  "Condition / Grade",
  "Supplier",
  "Currency",
  "Cost",
  "Price",
  "Price 2",
  "Price 3",
  "Days In Stock",
  "Status",
  "Created",
  "Print",
  "Actions",
];

const normalizeHeader = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

const normalizeImei = (value: string | null | undefined) => {
  const trimmed = (value ?? "").trim();
  const digitsOnly = trimmed.replace(/\D/g, "");
  return digitsOnly || trimmed.toLowerCase();
};

const parseAmount = (value: string) => {
  const numeric = Number(value.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
};

const formatMoneyWhole = (amount: number) => formatCurrencyDisplay(amount);

const parseCurrencyValue = (value: string) => {
  const normalized = String(value ?? "")
    .replace(/[^\d.-]/g, "")
    .trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const formatCurrencyCell = (value: string) => {
  const parsed = parseCurrencyValue(value);
  if (parsed === null) return "-";
  return formatMoneyWhole(parsed);
};

const parseDateSafe = (value: string) => {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const parseImportedDateSafe = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0 && numeric < 100000) {
      const excelEpochUtc = Date.UTC(1899, 11, 30);
      const parsedFromExcel = new Date(
        excelEpochUtc + Math.round(numeric * 24 * 60 * 60 * 1000)
      );
      return Number.isNaN(parsedFromExcel.getTime()) ? null : parsedFromExcel;
    }
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseModelColorCapacity = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { model: "", color: "", capacity: "" };
  }

  const match = trimmed.match(
    /^(.*?)(Black|White|Silver|Gold|Blue|Green|Red|Pink|Purple|Graphite|Midnight|Starlight|Natural Titanium|Desert Titanium|Deep Purple|Space Black|Yellow|Coral|Orange|Gray|Grey|Beige|Brown|Titanium)?\s*(\d+GB|\d+TB)?$/i
  );

  if (!match) {
    return { model: trimmed, color: "", capacity: "" };
  }

  return {
    model: (match[1] || "").trim(),
    color: (match[2] || "").trim(),
    capacity: (match[3] || "").trim(),
  };
};

const parseQrScanRow = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.includes(",")) return null;

  const parts = trimmed.split(",").map((part) => part.trim());
  if (parts.length < 7) return null;

  const device = parseModelColorCapacity(parts[1] || "");
  return {
    imei: parts[0] || "",
    model: device.model,
    color: device.color,
    capacity: device.capacity,
    batteryHealth: parts[2] || "",
    cycleCount: parts[3] || "",
    iosVersion: parts[4] || "",
    serialNumber: parts[5] || "",
    dateOfPurchase: parts[6] || "",
  };
};

const normalizeBatteryHealth = (value: string): { value: string; error: string | null } => {
  const trimmed = value.trim();
  if (!trimmed) return { value: "", error: null };

  const numericRaw = Number(trimmed.replace(/%/g, "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numericRaw) || numericRaw < 0) {
    return { value: trimmed, error: "Battery Health must be a valid number." };
  }

  let percentage = numericRaw;
  if (percentage < 1) {
    percentage *= 100;
  }

  if (percentage > 100) {
    return { value: trimmed, error: "Battery Health cannot be greater than 100%." };
  }

  const normalizedNumber = Number.isInteger(percentage)
    ? String(percentage)
    : String(Number(percentage.toFixed(2)));

  return { value: `${normalizedNumber}%`, error: null };
};

const getDaysInStock = (row: InventoryRow) => {
  const baseDate = parseDateSafe(row.createdAt) ?? parseDateSafe(row.dateOfPurchase);
  if (!baseDate) return null;

  const now = new Date();
  const diffMs = now.getTime() - baseDate.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
};

const getRowPrintKey = (row: InventoryRow) => {
  const imei = (row.imei ?? "").trim();
  if (imei) return imei;

  const serial = (row.serialNumber ?? "").trim();
  if (serial) return `SN:${serial}`;

  const id = (row.id ?? "").trim();
  if (id) return `ID:${id}`;

  return `ROW:${row.rowNumber ?? ""}:${row.createdAt ?? ""}:${row.model ?? ""}:${row.capacity ?? ""}:${row.color ?? ""}`;
};

const readColumnValue = (
  row: Record<string, unknown>,
  aliases: string[]
) => {
  const entries = Object.entries(row).map(([key, value]) => [
    normalizeHeader(key),
    value,
  ] as const);

  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const match = entries.find(([key]) => key === normalizedAlias);
    if (!match) continue;
    return String(match[1] ?? "").trim();
  }

  return "";
};

type TextFilter = Set<string>;
type RangeFilter = { min: string; max: string };

type ColumnFilters = {
  imei?: TextFilter;
  model?: TextFilter;
  capacity?: TextFilter;
  color?: TextFilter;
  carrier?: TextFilter;
  condition?: TextFilter;
  supplier?: TextFilter;
  status?: TextFilter;
  cost?: RangeFilter;
  costUsd?: RangeFilter;
  usdToPesosRate?: RangeFilter;
  price?: RangeFilter;
  price2?: RangeFilter;
  price3?: RangeFilter;
  daysInStock?: RangeFilter;
};

type SortDirection = "asc" | "desc";

type ImportPreviewRow = {
  rowNumber: number;
  data: {
    imei: string;
    site: string;
    model: string;
    capacity: string;
    color: string;
    carrier: string;
    condition: string;
    grade: string;
    comments: string;
    supplier: string;
    dateOfPurchase: string;
    cost: string;
    costCurrency: string;
    costPesos: string;
    price: string;
    price2: string;
    price3: string;
    status: string;
    batteryHealth: string;
    cycleCount: string;
    iosVersion: string;
    serialNumber: string;
    qrRaw: string;
  };
  errors: string[];
  warnings: string[];
};

type ImportPreviewState = {
  fileName: string;
  rows: ImportPreviewRow[];
  knownImeis: string[];
};

type PricingGuideRule = {
  model: string;
  capacity: string;
  price: string;
  price2: string;
  price3: string;
};

type RenderedLabelPayload = {
  dataUrl: string;
  width: number;
  height: number;
};

type SessionOrganization = {
  id: string;
  name: string;
  slug: string;
};

export default function InventoryPage() {
    // Validate preview rows for errors/warnings
    const validatePreviewRows = (
      previewRows: ImportPreviewRow[],
      knownImeis: Set<string>
    ): ImportPreviewRow[] => {
      const imeiCountsInFile = previewRows.reduce((accumulator, row) => {
        const normalized = normalizeImei(row.data.imei);
        if (!normalized) return accumulator;
        accumulator.set(normalized, (accumulator.get(normalized) ?? 0) + 1);
        return accumulator;
      }, new Map<string, number>());

      return previewRows.map((row) => {
        const errors: string[] = [];
        const warnings: string[] = [];
        const batteryHealthNormalized = normalizeBatteryHealth(row.data.batteryHealth);

        if (!(row.data.imei ?? "").trim()) warnings.push("No IMEI provided");
        if (!row.data.model.trim()) errors.push("Missing Model");
        if (!row.data.capacity.trim()) errors.push("Missing Capacity");
        if (!row.data.color.trim()) errors.push("Missing Color");
        if (!row.data.cost.trim()) errors.push("Missing Cost");
        if (!row.data.price.trim()) errors.push("Missing Price");

        const normalizedImei = normalizeImei(row.data.imei);
        if (normalizedImei && (imeiCountsInFile.get(normalizedImei) ?? 0) > 1) {
          errors.push("Duplicate IMEI in template");
        }
        if (normalizedImei && knownImeis.has(normalizedImei)) {
          warnings.push("IMEI already exists in inventory and will be updated");
        }

        const costAmount = parseCurrencyValue(row.data.cost);
        const priceAmount = parseCurrencyValue(row.data.price);
        if (costAmount !== null && priceAmount !== null && costAmount > priceAmount) {
          errors.push("Cost is higher than Price");
        }

        if (row.data.dateOfPurchase.trim()) {
          const parsedDate = parseImportedDateSafe(row.data.dateOfPurchase);
          if (!parsedDate) {
            warnings.push("Date of Purchase could not be parsed and will be saved as blank");
          } else if (parsedDate.getTime() > Date.now()) {
            errors.push("Date of Purchase is in the future");
          }
        }

        if (batteryHealthNormalized.error) {
          errors.push(batteryHealthNormalized.error);
        }

        return {
          ...row,
          data: {
            ...row.data,
            batteryHealth: batteryHealthNormalized.value,
          },
          errors,
          warnings,
        };
      });
    };
  const token: string | null = null;
  const pathname = usePathname();
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [agePreset, setAgePreset] = useState<AgePreset>("all");
  const [minAgeDays, setMinAgeDays] = useState("");
  const [maxAgeDays, setMaxAgeDays] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [siteFilter, setSiteFilter] = useState<string>("All");
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState<Record<string, string>>({});
  const [sortColumn, setSortColumn] = useState<string>("Created");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreviewState | null>(null);
  const [selectedForPrint, setSelectedForPrint] = useState<Set<string>>(new Set());
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined);
  const useUsdConversion = false;
  const [renderedLabelsForPrint, setRenderedLabelsForPrint] = useState<Map<string, RenderedLabelPayload>>(new Map());
  const [pendingPrintImeis, setPendingPrintImeis] = useState<string[] | null>(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [organizations, setOrganizations] = useState<SessionOrganization[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState("");
  const [exportFromDate, setExportFromDate] = useState("");
  const [exportToDate, setExportToDate] = useState("");
  const [exportAllOrganizations, setExportAllOrganizations] = useState(false);
  const [orgSearch, setOrgSearch] = useState("");
  const [switchingOrg, setSwitchingOrg] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);

  // Column visibility (persisted to localStorage)
  const HIDDEN_COLS_KEY = "inventory-hidden-columns";
  const NON_HIDEABLE = new Set(["Print", "Actions"]);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [colMenuOpen, setColMenuOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(HIDDEN_COLS_KEY);
      if (saved) setHiddenColumns(new Set(JSON.parse(saved)));
    } catch { /* ignore */ }
  }, []);

  const toggleColVisibility = (col: string) => {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      try { localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const spreadsheetId = process.env.NEXT_PUBLIC_SHEETS_ID ?? "";
  const inventoryTab = process.env.NEXT_PUBLIC_SHEETS_INVENTORY_TAB ?? "Inventory";
  const dataTab = process.env.NEXT_PUBLIC_SHEETS_DATA_TAB ?? "Data";

      // Helper to parse pasted bulk rows into ImportPreviewRow[]
  function parseBulkRowsToPreviewRows(input: string): ImportPreviewRow[] {
    const lines = input.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const rows: ImportPreviewRow[] = lines.map((line, idx) => {
      const parts = line.split(",").map(s => s.trim());
      const parsedDevice = parseModelColorCapacity(parts[1] || "");
      const model = parsedDevice.model;
      const color = parsedDevice.color;
      const capacity = parsedDevice.capacity;
      // Support multiple bulk paste layouts:
      // 1) IMEI, Device, Battery, Cycles, iOS, Serial, Purchase Date
      // 2) + Supplier, Cost, Price, Price 2, Price 3, Condition, Grade, Comments, Carrier
      // 3) + Supplier, Currency, Cost, Price, Price 2, Price 3, Condition, Grade, Comments, Carrier
      const supplier = parts[7] || "";
      const hasCurrencyColumn = /^[A-Za-z]{3}$/.test(parts[8] || "");
      const costCurrency = (hasCurrencyColumn ? parts[8] : "MXN") || "MXN";
      const cost = hasCurrencyColumn ? (parts[9] || "") : (parts[8] || "");
      const price = hasCurrencyColumn ? (parts[10] || "") : (parts[9] || "");
      const price2 = hasCurrencyColumn ? (parts[11] || "") : (parts[10] || "");
      const price3 = hasCurrencyColumn ? (parts[12] || "") : (parts[11] || "");
      const condition = hasCurrencyColumn ? (parts[13] || "") : (parts[12] || "");
      const grade = hasCurrencyColumn ? (parts[14] || "") : (parts[13] || "");
      const comments = hasCurrencyColumn ? (parts[15] || "") : (parts[14] || "");
      const carrier = hasCurrencyColumn ? (parts[16] || "Unlocked") : (parts[15] || "Unlocked");
      return {
        rowNumber: idx + 1,
        data: {
          imei: parts[0] || "",
          model,
          color,
          capacity,
          batteryHealth: parts[2] || "",
          cycleCount: parts[3] || "",
          iosVersion: parts[4] || "",
          serialNumber: parts[5] || "",
          dateOfPurchase: parts[6] || "",
          supplier,
          price: price || "",
          cost: cost || "",
          costCurrency,
          costPesos: cost || "",
          price2,
          price3,
          condition,
          grade,
          comments,
          carrier,
          site: "Main",
          status: "Available",
          qrRaw: "",
        },
        errors: [],
        warnings: [],
      };
    });
    return rows;
  }

  // Handler for parsing bulk pasted rows
  const handleBulkParse = async (text: string) => {
    setBusy(true);
    try {
      const mappedRows = parseBulkRowsToPreviewRows(text);
      const existingRows = await fetchInventoryRows({ token, spreadsheetId, sheetName: inventoryTab });
      const knownImeis = new Set<string>(existingRows.map((r) => normalizeImei(r.imei)));
      const previewRows = validatePreviewRows(mappedRows, knownImeis);
      setImportPreview({ fileName: "Bulk Paste", rows: previewRows, knownImeis: Array.from(knownImeis) });
      setStatus(`Preview ready for ${previewRows.length} row(s): ${previewRows.filter(r => r.errors.length === 0).length} valid, ${previewRows.filter(r => r.errors.length > 0).length} invalid.`);
    } catch (error: unknown) {
      setStatus(error instanceof Error ? `Bulk parse failed: ${error.message}` : "Bulk parse failed.");
    } finally {
      setBusy(false);
    }
  };

  // Extract unique values for text filters
  const uniqueValues = useMemo(() => {
    return {
      imei: Array.from(new Set(rows.map((r) => r.imei).filter(Boolean))).sort(),
      site: Array.from(new Set(rows.map((r) => r.site).filter(Boolean))).sort(),
      model: Array.from(new Set(rows.map((r) => r.model).filter(Boolean))).sort(),
      capacity: Array.from(new Set(rows.map((r) => r.capacity).filter(Boolean))).sort(),
      color: Array.from(new Set(rows.map((r) => r.color).filter(Boolean))).sort(),
      carrier: Array.from(new Set(rows.map((r) => r.carrier).filter(Boolean))).sort(),
      condition: Array.from(new Set(rows.map((r) => r.condition).filter(Boolean))).sort(),
      supplier: Array.from(new Set(rows.map((r) => r.supplier).filter(Boolean))).sort(),
      status: Array.from(new Set(rows.map((r) => r.status).filter(Boolean))).sort(),
    };
  }, [rows]);

  const ageFilteredRows = useMemo(() => {
    let presetMin = 0;
    let presetMax = Number.POSITIVE_INFINITY;

    if (agePreset === "0-7") {
      presetMin = 0;
      presetMax = 7;
    } else if (agePreset === "8-30") {
      presetMin = 8;
      presetMax = 30;
    } else if (agePreset === "31-60") {
      presetMin = 31;
      presetMax = 60;
    } else if (agePreset === "61-90") {
      presetMin = 61;
      presetMax = 90;
    } else if (agePreset === "90+") {
      presetMin = 90;
      presetMax = Number.POSITIVE_INFINITY;
    }

    const customMin = Number(minAgeDays);
    const customMax = Number(maxAgeDays);
    const hasCustomMin = minAgeDays.trim() !== "" && Number.isFinite(customMin);
    const hasCustomMax = maxAgeDays.trim() !== "" && Number.isFinite(customMax);

    const finalMin = hasCustomMin ? customMin : presetMin;
    const finalMax = hasCustomMax ? customMax : presetMax;

    return rows.filter((row) => {
      const days = getDaysInStock(row);
      if (days === null) return agePreset === "all" && !hasCustomMin && !hasCustomMax;
      return days >= finalMin && days <= finalMax;
    });
  }, [rows, agePreset, minAgeDays, maxAgeDays]);

  const filteredRows = useMemo(() => {
    return ageFilteredRows.filter((row) => {
      // Status filter (top-level dropdown)
      if (statusFilter && statusFilter !== "All") {
        if (row.status.toLowerCase() !== statusFilter.toLowerCase()) {
          return false;
        }
      } else if (row.status.toLowerCase() === "deleted") {
        return false;
      }

      if (siteFilter && siteFilter !== "All") {
        if ((row.site || "Main").toLowerCase() !== siteFilter.toLowerCase()) {
          return false;
        }
      }

      // Text column filters (checkbox sets)
      if (columnFilters.imei && columnFilters.imei.size > 0) {
        if (!columnFilters.imei.has(row.imei)) return false;
      }
      if (columnFilters.model && columnFilters.model.size > 0) {
        if (!columnFilters.model.has(row.model)) return false;
      }
      if (columnFilters.capacity && columnFilters.capacity.size > 0) {
        if (!columnFilters.capacity.has(row.capacity)) return false;
      }
      if (columnFilters.color && columnFilters.color.size > 0) {
        if (!columnFilters.color.has(row.color)) return false;
      }
      if (columnFilters.carrier && columnFilters.carrier.size > 0) {
        if (!columnFilters.carrier.has(row.carrier)) return false;
      }
      if (columnFilters.condition && columnFilters.condition.size > 0) {
        if (!columnFilters.condition.has(row.condition)) return false;
      }
      if (columnFilters.supplier && columnFilters.supplier.size > 0) {
        if (!columnFilters.supplier.has(row.supplier)) return false;
      }
      if (columnFilters.status && columnFilters.status.size > 0) {
        if (!columnFilters.status.has(row.status)) return false;
      }

      // Range filters for numeric columns
      if (columnFilters.cost) {
        const value = parseAmount(row.cost);
        const min = columnFilters.cost.min ? parseAmount(columnFilters.cost.min) : null;
        const max = columnFilters.cost.max ? parseAmount(columnFilters.cost.max) : null;
        if (value !== null) {
          if (min !== null && value < min) return false;
          if (max !== null && value > max) return false;
        }
      }
      if (columnFilters.price) {
        const value = parseAmount(row.price);
        const min = columnFilters.price.min ? parseAmount(columnFilters.price.min) : null;
        const max = columnFilters.price.max ? parseAmount(columnFilters.price.max) : null;
        if (value !== null) {
          if (min !== null && value < min) return false;
          if (max !== null && value > max) return false;
        }
      }
      if (columnFilters.price2) {
        const value = parseAmount(row.price2);
        const min = columnFilters.price2.min ? parseAmount(columnFilters.price2.min) : null;
        const max = columnFilters.price2.max ? parseAmount(columnFilters.price2.max) : null;
        if (value !== null) {
          if (min !== null && value < min) return false;
          if (max !== null && value > max) return false;
        }
      }
      if (columnFilters.price3) {
        const value = parseAmount(row.price3);
        const min = columnFilters.price3.min ? parseAmount(columnFilters.price3.min) : null;
        const max = columnFilters.price3.max ? parseAmount(columnFilters.price3.max) : null;
        if (value !== null) {
          if (min !== null && value < min) return false;
          if (max !== null && value > max) return false;
        }
      }
      if (columnFilters.daysInStock) {
        const value = getDaysInStock(row);
        const min = columnFilters.daysInStock.min ? Number(columnFilters.daysInStock.min) : null;
        const max = columnFilters.daysInStock.max ? Number(columnFilters.daysInStock.max) : null;
        if (value !== null) {
          if (min !== null && Number.isFinite(min) && value < min) return false;
          if (max !== null && Number.isFinite(max) && value > max) return false;
        }
      }

      return true;
    });
  }, [ageFilteredRows, statusFilter, siteFilter, columnFilters]);

  const sortedRows = useMemo(
    () => {
      const getSortValue = (row: InventoryRow, header: string): string | number => {
        switch (header) {
          case "IMEI":
            return row.imei || "";
          case "Site":
            return row.site || "";
          case "Device":
            return `${row.model || ""} ${row.color || ""} ${row.capacity || ""}`.trim();
          case "Carrier":
            return row.carrier || "";
          case "Condition / Grade":
            return `${row.condition || ""} ${row.grade || ""}`.trim();
          case "Supplier":
            return row.supplier || "";
          case "Currency":
            return row.costCurrency || "";
          case "Cost":
            return parseCurrencyValue(row.costPesos || row.cost || "") ?? Number.NEGATIVE_INFINITY;
          case "Price":
            return parseCurrencyValue(row.price || "") ?? Number.NEGATIVE_INFINITY;
          case "Price 2":
            return parseCurrencyValue(row.price2 || "") ?? Number.NEGATIVE_INFINITY;
          case "Price 3":
            return parseCurrencyValue(row.price3 || "") ?? Number.NEGATIVE_INFINITY;
          case "Days In Stock":
            return getDaysInStock(row) ?? Number.NEGATIVE_INFINITY;
          case "Status":
            return row.status || "";
          case "Created": {
            const parsedDate = parseDateSafe(row.createdAt || "");
            return parsedDate ? parsedDate.getTime() : row.createdAt || "";
          }
          default:
            return row.rowNumber ?? 0;
        }
      };

      const isSortableColumn = !["Print", "Actions"].includes(sortColumn);
      if (!isSortableColumn) {
        return [...filteredRows].sort((a, b) => (b.rowNumber ?? 0) - (a.rowNumber ?? 0));
      }

      return [...filteredRows].sort((a, b) => {
        const aValue = getSortValue(a, sortColumn);
        const bValue = getSortValue(b, sortColumn);

        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
        }

        const comparison = String(aValue).localeCompare(String(bValue), undefined, {
          numeric: true,
          sensitivity: "base",
        });
        return sortDirection === "asc" ? comparison : -comparison;
      });
    },
    [filteredRows, sortColumn, sortDirection]
  );

  const toggleSort = (header: string) => {
    if (header === "Print" || header === "Actions") return;
    if (sortColumn === header) {
      setSortDirection((previous) => (previous === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(header);
    setSortDirection("asc");
  };

  const getFilterSearchValue = (key: string) => filterSearch[key] ?? "";

  const setFilterSearchValue = (key: string, value: string) => {
    setFilterSearch((previous) => ({ ...previous, [key]: value }));
  };

  const filterValuesBySearch = (key: string, values: string[]) => {
    const query = getFilterSearchValue(key).trim().toLowerCase();
    if (!query) return values;
    return values.filter((value) => value.toLowerCase().includes(query));
  };

  const loadInventory = async () => {
    setBusy(true);
    try {
      const nextRows = await fetchInventoryRows({
        token,
        spreadsheetId,
        sheetName: inventoryTab,
      });
      setRows(nextRows);
      setStatus(`Loaded ${nextRows.length} inventory items.`);
    } catch (error: unknown) {
      setStatus(
        error instanceof Error
          ? `Failed to load inventory: ${error.message}`
          : "Failed to load inventory."
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) return;

        const session = payload?.session as { isSuperadmin?: boolean; activeOrganizationId?: string } | undefined;
        const orgList = Array.isArray(payload?.organizations) ? payload.organizations : [];

        if (!cancelled) {
          setIsSuperadmin(Boolean(session?.isSuperadmin));
          setOrganizations(orgList);
          setActiveOrganizationId(String(session?.activeOrganizationId ?? ""));
        }
      } catch {
        if (!cancelled) {
          setIsSuperadmin(false);
        }
      }
    };

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredOrganizations = useMemo(() => {
    const query = orgSearch.trim().toLowerCase();
    if (!query) return organizations;
    return organizations.filter((organization) =>
      `${organization.name} ${organization.slug}`.toLowerCase().includes(query)
    );
  }, [orgSearch, organizations]);

  const handleSwitchOrganization = async () => {
    if (!activeOrganizationId) return;

    try {
      setSwitchingOrg(true);
      const response = await fetch("/api/auth/switch-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: activeOrganizationId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setStatus(payload?.error ?? "Failed to switch organization.");
        return;
      }

      await loadInventory();
      setStatus("Organization switched.");
    } catch {
      setStatus("Failed to switch organization.");
    } finally {
      setSwitchingOrg(false);
    }
  };

  const buildInventoryExportUrl = (format: "xlsx" | "csv") => {
    const params = new URLSearchParams();
    params.set("format", format);
    if (exportFromDate) params.set("from", exportFromDate);
    if (exportToDate) params.set("to", exportToDate);
    if (isSuperadmin && exportAllOrganizations) params.set("allOrganizations", "1");
    return `/api/inventory/export?${params.toString()}`;
  };

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("th")) {
        setOpenFilter(null);
      }
      if (colMenuOpen && !target.closest("[data-col-menu]")) {
        setColMenuOpen(false);
      }
    };

    if (openFilter || colMenuOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [openFilter, colMenuOpen]);

  useEffect(() => {
    fetchOrgLogoDataUrl()
      .then((url: string | undefined) => setLogoDataUrl(url))
      .catch(() => setLogoDataUrl(undefined));
  }, []);

  useEffect(() => {
    setRenderedLabelsForPrint((previous) => {
      const next = new Map<string, RenderedLabelPayload>();
      for (const itemKey of selectedForPrint) {
        const value = previous.get(itemKey);
        if (value) {
          next.set(itemKey, value);
        }
      }
      return next;
    });
  }, [selectedForPrint]);

  useEffect(() => {
    if (!pendingPrintImeis || pendingPrintImeis.length === 0) {
      return;
    }

    const readyPayloads = pendingPrintImeis
      .map((itemKey) => renderedLabelsForPrint.get(itemKey))
      .filter((payload): payload is RenderedLabelPayload => Boolean(payload?.dataUrl));

    if (readyPayloads.length !== pendingPrintImeis.length) {
      return;
    }

    const firstLabel = readyPayloads[0];
    const pageWidthIn = firstLabel.width / 96;
    const pageHeightIn = firstLabel.height / 96;

    const pagesHtml = pendingPrintImeis
      .map((itemKey) => {
        const payload = renderedLabelsForPrint.get(itemKey);
        if (!payload) return "";
        return `<section class="label-page"><img src="${payload.dataUrl}" alt="Label" /></section>`;
      })
      .join("");

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setStatus("Popup blocked while trying to print labels.");
      setPendingPrintImeis(null);
      return;
    }

    printWindow.document.write(
      `<!DOCTYPE html><html><head><title>Print Labels</title><style>` +
        `*{box-sizing:border-box;margin:0;padding:0;}` +
        `@page{size:${pageWidthIn}in ${pageHeightIn}in;margin:0;}` +
        `html,body{background:#fff;}` +
        `.label-page{width:${pageWidthIn}in;height:${pageHeightIn}in;page-break-after:always;break-after:page;}` +
        `.label-page:last-child{page-break-after:auto;break-after:auto;}` +
        `.label-page img{display:block;width:${pageWidthIn}in;height:${pageHeightIn}in;}` +
      `</style></head><body>${pagesHtml}</body></html>`
    );
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
    setStatus(`Printing ${pendingPrintImeis.length} label${pendingPrintImeis.length === 1 ? "" : "s"}.`);
    setPendingPrintImeis(null);
  }, [pendingPrintImeis, renderedLabelsForPrint]);

  const getLabelPropsFromRow = (row: InventoryRow) => ({
    model: row.model || "-",
    color: row.color || "-",
    capacity: row.capacity || "-",
    batteryHealth: row.batteryHealth || "-",
    cycleCount: row.cycleCount || "-",
    iosVersion: row.iosVersion || "-",
    carrier: row.carrier || "-",
    condition: row.condition || "-",
    grade: row.grade || "-",
    comments: row.comments || "",
    imei: row.imei,
    sku: row.sku || "",
    qrRaw: row.qrRaw || "",
    serialNumber: row.serialNumber || "",
    dateOfPurchase: row.dateOfPurchase || "",
    createdAt: row.createdAt || "",
    price: row.price || "",
    price2: row.price2 || "",
    price3: row.price3 || "",
    logoDataUrl,
  });

  const queuePrintForImeis = (itemKeys: string[]) => {
    if (itemKeys.length === 0) {
      setStatus("Select at least one device to print.");
      return;
    }
    setPendingPrintImeis(itemKeys);
    setStatus(`Preparing ${itemKeys.length} label${itemKeys.length === 1 ? "" : "s"}...`);
  };

  const handleImportFile = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;

    setBusy(true);
    try {
      const carrierOptions = await fetchCarrierOptions().catch(() => [...defaultCarrierOptions]);
      
      // Fetch device types for mapping
      const deviceTypesResponse = await fetch("/api/device-types", { cache: "no-store" }).catch(() => null);
      const deviceTypesPayload = deviceTypesResponse?.ok ? await deviceTypesResponse.json().catch(() => ({})) : {};
      const deviceTypeOptions = (Array.isArray(deviceTypesPayload?.deviceTypes) ? deviceTypesPayload.deviceTypes : []) as Array<{ id: string; name: string }>;
      const deviceTypeMap = new Map(deviceTypeOptions.map((dt) => [normalizeHeader(dt.name), dt]));
      
      const xlsx = await import("xlsx");
      const fileBuffer = await file.arrayBuffer();
      const workbook = xlsx.read(fileBuffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = xlsx.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
        defval: "",
      });

      if (rawRows.length === 0) {
        setStatus("Import failed: file has no rows.");
        return;
      }

      const mappedRows = rawRows.map((row, index) => {
        const qrScanRaw = readColumnValue(row, ["QR Scan"]);
        const parsedQrScan = parseQrScanRow(qrScanRaw);
        const imei = readColumnValue(row, ["IMEI"]) || parsedQrScan?.imei || "";
        const deviceTypeName = readColumnValue(row, ["Device Type", "DeviceType", "Type"]);
        const deviceTypeOption = deviceTypeName ? deviceTypeMap.get(normalizeHeader(deviceTypeName)) : undefined;
        const model = readColumnValue(row, ["Model"]) || parsedQrScan?.model || "";
        const capacity = readColumnValue(row, ["Capacity"]) || parsedQrScan?.capacity || "";
        const color = readColumnValue(row, ["Color"]) || parsedQrScan?.color || "";
        const supplier = readColumnValue(row, ["Supplier"]);
        const costRaw = readColumnValue(row, ["Cost", "Cost Pesos", "Cost MXN", "Cost USD"]);
        const costCurrencyRaw = readColumnValue(row, ["Currency"]);
        const priceRaw = readColumnValue(row, ["Price"]);
        const price2 = readColumnValue(row, ["Price 2", "Price2"]);
        const price3 = readColumnValue(row, ["Price 3", "Price3"]);
        const statusValue =
          readColumnValue(row, ["Status"]) || "Available";

        const resolvedCostAmount = parseAmount(costRaw);

        const resolvedPriceAmount = parseAmount(priceRaw);
        const resolvedPrice2Amount = parseAmount(price2);
        const resolvedPrice3Amount = parseAmount(price3);

        const dateOfPurchaseRaw =
          readColumnValue(row, ["Date of Purchase", "Purchase Date"]) ||
          parsedQrScan?.dateOfPurchase ||
          "";
        const parsedDateOfPurchase = parseImportedDateSafe(dateOfPurchaseRaw);

        return {
          rowNumber: index + 2,
          data: {
            imei,
            deviceType: deviceTypeName,
            deviceTypeId: deviceTypeOption?.id || "",
            site: readColumnValue(row, ["Site", "Location"]) || "Main",
            model,
            capacity,
            color,
            carrier: resolveCarrierOption(readColumnValue(row, ["Carrier"]), carrierOptions),
            condition: readColumnValue(row, ["Condition"]) || "",
            grade: readColumnValue(row, ["Grade"]) || "",
            comments: readColumnValue(row, ["Comments"]),
            supplier,
            dateOfPurchase: parsedDateOfPurchase ? parsedDateOfPurchase.toISOString() : "",
            cost: resolvedCostAmount ? String(Math.round(resolvedCostAmount)) : "",
            costCurrency: (costCurrencyRaw || "MXN").toUpperCase(),
            costPesos: resolvedCostAmount ? String(Math.round(resolvedCostAmount)) : "",
            price: resolvedPriceAmount ? String(Math.round(resolvedPriceAmount)) : "",
            price2: resolvedPrice2Amount ? String(Math.round(resolvedPrice2Amount)) : "",
            price3: resolvedPrice3Amount ? String(Math.round(resolvedPrice3Amount)) : "",
            status: statusValue,
            batteryHealth:
              readColumnValue(row, ["Battery Health"]) ||
              parsedQrScan?.batteryHealth ||
              "",
            cycleCount:
              readColumnValue(row, ["Cycle Count", "Cycles"]) ||
              parsedQrScan?.cycleCount ||
              "",
            iosVersion:
              readColumnValue(row, ["iOS Version", "iOS"]) ||
              parsedQrScan?.iosVersion ||
              "",
            serialNumber:
              readColumnValue(row, ["Serial Number", "Serial"]) ||
              parsedQrScan?.serialNumber ||
              "",
            qrRaw: readColumnValue(row, ["QR Raw", "QR"]) || qrScanRaw,
          },
        };
      });

      const existingRows = await fetchInventoryRows({
        token,
        spreadsheetId,
        sheetName: inventoryTab,
      });

      const pricingRulesResponse = await fetch("/api/pricing-rules", { cache: "no-store" });
      const pricingRulesPayload = await pricingRulesResponse
        .json()
        .catch(() => ({ rules: [] as Array<{ model: string; capacity: string; price: string; price2: string; price3: string }> }));

      const pricingRuleMap = new Map<string, { price: string; price2: string; price3: string }>();
      const pricingRules = Array.isArray(pricingRulesPayload?.rules)
        ? (pricingRulesPayload.rules as Array<{ model: string; capacity: string; price: string; price2: string; price3: string }>)
        : [];

      if (pricingRulesResponse.ok) {
        pricingRules.forEach((rule) => {
          const key = `${normalizeHeader(String(rule.model ?? ""))}||${normalizeHeader(String(rule.capacity ?? ""))}`;
          pricingRuleMap.set(key, {
            price: String(rule.price ?? ""),
            price2: String(rule.price2 ?? ""),
            price3: String(rule.price3 ?? ""),
          });
        });
      }

      const withPricingGuideRows = mappedRows.map((row) => {
        const key = `${normalizeHeader(row.data.model)}||${normalizeHeader(row.data.capacity)}`;
        const pricingRule = pricingRuleMap.get(key);
        if (!pricingRule) return row;

        const nextData = { ...row.data };

        if (parseCurrencyValue(nextData.price) === null && parseCurrencyValue(pricingRule.price) !== null) {
          nextData.price = String(Math.round(Number(pricingRule.price)));
        }
        if (parseCurrencyValue(nextData.price2) === null && parseCurrencyValue(pricingRule.price2) !== null) {
          nextData.price2 = String(Math.round(Number(pricingRule.price2)));
        }
        if (parseCurrencyValue(nextData.price3) === null && parseCurrencyValue(pricingRule.price3) !== null) {
          nextData.price3 = String(Math.round(Number(pricingRule.price3)));
        }

        return {
          ...row,
          data: nextData,
        };
      });

      const knownImeis = new Set<string>(
        existingRows.map((existingRow: InventoryRow) => normalizeImei(existingRow.imei))
      );

      const previewRows = validatePreviewRows(
        withPricingGuideRows.map((row) => ({
          rowNumber: row.rowNumber,
          data: row.data,
          errors: [],
          warnings: [],
        })),
        knownImeis
      );

      const validRows = previewRows.filter((row) => row.errors.length === 0).length;
      const invalidRows = previewRows.length - validRows;
      setImportPreview({ fileName: file.name, rows: previewRows, knownImeis: Array.from(knownImeis) });
      setStatus(
        `Preview ready for ${previewRows.length} row(s): ${validRows} valid, ${invalidRows} invalid.`
      );
    } catch (error: unknown) {
      setStatus(
        error instanceof Error
          ? `Import failed: ${error.message}`
          : "Import failed."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;

    const rowsToInsert = importPreview.rows.filter((row) => row.errors.length === 0);
    if (rowsToInsert.length === 0) {
      setStatus("No valid rows to import.");
      return;
    }

    setBusy(true);
    try {
      let inserted = 0;
      let updated = 0;
      let failedRows = 0;
      const failureMessages: string[] = [];

      for (const row of rowsToInsert) {
        try {
          const result = await appendInventoryRow({
            token,
            spreadsheetId,
            sheetName: inventoryTab,
            data: row.data,
          });
          if (result.isUpdate) {
            updated += 1;
          } else {
            inserted += 1;
          }
        } catch (error: unknown) {
          failedRows += 1;
          const errorMessage =
            error instanceof Error ? error.message : "Failed to save inventory item";
          failureMessages.push(`Row ${row.rowNumber} (IMEI ${row.data.imei}): ${errorMessage}`);
        }
      }

      await loadInventory();
      const skippedInvalid = importPreview.rows.length - rowsToInsert.length;
      const baseMessage = `Import completed. Inserted ${inserted} row(s), updated ${updated} row(s), skipped ${skippedInvalid} invalid row(s), failed ${failedRows} row(s).`;
      if (failureMessages.length > 0) {
        setStatus(`${baseMessage} ${failureMessages.slice(0, 3).join(" | ")}`);
      } else {
        setStatus(baseMessage);
      }

      setImportPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error: unknown) {
      setStatus(
        error instanceof Error
          ? `Import failed: ${error.message}`
          : "Import failed."
      );
    } finally {
      setBusy(false);
    }
  };

  const handlePreviewFieldChange = (
    rowNumber: number,
    field: keyof ImportPreviewRow["data"],
    value: string
  ) => {
    setImportPreview((previous) => {
      if (!previous) return previous;

      const nextRows = previous.rows.map((row) => {
        if (row.rowNumber !== rowNumber) return row;
        if (field === "costPesos") {
          return {
            ...row,
            data: {
              ...row.data,
              costPesos: value,
              cost: value,
            },
          };
        }
        return {
          ...row,
          data: {
            ...row.data,
            [field]: value,
          },
        };
      });

      const validatedRows = validatePreviewRows(nextRows, new Set(previous.knownImeis));
      return {
        ...previous,
        rows: validatedRows,
      };
    });
  };

  const handleApplyPricingGuide = async () => {
    if (!importPreview) return;

    setBusy(true);
    try {
      const response = await fetch("/api/pricing-rules", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setStatus(
          typeof payload?.error === "string"
            ? payload.error
            : "Failed to load pricing guide."
        );
        return;
      }

      const rules = Array.isArray(payload?.rules)
        ? (payload.rules as PricingGuideRule[])
        : [];

      if (rules.length === 0) {
        setStatus("No pricing guide rows found.");
        return;
      }

      const ruleByModelCapacity = new Map<string, PricingGuideRule>();
      rules.forEach((rule) => {
        const key = `${normalizeHeader(rule.model)}||${normalizeHeader(rule.capacity)}`;
        ruleByModelCapacity.set(key, rule);
      });

      const isBlankMoney = (value: string) => parseCurrencyValue(value) === null;

      let updatedRowsCount = 0;

      setImportPreview((previous) => {
        if (!previous) return previous;

        const nextRows = previous.rows.map((row) => {
          const key = `${normalizeHeader(row.data.model)}||${normalizeHeader(row.data.capacity)}`;
          const matchedRule = ruleByModelCapacity.get(key);
          if (!matchedRule) return row;

          const nextData = { ...row.data };
          let rowChanged = false;

          if (isBlankMoney(nextData.price) && parseCurrencyValue(matchedRule.price) !== null) {
            nextData.price = String(Math.round(Number(matchedRule.price)));
            rowChanged = true;
          }

          if (isBlankMoney(nextData.price2) && parseCurrencyValue(matchedRule.price2) !== null) {
            nextData.price2 = String(Math.round(Number(matchedRule.price2)));
            rowChanged = true;
          }

          if (isBlankMoney(nextData.price3) && parseCurrencyValue(matchedRule.price3) !== null) {
            nextData.price3 = String(Math.round(Number(matchedRule.price3)));
            rowChanged = true;
          }

          if (!rowChanged) return row;
          updatedRowsCount += 1;

          return {
            ...row,
            data: nextData,
          };
        });

        const validatedRows = validatePreviewRows(nextRows, new Set(previous.knownImeis));
        return {
          ...previous,
          rows: validatedRows,
        };
      });

      if (updatedRowsCount === 0) {
        setStatus("Pricing guide found no blank prices to fill.");
      } else {
        setStatus(`Applied pricing guide to ${updatedRowsCount} row(s).`);
      }
    } catch {
      setStatus("Failed to apply pricing guide.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDevice = async (row: InventoryRow) => {
    const identifier = row.imei || row.serialNumber || row.id || "(unknown item)";
    const confirmed = window.confirm(
      `Are you sure you want to delete ${identifier}?`
    );
    if (!confirmed) return;

    const reasonInput = window.prompt(
      "Reason for deleting this device (required):"
    );
    if (reasonInput === null) return;

    const reason = reasonInput.trim();
    if (!reason) {
      setStatus("Delete cancelled: reason is required.");
      return;
    }

    if (!row.id && !row.imei) {
      setStatus("Delete failed: missing internal identifier.");
      return;
    }

    setBusy(true);
    try {
      const deleteResponse = await fetch("/api/inventory", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inventoryItemId: row.id || "", imei: row.imei || "", reason }),
      });

      if (!deleteResponse.ok) {
        const payload = await deleteResponse
          .json()
          .catch(() => ({ error: "Failed to delete inventory item." }));
        throw new Error(payload.error || "Failed to delete inventory item.");
      }

      await loadInventory();
      setStatus("Device status changed to Deleted and reason appended to comments.");
    } catch (error: unknown) {
      setStatus(
        error instanceof Error
          ? `Failed to delete device: ${error.message}`
          : "Failed to delete device."
      );
    } finally {
      setBusy(false);
    }
  };

  // --- Column filter & body cell helpers ---
  const renderTextFilterTh = (key: string, label: string, values: string[]) => {
    const filterKey = key as keyof ColumnFilters;
    const filterValue = columnFilters[filterKey] as TextFilter | undefined;
    return (
      <th key={key} className="px-3 py-2 relative whitespace-nowrap">
        <button
          type="button"
          onClick={() => setOpenFilter(openFilter === key ? null : key)}
          className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs text-left hover:border-[#1f1a16]"
        >
          Filter {label} {filterValue && filterValue.size > 0 && `(${filterValue.size})`}
        </button>
        {openFilter === key && (
          <div className="absolute top-full left-0 mt-1 z-50 w-64 max-h-64 overflow-y-auto bg-white border border-[#e6d6c6] rounded-lg shadow-lg p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold">Select {label}</span>
              <button type="button" onClick={() => { const f = { ...columnFilters }; delete f[filterKey]; setColumnFilters(f); }} className="text-xs text-[#c24d34] hover:underline">Clear</button>
            </div>
            <input type="text" value={getFilterSearchValue(key)} onChange={(e) => setFilterSearchValue(key, e.target.value)} placeholder="Search values" className="mb-2 w-full rounded border border-[#e6d6c6] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]" />
            <div className="space-y-1">
              {filterValuesBySearch(key, values).map((value) => (
                <label key={value} className="flex items-center gap-2 text-xs hover:bg-[#fffaf3] px-2 py-1 rounded">
                  <input type="checkbox" checked={filterValue?.has(value) ?? false} onChange={(e) => { const s = new Set(filterValue); if (e.target.checked) s.add(value); else s.delete(value); setColumnFilters({ ...columnFilters, [filterKey]: s }); }} className="rounded" />
                  <span>{value}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </th>
    );
  };

  const renderRangeFilterTh = (key: string, filterKey: keyof ColumnFilters, label: string) => {
    const filterValue = columnFilters[filterKey] as RangeFilter | undefined;
    return (
      <th key={key} className="px-3 py-2 relative whitespace-nowrap">
        <button type="button" onClick={() => setOpenFilter(openFilter === key ? null : key)} className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs text-left hover:border-[#1f1a16]">
          Filter {label} {filterValue && (filterValue.min || filterValue.max) ? "✓" : ""}
        </button>
        {openFilter === key && (
          <div className="absolute top-full left-0 mt-1 z-50 w-48 bg-white border border-[#e6d6c6] rounded-lg shadow-lg p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold">{label} Range</span>
              <button type="button" onClick={() => { const f = { ...columnFilters }; delete f[filterKey]; setColumnFilters(f); }} className="text-xs text-[#c24d34] hover:underline">Clear</button>
            </div>
            <div className="grid gap-2">
              <input type="number" placeholder="Min" value={filterValue?.min ?? ""} onChange={(e) => { const c = filterValue ?? { min: "", max: "" }; setColumnFilters({ ...columnFilters, [filterKey]: { ...c, min: e.target.value } }); }} className="rounded border border-[#e6d6c6] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]" />
              <input type="number" placeholder="Max" value={filterValue?.max ?? ""} onChange={(e) => { const c = filterValue ?? { min: "", max: "" }; setColumnFilters({ ...columnFilters, [filterKey]: { ...c, max: e.target.value } }); }} className="rounded border border-[#e6d6c6] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]" />
            </div>
          </div>
        )}
      </th>
    );
  };

  const renderFilterCell = (header: string) => {
    switch (header) {
      case "IMEI": return renderTextFilterTh("imei", "IMEI", uniqueValues.imei);
      case "Device":
        return (
          <th key="device" className="px-3 py-2 relative whitespace-nowrap">
            <button type="button" onClick={() => setOpenFilter(openFilter === "device" ? null : "device")} className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs text-left hover:border-[#1f1a16]">
              Filter Device {((columnFilters.model?.size ?? 0) + (columnFilters.capacity?.size ?? 0) + (columnFilters.color?.size ?? 0)) > 0 && "✓"}
            </button>
            {openFilter === "device" && (
              <div className="absolute top-full left-0 mt-1 z-50 w-72 max-h-80 overflow-y-auto bg-white border border-[#e6d6c6] rounded-lg shadow-lg p-3">
                <div className="mb-3">
                  <div className="flex justify-between items-center mb-1"><span className="text-xs font-semibold">Model</span><button type="button" onClick={() => { const f = { ...columnFilters }; delete f.model; setColumnFilters(f); }} className="text-xs text-[#c24d34] hover:underline">Clear</button></div>
                  <input type="text" value={getFilterSearchValue("model")} onChange={(e) => setFilterSearchValue("model", e.target.value)} placeholder="Search models" className="mb-1 w-full rounded border border-[#e6d6c6] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]" />
                  <div className="space-y-0.5 max-h-28 overflow-y-auto">
                    {filterValuesBySearch("model", uniqueValues.model).map((v) => (
                      <label key={v} className="flex items-center gap-2 text-xs hover:bg-[#fffaf3] px-2 py-0.5 rounded"><input type="checkbox" checked={columnFilters.model?.has(v) ?? false} onChange={(e) => { const s = new Set(columnFilters.model); if (e.target.checked) s.add(v); else s.delete(v); setColumnFilters({ ...columnFilters, model: s }); }} className="rounded" /><span>{v}</span></label>
                    ))}
                  </div>
                </div>
                <div className="mb-3">
                  <div className="flex justify-between items-center mb-1"><span className="text-xs font-semibold">Capacity</span><button type="button" onClick={() => { const f = { ...columnFilters }; delete f.capacity; setColumnFilters(f); }} className="text-xs text-[#c24d34] hover:underline">Clear</button></div>
                  <div className="space-y-0.5 max-h-28 overflow-y-auto">
                    {filterValuesBySearch("capacity", uniqueValues.capacity).map((v) => (
                      <label key={v} className="flex items-center gap-2 text-xs hover:bg-[#fffaf3] px-2 py-0.5 rounded"><input type="checkbox" checked={columnFilters.capacity?.has(v) ?? false} onChange={(e) => { const s = new Set(columnFilters.capacity); if (e.target.checked) s.add(v); else s.delete(v); setColumnFilters({ ...columnFilters, capacity: s }); }} className="rounded" /><span>{v}</span></label>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1"><span className="text-xs font-semibold">Color</span><button type="button" onClick={() => { const f = { ...columnFilters }; delete f.color; setColumnFilters(f); }} className="text-xs text-[#c24d34] hover:underline">Clear</button></div>
                  <div className="space-y-0.5 max-h-28 overflow-y-auto">
                    {filterValuesBySearch("color", uniqueValues.color).map((v) => (
                      <label key={v} className="flex items-center gap-2 text-xs hover:bg-[#fffaf3] px-2 py-0.5 rounded"><input type="checkbox" checked={columnFilters.color?.has(v) ?? false} onChange={(e) => { const s = new Set(columnFilters.color); if (e.target.checked) s.add(v); else s.delete(v); setColumnFilters({ ...columnFilters, color: s }); }} className="rounded" /><span>{v}</span></label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </th>
        );
      case "Carrier": return renderTextFilterTh("carrier", "Carrier", uniqueValues.carrier);
      case "Condition / Grade": return renderTextFilterTh("condition", "Condition", uniqueValues.condition);
      case "Supplier": return renderTextFilterTh("supplier", "Supplier", uniqueValues.supplier);
      case "Cost": return renderRangeFilterTh("costPesos", "cost", "Cost");
      case "Price": return renderRangeFilterTh("price", "price", "Price");
      case "Price 2": return renderRangeFilterTh("price2", "price2", "Price 2");
      case "Price 3": return renderRangeFilterTh("price3", "price3", "Price 3");
      case "Days In Stock": return renderRangeFilterTh("daysInStock", "daysInStock", "Days");
      case "Status": return renderTextFilterTh("status", "Status", uniqueValues.status);
      default: return <th key={header} className="px-3 py-2 whitespace-nowrap"></th>;
    }
  };

  const renderBodyCell = (header: string, row: InventoryRow) => {
    switch (header) {
      case "IMEI":
        return (
          <td key="imei" className="px-3 py-2 whitespace-nowrap">
            <Link href={row.imei ? `/add-device?imei=${encodeURIComponent(row.imei)}` : `/add-device?id=${encodeURIComponent(row.id || "")}`} className="font-semibold text-[#1f1a16] underline">{row.imei || "N/A"}</Link>
          </td>
        );
      case "Type": return <td key="type" className="px-3 py-2 whitespace-nowrap">{row.deviceType || "—"}</td>;
      case "Site": return <td key="site" className="px-3 py-2 whitespace-nowrap">{row.site || "Main"}</td>;
      case "Device": return <td key="device" className="px-3 py-2 whitespace-nowrap">{[row.model, row.color, row.capacity].filter(Boolean).join(" ")}</td>;
      case "Carrier": return <td key="carrier" className="px-3 py-2 whitespace-nowrap">{row.carrier}</td>;
      case "Condition / Grade": return <td key="cond" className="px-3 py-2 whitespace-nowrap">{row.condition || "-"} / {row.grade || "-"}</td>;
      case "Supplier": return <td key="supplier" className="px-3 py-2 whitespace-nowrap">{row.supplier}</td>;
      case "Currency": return <td key="currency" className="px-3 py-2 whitespace-nowrap">{row.costCurrency || "MXN"}</td>;
      case "Cost": return <td key="cost" className="px-3 py-2 whitespace-nowrap">{formatCurrencyCell(row.costPesos || "")}</td>;
      case "Price": return <td key="price" className="px-3 py-2 whitespace-nowrap">{formatCurrencyCell(row.price)}</td>;
      case "Price 2": return <td key="price2" className="px-3 py-2 whitespace-nowrap">{formatCurrencyCell(row.price2)}</td>;
      case "Price 3": return <td key="price3" className="px-3 py-2 whitespace-nowrap">{formatCurrencyCell(row.price3)}</td>;
      case "Days In Stock": return <td key="days" className="px-3 py-2 whitespace-nowrap">{getDaysInStock(row) ?? "-"}</td>;
      case "Status": return <td key="status" className="px-3 py-2 whitespace-nowrap">{row.status}</td>;
      case "Created": return <td key="created" className="px-3 py-2 whitespace-nowrap">{row.createdAt}</td>;
      case "Print":
        return (
          <td key="print" className="px-3 py-2 whitespace-nowrap">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={selectedForPrint.has(getRowPrintKey(row))} onChange={(e) => { const s = new Set(selectedForPrint); const key = getRowPrintKey(row); if (e.target.checked) s.add(key); else s.delete(key); setSelectedForPrint(s); }} className="rounded" />
              <button type="button" onClick={() => { const key = getRowPrintKey(row); setSelectedForPrint(new Set([key])); queuePrintForImeis([key]); }} className="rounded-full border border-[#d6c1ad] px-3 py-1 text-xs font-semibold text-[#3b2a1e] transition hover:bg-[#f5e4d5]">🖨️</button>
            </div>
          </td>
        );
      case "Actions":
        return (
          <td key="actions" className="px-3 py-2 whitespace-nowrap">
            <button type="button" onClick={() => handleDeleteDevice(row)} disabled={busy} className="rounded-full border border-[#c24d34] px-3 py-1 text-xs font-semibold text-[#c24d34] disabled:cursor-not-allowed disabled:opacity-60">Delete</button>
          </td>
        );
      default: return <td key={header} className="px-3 py-2 whitespace-nowrap">-</td>;
    }
  };

  return (
    <div className="app-shell">
      <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-5 px-4 py-6 md:gap-6 md:px-6 md:py-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[#1f1a16] md:text-3xl">Full Inventory</h1>
            <p className="text-sm text-[#6a4d3a]">
              Click an IMEI to open Add to Inventory page in edit mode.
            </p>
            {isSuperadmin && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={orgSearch}
                  onChange={(event) => setOrgSearch(event.target.value)}
                  placeholder="Search organization"
                  className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 text-sm outline-none focus:border-[#1f1a16]"
                />
                <select
                  value={activeOrganizationId}
                  onChange={(event) => setActiveOrganizationId(event.target.value)}
                  className="min-w-[240px] rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 text-sm outline-none focus:border-[#1f1a16]"
                >
                  <option value="">Select organization</option>
                  {filteredOrganizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleSwitchOrganization}
                  disabled={switchingOrg || !activeOrganizationId}
                  className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-medium text-[#3b2a1e] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {switchingOrg ? "Switching..." : "View Organization"}
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/add-device"
              className="rounded-full bg-[#1f1a16] px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
            >
              Add Device
            </Link>
            <a
              href="/inventory-import-template.csv"
              download
              className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-medium text-[#3b2a1e] transition hover:border-[#1f1a16]"
            >
              Download Template
            </a>
            <input
              type="date"
              value={exportFromDate}
              onChange={(event) => setExportFromDate(event.target.value)}
              className="rounded-full border border-[#d6c1ad] bg-[#fffaf3] px-4 py-2 text-sm text-[#3b2a1e] outline-none focus:border-[#1f1a16]"
              aria-label="Export from date"
              title="Export from date"
            />
            <input
              type="date"
              value={exportToDate}
              onChange={(event) => setExportToDate(event.target.value)}
              className="rounded-full border border-[#d6c1ad] bg-[#fffaf3] px-4 py-2 text-sm text-[#3b2a1e] outline-none focus:border-[#1f1a16]"
              aria-label="Export to date"
              title="Export to date"
            />
            {isSuperadmin && (
              <label className="inline-flex items-center gap-2 rounded-full border border-[#d6c1ad] bg-[#fffaf3] px-4 py-2 text-sm text-[#3b2a1e]">
                <input
                  type="checkbox"
                  checked={exportAllOrganizations}
                  onChange={(event) => setExportAllOrganizations(event.target.checked)}
                />
                All orgs
              </label>
            )}
            <a
              href={buildInventoryExportUrl("xlsx")}
              className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-medium text-[#3b2a1e] transition hover:border-[#1f1a16]"
            >
              Download Full Inventory Excel
            </a>
            <a
              href={buildInventoryExportUrl("csv")}
              className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-medium text-[#3b2a1e] transition hover:border-[#1f1a16]"
            >
              Download Full Inventory CSV
            </a>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-medium text-[#3b2a1e] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Import Excel
            </button>
            <button
              type="button"
              onClick={() => setBulkAddOpen(true)}
              disabled={busy}
              className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-medium text-[#3b2a1e] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add in Bulk
            </button>
              <BulkAddModal open={bulkAddOpen} onClose={() => setBulkAddOpen(false)} onParse={handleBulkParse} />
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => handleImportFile(event.target.files)}
            />
            <button
              type="button"
              onClick={loadInventory}
              disabled={busy}
              className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-medium text-[#3b2a1e] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Refresh
            </button>
            <div className="relative" data-col-menu>
              <button
                type="button"
                onClick={() => setColMenuOpen(!colMenuOpen)}
                className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-medium text-[#3b2a1e] transition hover:border-[#1f1a16]"
              >
                Columns {hiddenColumns.size > 0 && `(${headers.length - NON_HIDEABLE.size - hiddenColumns.size}/${headers.length - NON_HIDEABLE.size})`}
              </button>
              {colMenuOpen && (
                <div className="absolute right-0 top-full mt-2 z-50 w-56 max-h-80 overflow-y-auto bg-white border border-[#e6d6c6] rounded-lg shadow-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold">Toggle Columns</span>
                    <button type="button" onClick={() => { setHiddenColumns(new Set()); try { localStorage.removeItem(HIDDEN_COLS_KEY); } catch { /* ignore */ } }} className="text-xs text-[#c24d34] hover:underline">Show All</button>
                  </div>
                  <div className="space-y-1">
                    {headers.filter(h => !NON_HIDEABLE.has(h)).map(h => (
                      <label key={h} className="flex items-center gap-2 text-xs hover:bg-[#fffaf3] px-2 py-1 rounded cursor-pointer">
                        <input type="checkbox" checked={!hiddenColumns.has(h)} onChange={() => toggleColVisibility(h)} className="rounded" />
                        <span>{h}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {selectedForPrint.size > 0 && (
              <button
                type="button"
                onClick={() => {
                  queuePrintForImeis(Array.from(selectedForPrint));
                }}
                className="rounded-full bg-[#1f1a16] px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
              >
                🖨️ Print {selectedForPrint.size} ({selectedForPrint.size === 1 ? "1 label" : `${selectedForPrint.size} labels`})
              </button>
            )}
          </div>
        </header>

        <section className="rounded-2xl border border-[#e6d6c6] bg-white p-4">
          <div className="grid gap-3 md:grid-cols-6">
            <label className="grid gap-2 text-sm">
              Status filter
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
              >
                <option value="All">All</option>
                <option value="Available">Available</option>
                <option value="Sold">Sold</option>
                <option value="Reserved">Reserved</option>
                <option value="Defective">Defective</option>
                <option value="Deleted">Deleted</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              Site filter
              <select
                value={siteFilter}
                onChange={(event) => setSiteFilter(event.target.value)}
                className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
              >
                <option value="All">All</option>
                {uniqueValues.site.map((site) => (
                  <option key={site} value={site}>{site}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              Age filter
              <select
                value={agePreset}
                onChange={(event) => setAgePreset(event.target.value as AgePreset)}
                className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
              >
                <option value="all">All ages</option>
                <option value="0-7">0-7 days</option>
                <option value="8-30">8-30 days</option>
                <option value="31-60">31-60 days</option>
                <option value="61-90">61-90 days</option>
                <option value="90+">90+ days</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              Min days (optional)
              <input
                type="number"
                min={0}
                value={minAgeDays}
                onChange={(event) => setMinAgeDays(event.target.value)}
                className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                placeholder="e.g. 14"
              />
            </label>
            <label className="grid gap-2 text-sm">
              Max days (optional)
              <input
                type="number"
                min={0}
                value={maxAgeDays}
                onChange={(event) => setMaxAgeDays(event.target.value)}
                className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                placeholder="e.g. 60"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("All");
                  setSiteFilter("All");
                  setAgePreset("all");
                  setMinAgeDays("");
                  setMaxAgeDays("");
                  setColumnFilters({});
                  setFilterSearch({});
                }}
                className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-medium text-[#3b2a1e]"
              >
                Clear all filters
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs text-[#6a4d3a]">
            All status hides Deleted items by default. Select Deleted in Status filter to view them.
          </p>
        </section>

        <div className="rounded-3xl border border-[#eddac7] bg-white p-3 shadow-[0_25px_60px_rgba(90,62,45,0.1)] md:p-4">
          <div className="mobile-scroll max-h-[65vh] overflow-auto">
          {(() => {
            const visibleHeaders = headers
              .filter(h => useUsdConversion || (h !== "Cost USD" && h !== "USD Rate"))
              .filter(h => !hiddenColumns.has(h));
            return (
          <table className="min-w-max w-full text-left text-sm">
            <thead className="sticky top-0 z-20 bg-white">
              <tr className="border-b border-[#ead8c6] bg-white text-[#6a4d3a]">
                {visibleHeaders.map((header) => (
                  <th key={header} className="px-3 py-2 font-semibold whitespace-nowrap">
                    {header === "Print" || header === "Actions" ? (
                      header
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleSort(header)}
                        className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-[#fffaf3]"
                      >
                        <span>{header}</span>
                        <span className="text-[10px] text-[#6a4d3a]">
                          {sortColumn === header ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    )}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-[#ead8c6] bg-white">
                {visibleHeaders.map(header => renderFilterCell(header))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={`${row.rowNumber}-${row.imei || row.id}`} className="border-b border-[#f1e4d6]">
                  {visibleHeaders.map(header => renderBodyCell(header, row))}
                </tr>
              ))}
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={visibleHeaders.length} className="px-3 py-6 text-center text-[#6a4d3a]">
                    No inventory rows loaded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
            );
          })()}
          </div>
        </div>

        {status && (
          <div className="rounded-2xl border border-[#e6d6c6] bg-[#fff6ea] px-4 py-3 text-sm text-[#5c4332]">
            {status}
          </div>
        )}

        {importPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.35)] p-4">
            <div className="w-full max-w-6xl rounded-2xl border border-[#e6d6c6] bg-white shadow-[0_25px_60px_rgba(90,62,45,0.2)]">
              <div className="border-b border-[#ead8c6] px-5 py-4">
                <h2 className="text-xl font-semibold text-[#1f1a16]">Import Preview</h2>
                <p className="text-sm text-[#6a4d3a]">
                  File: {importPreview.fileName}
                </p>
                <p className="mt-2 text-sm text-[#5c4332]">
                  {importPreview.rows.length} row(s), {importPreview.rows.filter((row) => row.errors.length === 0).length} valid, {importPreview.rows.filter((row) => row.errors.length > 0).length} invalid.
                </p>
                <p className="mt-1 text-xs text-[#6a4d3a]">
                  You can edit rows below before import. Validation updates automatically.
                </p>
              </div>

              <div className="max-h-[55vh] overflow-auto px-5 py-4">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#ead8c6] text-[#6a4d3a]">
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">IMEI</th>
                      <th className="px-3 py-2">Site</th>
                      <th className="px-3 py-2">Location</th>
                      <th className="px-3 py-2">Model</th>
                      <th className="px-3 py-2">Capacity</th>
                      <th className="px-3 py-2">Color</th>
                      <th className="px-3 py-2">Carrier</th>
                      <th className="px-3 py-2">Condition</th>
                      <th className="px-3 py-2">Grade</th>
                      <th className="px-3 py-2">Supplier</th>
                      <th className="px-3 py-2">Currency</th>
                      <th className="px-3 py-2">Battery</th>
                      <th className="px-3 py-2">Cycle Count</th>
                      <th className="px-3 py-2">iOS Version</th>
                      <th className="px-3 py-2">Serial Number</th>
                      <th className="px-3 py-2">Date of Purchase</th>
                      <th className="px-3 py-2">Comments</th>
                      <th className="px-3 py-2">QR Raw</th>
                      <th className="px-3 py-2">Cost</th>
                      <th className="px-3 py-2">Price</th>
                      <th className="px-3 py-2">Price 2</th>
                      <th className="px-3 py-2">Price 3</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((previewRow) => (
                      <tr key={previewRow.rowNumber} className="border-b border-[#f1e4d6] align-top">
                        <td className="px-3 py-2">{previewRow.rowNumber}</td>
                        <td className="px-3 py-2 min-w-[180px]">
                          <input
                            type="text"
                            value={previewRow.data.imei}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "imei", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[130px]">
                          <input
                            type="text"
                            value={previewRow.data.site}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "site", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[130px]">
                          <input
                            type="text"
                            value={previewRow.data.site}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "site", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[180px]">
                          <input
                            type="text"
                            value={previewRow.data.model}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "model", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[130px]">
                          <input
                            type="text"
                            value={previewRow.data.capacity}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "capacity", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[130px]">
                          <input
                            type="text"
                            value={previewRow.data.color}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "color", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[140px]">
                          <input
                            type="text"
                            value={previewRow.data.carrier}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "carrier", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[130px]">
                          <input
                            type="text"
                            value={previewRow.data.condition}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "condition", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[90px]">
                          <input
                            type="text"
                            value={previewRow.data.grade}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "grade", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[160px]">
                          <input
                            type="text"
                            value={previewRow.data.supplier}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "supplier", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[110px]">
                          <input
                            type="text"
                            value={previewRow.data.costCurrency}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "costCurrency", event.target.value.toUpperCase())
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[120px]">
                          <input
                            type="text"
                            value={previewRow.data.batteryHealth}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "batteryHealth", event.target.value)
                            }
                            placeholder="e.g. 85%"
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[110px]">
                          <input
                            type="text"
                            value={previewRow.data.cycleCount}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "cycleCount", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[120px]">
                          <input
                            type="text"
                            value={previewRow.data.iosVersion}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "iosVersion", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[150px]">
                          <input
                            type="text"
                            value={previewRow.data.serialNumber}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "serialNumber", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[170px]">
                          <input
                            type="text"
                            value={previewRow.data.dateOfPurchase}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "dateOfPurchase", event.target.value)
                            }
                            placeholder="YYYY-MM-DD"
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[180px]">
                          <input
                            type="text"
                            value={previewRow.data.comments}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "comments", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[180px]">
                          <input
                            type="text"
                            value={previewRow.data.qrRaw}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "qrRaw", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[130px]">
                          <input
                            type="text"
                            value={formatCurrencyCell(previewRow.data.costPesos) === "-" ? "" : formatCurrencyCell(previewRow.data.costPesos)}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "costPesos", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[130px]">
                          <input
                            type="text"
                            value={formatCurrencyCell(previewRow.data.price) === "-" ? "" : formatCurrencyCell(previewRow.data.price)}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "price", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[130px]">
                          <input
                            type="text"
                            value={formatCurrencyCell(previewRow.data.price2) === "-" ? "" : formatCurrencyCell(previewRow.data.price2)}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "price2", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[130px]">
                          <input
                            type="text"
                            value={formatCurrencyCell(previewRow.data.price3) === "-" ? "" : formatCurrencyCell(previewRow.data.price3)}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "price3", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[120px]">
                          <input
                            type="text"
                            value={previewRow.data.status}
                            onChange={(event) =>
                              handlePreviewFieldChange(previewRow.rowNumber, "status", event.target.value)
                            }
                            className="w-full rounded border border-[#e6d6c6] bg-[#fffaf3] px-2 py-1 text-xs outline-none focus:border-[#1f1a16]"
                          />
                        </td>
                        <td className="px-3 py-2">
                          {previewRow.errors.length === 0 && previewRow.warnings.length === 0 && (
                            <span className="text-[#2d6a4f]">No issues</span>
                          )}
                          {previewRow.errors.length > 0 && (
                            <div className="text-[#c24d34]">
                              {previewRow.errors.join(" | ")}
                            </div>
                          )}
                          {previewRow.warnings.length > 0 && (
                            <div className="text-[#8a6a2f]">
                              {previewRow.warnings.join(" | ")}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#ead8c6] px-5 py-4">
                <button
                  type="button"
                  onClick={handleApplyPricingGuide}
                  disabled={busy}
                  className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-medium text-[#3b2a1e] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Apply Pricing guide
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportPreview(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                  className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-medium text-[#3b2a1e]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={busy || importPreview.rows.every((row) => row.errors.length > 0)}
                  className="rounded-full bg-[#1f1a16] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Confirm Import
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="hidden" aria-hidden>
          {Array.from(selectedForPrint).map((itemKey) => {
            const row = rows.find((item) => getRowPrintKey(item) === itemKey);
            if (!row) return null;
            return (
              <LabelPreview
                key={`render-${itemKey}`}
                {...getLabelPropsFromRow(row)}
                onRendered={(payload) => {
                  setRenderedLabelsForPrint((previous) => {
                    const current = previous.get(itemKey);
                    if (
                      current &&
                      current.dataUrl === payload.dataUrl &&
                      current.width === payload.width &&
                      current.height === payload.height
                    ) {
                      return previous;
                    }
                    const next = new Map(previous);
                    next.set(itemKey, payload);
                    return next;
                  });
                }}
              />
            );
          })}
        </div>
        </main>
      </div>
    </div>
  );
}

