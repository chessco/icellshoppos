"use client";

import React from "react";

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

// ErrorBoundary component to catch runtime errors
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console or external service
    console.error("ErrorBoundary caught error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: 'red', padding: 24 }}>
          <h2>Something went wrong in Add Device Page.</h2>
          <pre>{this.state.error?.toString()}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import LabelPreview from "@/components/LabelPreview";
import { formatCurrencyDisplay } from "@/lib/display-format";
export const dynamic = "force-dynamic";
import CurrentOrgBadge from "@/components/CurrentOrgBadge";
import { parseQrLine, type QrScanData } from "@/lib/qr";
import {
  fetchModelCatalog,
  loadModelCatalog,
  MODEL_CATALOG_STORAGE_KEY,
  MODEL_CATALOG_UPDATED_EVENT,
  type ModelCatalog,
  type ModelCatalogEntry,
} from "@/lib/modelCatalog";
import { defaultCarrierOptions, fetchCarrierOptions } from "@/lib/carrier-options";
import {
  defaultConditionOptions,
  defaultGradeOptions,
  fetchConditionOptions,
  fetchGradeOptions,
} from "@/lib/sheets";

type InventoryForm = {
  inventoryItemId: string;
  imei: string;
  sku: string;
  deviceTypeId: string;
  siteId: string;
  model: string;
  capacity: string;
  color: string;
  carrier: string;
  condition: string;
  grade: string;
  comments: string;
  supplier: string;
  dateOfPurchase: string;
  costCurrency: string;
  costUsd: string;
  usdToPesosRate: string;
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

type SupplierRecord = {
  id?: string;
  name: string;
  status: "Active" | "Inactive";
  createdAt: string;
};

type LocationRecord = {
  id: string;
  name: string;
  status: "Active" | "Inactive";
};

type ModelCapacityPriceRecord = {
  id?: string;
  model: string;
  capacity: string;
  price: string;
  price2: string;
  price3: string;
};

const emptyForm: InventoryForm = {
  inventoryItemId: "",
  imei: "",
  sku: "",
  deviceTypeId: "",
  siteId: "",
  model: "",
  capacity: "",
  color: "",
  carrier: "",
  condition: "",
  grade: "",
  comments: "",
  supplier: "",
  dateOfPurchase: "",
  costCurrency: "MXN",
  costUsd: "",
  usdToPesosRate: "",
  costPesos: "",
  price: "",
  price2: "",
  price3: "",
  status: "Available",
  batteryHealth: "",
  cycleCount: "",
  iosVersion: "",
  serialNumber: "",
  qrRaw: "",
};

const emptyCatalog: ModelCatalog = {};

const defaultStatusOptions = ["Available", "Sold", "Reserved", "Damaged"];

const parseAmount = (value: string) => {
  const cleaned = value.replace(/[$,\s]/g, "");
  const parsed = parseFloat(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
};

const formatMoneyWhole = (amount: number) => formatCurrencyDisplay(Math.ceil(amount));

const calculateCostPesos = (costUsd: string, rate: string) => {
  const cost = parseAmount(costUsd);
  const rateNum = parseAmount(rate);
  if (!cost || !rateNum) return "";
  const costPesosAmount = cost * rateNum;
  return formatMoneyWhole(Math.ceil(costPesosAmount));
};

const normalizeRateInput = (value: string) => {
  const numeric = Number(value.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return String(numeric);
};

const normalizeImeiValue = (value: string) => {
  const trimmed = value.trim();
  const first15 = trimmed.match(/\d{15}/)?.[0];
  if (first15) return first15;
  const leading = trimmed.match(/^(\d+)/)?.[1];
  if (leading && leading.length >= 15) return leading.slice(0, 15);
  const allDigits = trimmed.replace(/\D/g, "");
  if (allDigits.length >= 15) return allDigits.slice(0, 15);
  return allDigits || trimmed.toLowerCase();
};

const normalizeSerialNumberValue = (value: string) => value.trim();

const normalizeSkuValue = (value: string) => value.trim().toUpperCase();

const generateGenericSku = () =>
  `SKU-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const getDuplicateCheckQuery = (
  imei: string,
  serialNumber: string,
  sku: string,
  inventoryItemId?: string
) => {
  const normalizedImei = normalizeImeiValue(imei);
  const normalizedSerialNumber = normalizeSerialNumberValue(serialNumber);
  const normalizedSku = normalizeSkuValue(sku);

  if (!normalizedImei && !normalizedSerialNumber && !normalizedSku) {
    return null;
  }

  const params = new URLSearchParams();
  if (normalizedImei) {
    params.set("imei", normalizedImei);
  } else {
    if (normalizedSerialNumber) {
      params.set("serialNumber", normalizedSerialNumber);
    } else {
      params.set("sku", normalizedSku);
    }
  }
  if (inventoryItemId?.trim()) {
    params.set("excludeId", inventoryItemId.trim());
  }

  return {
    label: normalizedImei ? "IMEI" : normalizedSerialNumber ? "Serial Number" : "SKU",
    query: params.toString(),
  } as const;
};

const normalizeDateForInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const explicit = trimmed.match(/^(\d{4})[\/-](\d{2})[\/-](\d{2})$/);
  if (explicit) {
    return `${explicit[1]}-${explicit[2]}-${explicit[3]}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const normalizeBatteryHealth = (value: string): { value: string; error: string | null } => {
  const trimmed = value.trim();
  if (!trimmed) return { value: "", error: null };

  const numericRaw = Number(trimmed.replace(/%/g, "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numericRaw) || numericRaw < 0) {
    return { value: trimmed, error: "Battery health must be a valid number." };
  }

  let percentage = numericRaw;
  if (percentage < 1) {
    percentage *= 100;
  }

  if (percentage > 100) {
    return { value: trimmed, error: "Battery health cannot be greater than 100%." };
  }

  const normalizedNumber = Number.isInteger(percentage)
    ? String(percentage)
    : String(Number(percentage.toFixed(2)));

  return { value: `${normalizedNumber}%`, error: null };
};

const getSafeCatalogEntry = (catalog: ModelCatalog, modelName: string): ModelCatalogEntry | null => {
  const entry = catalog[modelName];
  if (!entry) return null;

  const capacities = Array.isArray(entry.capacities)
    ? entry.capacities.filter((capacity): capacity is string => typeof capacity === "string")
    : [];
  const colors = Array.isArray(entry.colors)
    ? entry.colors.filter((color): color is string => typeof color === "string")
    : [];

  if (capacities.length === 0 && colors.length === 0) {
    return null;
  }

  return {
    capacities,
    colors,
  };
};

function AddDevicePageContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isTradeInPopup = searchParams.get("popup") === "trade-in";
  const isPrefillMode = searchParams.get("prefill") === "1";
  const tradeInSaleId = searchParams.get("saleId")?.trim() ?? "";
  const tradeInSupplier = searchParams.get("supplier")?.trim() ?? "";
  const tradeInComments = searchParams.get("comments")?.trim() ?? "";
  const tradeInCostPesos = searchParams.get("costPesos")?.trim() ?? "";
  const [scanData, setScanData] = useState<QrScanData | null>(null);
  const [form, setForm] = useState<InventoryForm>(emptyForm);
  const [status, setStatus] = useState<string | null>(null);
  const [supplierRecords, setSupplierRecords] = useState<SupplierRecord[]>([]);
  const [locationRecords, setLocationRecords] = useState<LocationRecord[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>(defaultStatusOptions);
  const [carrierOptions, setCarrierOptions] = useState<string[]>([...defaultCarrierOptions]);
  const [conditionOptions, setConditionOptions] = useState<string[]>([...defaultConditionOptions]);
  const [gradeOptions, setGradeOptions] = useState<string[]>([...defaultGradeOptions]);
  const [deviceTypeOptions, setDeviceTypeOptions] = useState<{ id: string; name: string }[]>([]);
  const [supplierDraft, setSupplierDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [imeiDuplicate, setImeiDuplicate] = useState(false);
  const [duplicateIdentifierLabel, setDuplicateIdentifierLabel] = useState<"IMEI" | "Serial Number" | "SKU">("IMEI");
  const [isEditMode, setIsEditMode] = useState(false);
  const [generateSkuWhenNoSerial, setGenerateSkuWhenNoSerial] = useState(false);
  const [latestUsdToPesosRate, setLatestUsdToPesosRate] = useState("");
  const [rateTrackerDraft, setRateTrackerDraft] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [previewViewport, setPreviewViewport] = useState({ width: 1280, height: 800 });
  const [labelPreviewMeta, setLabelPreviewMeta] = useState({ width: 192, height: 96, previewScalePercent: 100 });
  const [renderedLabelForPrint, setRenderedLabelForPrint] = useState<{ dataUrl: string; width: number; height: number }>({
    dataUrl: "",
    width: 192,
    height: 96,
  });
  const [modelPriceRules, setModelPriceRules] = useState<ModelCapacityPriceRecord[]>([]);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog>(emptyCatalog);
  const useUsdConversion = false;
  const supplierSelectRef = useRef<HTMLSelectElement | null>(null);
  const costInputRef = useRef<HTMLInputElement | null>(null);

    // ...existing code...
    const suppliers = useMemo(
      () =>
        supplierRecords
          .filter((supplier) => supplier.status === "Active")
          .map((supplier) => supplier.name),
      [supplierRecords]
    );

    const activeLocations = useMemo(
      () => locationRecords.filter((location) => location.status === "Active"),
      [locationRecords]
    );

    // Ensure current supplier is always available in the dropdown.
    useEffect(() => {
      if (!form.supplier) return;
      if (!suppliers.includes(form.supplier)) {
        setSupplierRecords((prev) => [
          ...prev,
          { name: form.supplier, status: "Active", createdAt: new Date().toISOString() },
        ]);
      }
    }, [form.supplier, suppliers]);

  const labelData = useMemo(
    () => {
      const data = {
        model: form.model,
        color: form.color,
        capacity: form.capacity,
        batteryHealth: form.batteryHealth,
        cycleCount: form.cycleCount,
        iosVersion: form.iosVersion,
        carrier: form.carrier,
        condition: form.condition,
        grade: form.grade || form.condition,
        comments: form.comments,
        imei: form.imei,
        sku: form.sku,
        qrRaw: scanData?.raw ?? "",
        serialNumber: form.serialNumber,
        dateOfPurchase: form.dateOfPurchase,
        createdAt: new Date().toISOString(),
        price: form.price,
        price2: form.price2,
        price3: form.price3,
        logoDataUrl: logoDataUrl,
      };
      return data;
    },
    [form, scanData, logoDataUrl]
  );

  const screenPreviewScale = useMemo(() => {
    const availableWidth = Math.max(420, Math.min(720, previewViewport.width - 760));
    const availableHeight = Math.max(220, Math.min(420, previewViewport.height - 320));
    const autoScale = Math.min(
      availableWidth / labelPreviewMeta.width,
      availableHeight / labelPreviewMeta.height
    );
    const manualScale = labelPreviewMeta.previewScalePercent / 100;
    return Math.max(1, Math.min(6, autoScale * manualScale));
  }, [labelPreviewMeta.height, labelPreviewMeta.previewScalePercent, labelPreviewMeta.width, previewViewport.height, previewViewport.width]);

  useEffect(() => {
    const updateViewport = () => {
      setPreviewViewport({ width: window.innerWidth, height: window.innerHeight });
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    const loadLabelPreviewMeta = async () => {
      try {
        const response = await fetch("/api/org/label-template", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.template) return;

        const template = payload.template as {
          canvas?: { width?: number; height?: number };
          settings?: { previewScalePercent?: number };
          width?: number;
          height?: number;
        };

        const settings = payload.template?.settings as {
          useCustomSize?: boolean;
          labelSize?: "small" | "shipping";
          customWidthInches?: number;
          customHeightInches?: number;
          orientation?: "portrait" | "landscape";
          previewScalePercent?: number;
        } | undefined;

        let width = 192;
        let height = 96;
        if (settings?.useCustomSize) {
          width = Math.round((settings.customWidthInches ?? 2) * 96);
          height = Math.round((settings.customHeightInches ?? 1) * 96);
          if (settings.orientation === "landscape" && width < height) {
            [width, height] = [height, width];
          }
          if (settings.orientation === "portrait" && width > height) {
            [width, height] = [height, width];
          }
        } else if (settings?.labelSize === "shipping") {
          width = 384;
          height = 576;
        }

        setLabelPreviewMeta({
          width,
          height,
          previewScalePercent:
            typeof settings?.previewScalePercent === "number"
              ? settings.previewScalePercent
              : 100,
        });
      } catch {
        setLabelPreviewMeta({ width: 192, height: 96, previewScalePercent: 100 });
      }
    };

    void loadLabelPreviewMeta();
  }, []);

  const modelOptions = useMemo(() => {
    if (!form.deviceTypeId) return Object.keys(modelCatalog);
    return Object.entries(modelCatalog)
      .filter(([, entry]) => entry.deviceTypeId === form.deviceTypeId)
      .map(([name]) => name);
  }, [modelCatalog, form.deviceTypeId]);
  const selectedModelCatalog = form.model
    ? getSafeCatalogEntry(modelCatalog, form.model)
    : undefined;
  const capacityOptions = useMemo(() => {
    if (!selectedModelCatalog) return [] as string[];
    return [...selectedModelCatalog.capacities];
  }, [selectedModelCatalog]);
  const colorOptions = useMemo(() => {
    if (!selectedModelCatalog) return [] as string[];
    return [...selectedModelCatalog.colors];
  }, [selectedModelCatalog]);

  const latestRuleForSelection = useMemo(() => {
    if (!form.model.trim() || !form.capacity.trim()) return null;

    const model = form.model.trim().toLowerCase();
    const capacity = form.capacity.trim().toLowerCase();

    const match = modelPriceRules.find(
      (record) =>
        record.model.trim().toLowerCase() === model &&
        record.capacity.trim().toLowerCase() === capacity
    );

    return match ?? null;
  }, [form.model, form.capacity, modelPriceRules]);


  const lowMarginWarning = useMemo(() => {
    const cost = parseAmount(form.costPesos);
    const salePrice = parseAmount(form.price);
    if (!cost || !salePrice) return "";

    const marginPercent = ((salePrice - cost) / cost) * 100;
    if (!Number.isFinite(marginPercent) || marginPercent >= 15) return "";

    return `Warning: margin is ${marginPercent.toFixed(1)}%, below 15%.`;
  }, [form.costPesos, form.price]);

  const updateForm = (field: keyof InventoryForm, value: string) => {
    try {
      setForm((prev) => ({ ...prev, [field]: value }));
    } catch (err) {
      console.error("updateForm error", field, value, err);
      throw err;
    }
  };

  const formatMoneyField = (field: "costUsd" | "costPesos" | "price" | "price2" | "price3") => {
    const value = form[field];
    const parsed = parseAmount(value);
    if (parsed === null) {
      updateForm(field, "");
      return;
    }
    updateForm(field, formatMoneyWhole(parsed));
  };

  const formatRateField = () => {
    const normalized = normalizeRateInput(form.usdToPesosRate);
    updateForm("usdToPesosRate", normalized);
  };

  const handleModelChange = (nextModel: string) => {
    try {
      updateForm("model", nextModel);
      if (!nextModel) {
        updateForm("capacity", "");
        updateForm("color", "");
        return;
      }

      const catalog = getSafeCatalogEntry(modelCatalog, nextModel);
      if (!catalog) {
        updateForm("capacity", "");
        updateForm("color", "");
        setStatus("Selected model is not configured correctly in the device guide.");
        return;
      }

      if (!catalog.capacities.some((capacity) => capacity === form.capacity)) {
        updateForm("capacity", "");
      }
      if (!catalog.colors.some((color) => color === form.color)) {
        updateForm("color", "");
      }
    } catch (err) {
      console.error("handleModelChange error", nextModel, err);
      throw err;
    }
  };

  const applyParsedScan = async (scanLine: string) => {
    const trimmedScanLine = scanLine.trim();
    if (!trimmedScanLine) {
      setScanData(null);
      setImeiDuplicate(false);
      setForm((prev) => ({
        ...prev,
        imei: "",
        qrRaw: "",
      }));
      return;
    }

    let parsed: QrScanData | null = null;
    try {
      parsed = parseQrLine(trimmedScanLine);
    } catch (err) {
      setStatus("Failed to parse QR line: " + (err instanceof Error ? err.message : "Unknown error"));
      return;
    }
    
    if (!parsed) {
      const fallbackImei = trimmedScanLine.match(/^(\d{15})/)?.[1];
      if (fallbackImei) {
        setForm((prev) => ({
          ...prev,
          imei: fallbackImei,
          qrRaw: trimmedScanLine,
        }));
        setStatus("Partial scan parsed (IMEI only).");
        return;
      }
      setStatus("Failed to parse QR line.");
      return;
    }
    setScanData(parsed);

    const nextImei = normalizeImeiValue(parsed.imei || "");
    const nextSerialNumber = normalizeSerialNumberValue(parsed.serialNumber || "");

    setForm((prev) => {
      const normalizedBattery = normalizeBatteryHealth(parsed.batteryHealth || prev.batteryHealth);
      return {
        ...prev,
        imei: nextImei,
        model: parsed.model || prev.model,
        color: parsed.color || prev.color,
        capacity: parsed.capacity || prev.capacity,
        batteryHealth: normalizedBattery.value,
        cycleCount: parsed.cycleCount || prev.cycleCount,
        iosVersion: parsed.iosVersion || prev.iosVersion,
        serialNumber: parsed.serialNumber || prev.serialNumber,
        dateOfPurchase: normalizeDateForInput(parsed.date || "") || prev.dateOfPurchase,
        qrRaw: parsed.raw || prev.qrRaw,
      };
    });

    setStatus("Scan parsed successfully.");

    try {
      setBusy(true);
      const duplicateCheck = getDuplicateCheckQuery(nextImei, nextSerialNumber, form.sku, form.inventoryItemId);
      if (!duplicateCheck) {
        setImeiDuplicate(false);
        setDuplicateIdentifierLabel("IMEI");
        setStatus("Scan parsed successfully.");
        return;
      }

      const response = await fetch(`/api/inventory/check-imei?${duplicateCheck.query}`);
      if (!response.ok) {
        throw new Error(`Failed to check ${duplicateCheck.label}`);
      }
      const data = await response.json();
      const exists = data.exists;
      setImeiDuplicate(exists);
      setDuplicateIdentifierLabel(duplicateCheck.label);

      if (!exists) {
        setStatus("Scan parsed successfully.");
      } else {
        setStatus(`Scan parsed successfully. Existing ${duplicateCheck.label} detected.`);
      }
    } catch (error: unknown) {
      setImeiDuplicate(false);
      setStatus(
        error instanceof Error
          ? `Scan parsed successfully. ${error.message}`
          : "Scan parsed successfully. Failed to check IMEI."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleParse = async () => {
    const scanLine = form.imei.trim();
    if (!scanLine) {
      setStatus("Enter a QR line to parse.");
      return;
    }
    await applyParsedScan(scanLine);
  };

  const handleImeiInputChange = async (nextValue: string) => {
    // Normalize scanner input: remove all trailing newlines, carriage returns, and trim
    let normalizedValue = nextValue.replace(/[\r\n]+/g, "").trim();

    if (!normalizedValue) {
      setScanData(null);
      setImeiDuplicate(false);
      setStatus(null);
      setForm((prev) => ({
        ...prev,
        imei: "",
        qrRaw: "",
      }));
      return;
    }

    const looksLikeQrPayload = [",", ";", "\t"].some((delimiter) =>
      normalizedValue.includes(delimiter) && normalizedValue.split(delimiter).length >= 6
    );
    if (looksLikeQrPayload) {
      await applyParsedScan(normalizedValue);
      return;
    }

    setScanData(null);
    updateForm("imei", normalizeImeiValue(normalizedValue));
    setStatus(null);
  };

  const handleLabelRendered = useCallback((payload: { dataUrl: string; width: number; height: number }) => {
    setRenderedLabelForPrint(payload);
  }, []);

  const handleSave = async () => {
    const batteryHealthValidation = normalizeBatteryHealth(form.batteryHealth);

    const catalogEntry = getSafeCatalogEntry(modelCatalog, form.model);
    if (!catalogEntry) {
      setStatus("Select a model from the device guide.");
      return;
    }
    if (!catalogEntry.capacities.includes(form.capacity)) {
      setStatus("Select a valid storage option for the model.");
      return;
    }
    if (!catalogEntry.colors.includes(form.color)) {
      setStatus("Select a valid color for the model.");
      return;
    }

    if (!form.supplier.trim()) {
      setStatus("Supplier is required.");
      supplierSelectRef.current?.focus();
      return;
    }

    if (!form.siteId) {
      setStatus("Site location is required.");
      return;
    }

    if (useUsdConversion && !form.costUsd.trim()) {
      setStatus("Cost USD is required.");
      costInputRef.current?.focus();
      return;
    }

    if (!useUsdConversion && !form.costPesos.trim()) {
      setStatus("Cost Pesos is required.");
      return;
    }

    if (batteryHealthValidation.error) {
      setStatus(batteryHealthValidation.error);
      return;
    }

    const normalizedImei = normalizeImeiValue(form.imei);
    const normalizedSerialNumber = normalizeSerialNumberValue(form.serialNumber);
    const normalizedSku = normalizeSkuValue(form.sku);
    const effectiveSku =
      normalizedSku || (generateSkuWhenNoSerial && !normalizedSerialNumber && !normalizedImei ? generateGenericSku() : "");

    if (!normalizedImei && !normalizedSerialNumber && !effectiveSku) {
      setStatus("IMEI, Serial Number, or SKU is required.");
      return;
    }

    try {
      setBusy(true);
      
      // Clean currency formatted values before sending to API
      const cleanedForm = {
        ...form,
        inventoryItemId: form.inventoryItemId,
        imei: normalizedImei,
        sku: effectiveSku,
        serialNumber: normalizedSerialNumber,
        grade: form.grade,
        cost: form.costPesos.replace(/[$,\s]/g, ""),
        costCurrency: (form.costCurrency || "MXN").toUpperCase(),
        costUsd: form.costUsd.replace(/[$,\s]/g, ""),
        costPesos: form.costPesos.replace(/[$,\s]/g, ""),
        price: form.price.replace(/[$,\s]/g, ""),
        price2: form.price2.replace(/[$,\s]/g, ""),
        price3: form.price3.replace(/[$,\s]/g, ""),
        batteryHealth: batteryHealthValidation.value,
      };
      
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanedForm),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload?.error === "string" ? payload.error : "Failed to save device");
      }

      const data = await response.json();
      
      if (data.isUpdate) {
        setStatus("✅ Device updated successfully.");
      } else {
        setStatus("✅ Device added to inventory.");
      }

      if (isTradeInPopup && typeof window !== "undefined" && window.opener && tradeInSaleId) {
        window.opener.postMessage(
          {
            type: "trade-in-inventory-saved",
            saleId: tradeInSaleId,
            imei: data.inventoryItem?.imei ?? data.inventoryItem?.serialNumber ?? data.inventoryItem?.sku ?? "",
          },
          window.location.origin
        );
        window.setTimeout(() => window.close(), 250);
      }

      // Reset form only if adding new device (not editing)
      if (!isEditMode) {
        setForm({ ...emptyForm, siteId: activeLocations.find((location) => location.name === "Main")?.id ?? activeLocations[0]?.id ?? "" });
        setScanData(null);
        setImeiDuplicate(false);
        setDuplicateIdentifierLabel("IMEI");
        setGenerateSkuWhenNoSerial(false);
      }
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Failed to save device.");
    } finally {
      setBusy(false);
    }
  };

  const handleRateTrackerSave = async () => {
    const normalized = normalizeRateInput(rateTrackerDraft);
    if (!normalized) {
      setStatus("Enter a valid USD to MXN rate.");
      return;
    }

    try {
      setBusy(true);
      const response = await fetch("/api/exchange-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usdToMxn: normalized }),
      });

      if (!response.ok) {
        throw new Error("Failed to save exchange rate");
      }

      setLatestUsdToPesosRate(normalized);
      setRateTrackerDraft("");
      setStatus(`USD to MXN rate set to ${normalized}.`);
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Failed to save exchange rate.");
    } finally {
      setBusy(false);
    }
  };

  const handleSupplierAdd = async () => {
    const nextName = supplierDraft.trim();
    if (!nextName) return;

    const existing = supplierRecords.find(
      (supplier) => supplier.name.toLowerCase() === nextName.toLowerCase()
    );

    setBusy(true);
    try {
      const response = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName, status: "Active" }),
      });

      if (!response.ok) {
        throw new Error("Failed to save supplier");
      }

      const data = await response.json();
      
      if (existing) {
        setSupplierRecords(supplierRecords.map((supplier) =>
          supplier.name.toLowerCase() === nextName.toLowerCase()
            ? { ...supplier, name: nextName, status: "Active" as const }
            : supplier
        ));
      } else {
        setSupplierRecords([
          ...supplierRecords,
          { ...data.supplier, createdAt: new Date().toISOString() },
        ]);
      }
      
      setSupplierDraft("");
      setStatus("Supplier list updated.");
    } catch (error: unknown) {
      setStatus(
        error instanceof Error
          ? `Failed to update suppliers: ${error.message}`
          : "Failed to update suppliers."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSupplierRemove = async (name: string) => {
    const supplier = supplierRecords.find((s) => s.name === name);
    if (!supplier?.id) return;

    setBusy(true);
    try {
      const response = await fetch("/api/suppliers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: supplier.id, status: "Inactive" }),
      });

      if (!response.ok) {
        throw new Error("Failed to remove supplier");
      }

      const nextRecords = supplierRecords.map((s) =>
        s.name === name ? { ...s, status: "Inactive" as const } : s
      );
      
      setSupplierRecords(nextRecords);
      
      const nextActiveSuppliers = nextRecords
        .filter((s) => s.status === "Active")
        .map((s) => s.name);

      if (form.supplier === name) {
        setForm((prev) => ({ ...prev, supplier: nextActiveSuppliers[0] ?? "" }));
      }
      setStatus("Supplier removed.");
    } catch (error: unknown) {
      setStatus(
        error instanceof Error
          ? `Failed to update suppliers: ${error.message}`
          : "Failed to update suppliers."
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setModelCatalog(loadModelCatalog());

    void (async () => {
      const remoteCatalog = await fetchModelCatalog();
      setModelCatalog(remoteCatalog);
    })();

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== MODEL_CATALOG_STORAGE_KEY) return;
      setModelCatalog(loadModelCatalog());
    };

    const handleModelCatalogUpdated = () => {
      setModelCatalog(loadModelCatalog());
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(MODEL_CATALOG_UPDATED_EVENT, handleModelCatalogUpdated);

    (async () => {
      try {
        const [suppliersRes, locationsRes, ratesRes, pricingRes, settingsRes] = await Promise.all([
          fetch("/api/suppliers"),
          fetch("/api/locations"),
          fetch("/api/exchange-rates"),
          fetch("/api/pricing-rules"),
          fetch("/api/org/settings"),
        ]);

        if (suppliersRes.ok) {
          const suppliersData = await suppliersRes.json();
          setSupplierRecords(suppliersData.suppliers || []);
        }

        if (locationsRes.ok) {
          const locationsData = await locationsRes.json();
          const fetchedLocations = locationsData.locations || [];
          setLocationRecords(fetchedLocations);
          if (!form.siteId && fetchedLocations.length > 0) {
            const defaultLocation = fetchedLocations.find((location: LocationRecord) => location.name === "Main") ?? fetchedLocations[0];
            setForm((prev) => ({ ...prev, siteId: defaultLocation?.id ?? "" }));
          }
        }

        if (ratesRes.ok) {
          const ratesData = await ratesRes.json();
          if (ratesData.latestRate) {
            setLatestUsdToPesosRate(ratesData.latestRate);
          }
        }

        if (pricingRes.ok) {
          const pricingData = await pricingRes.json();
          setModelPriceRules(pricingData.rules || []);
        }

        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          // USD conversion setting retired; cost is now manually entered with selected currency.
        }
      } catch (error: unknown) {
        console.error("Failed to fetch data:", error);
      }
    })();

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(MODEL_CATALOG_UPDATED_EVENT, handleModelCatalogUpdated);
    };
  }, []);

  useEffect(() => {
    fetchCarrierOptions()
      .then((options) => setCarrierOptions(options))
      .catch(() => setCarrierOptions([...defaultCarrierOptions]));
  }, []);

  useEffect(() => {
    fetchConditionOptions({})
      .then((options) => setConditionOptions(options))
      .catch(() => setConditionOptions([...defaultConditionOptions]));
  }, []);

  useEffect(() => {
    fetchGradeOptions({})
      .then((options) => setGradeOptions(options))
      .catch(() => setGradeOptions([...defaultGradeOptions]));
  }, []);

  useEffect(() => {
    fetch("/api/device-types")
      .then((res) => res.json())
      .then((data) => setDeviceTypeOptions(data.deviceTypes ?? []))
      .catch(() => setDeviceTypeOptions([]));
  }, []);

  useEffect(() => {
    if (!isTradeInPopup) return;

    setForm((prev) => {
      const nextCostPesos = Number.isFinite(Number(tradeInCostPesos)) && Number(tradeInCostPesos) > 0
        ? formatMoneyWhole(Number(tradeInCostPesos))
        : prev.costPesos;

      return {
        ...prev,
        supplier: tradeInSupplier || prev.supplier,
        comments: tradeInComments || prev.comments,
        costPesos: nextCostPesos,
        costCurrency: "MXN",
        status: "Available",
      };
    });
  }, [isTradeInPopup, tradeInComments, tradeInCostPesos, tradeInSupplier]);

  // Load device for editing when IMEI query parameter is present
  useEffect(() => {
    if (!isPrefillMode) return;

    const prefillImei = searchParams.get("imei")?.trim() ?? "";
    const prefillModel = searchParams.get("model")?.trim() ?? "";
    const prefillCapacity = searchParams.get("capacity")?.trim() ?? "";
    const prefillColor = searchParams.get("color")?.trim() ?? "";
    const prefillCarrier = searchParams.get("carrier")?.trim() ?? "";
    const prefillSerialNumber = searchParams.get("serialNumber")?.trim() ?? "";
    const prefillSku = searchParams.get("sku")?.trim() ?? "";
    const prefillComments = searchParams.get("comments")?.trim() ?? "";

    setForm((prev) => ({
      ...prev,
      imei: prefillImei || prev.imei,
      model: prefillModel || prev.model,
      capacity: prefillCapacity || prev.capacity,
      color: prefillColor || prev.color,
      carrier: prefillCarrier || prev.carrier,
      serialNumber: prefillSerialNumber || prev.serialNumber,
      sku: prefillSku || prev.sku,
      comments: prefillComments || prev.comments,
      status: "Available",
    }));

    if (prefillModel || prefillImei || prefillSerialNumber || prefillSku) {
      setStatus("Prefilled from IMEICHECK2 history. Review and save to inventory.");
    }
  }, [isPrefillMode, searchParams]);

  useEffect(() => {
    const imei = searchParams.get("imei");
    const id = searchParams.get("id");
    const sku = searchParams.get("sku");
    if ((!imei && !id && !sku) || isPrefillMode) return;

    (async () => {
      try {
        setBusy(true);
        const query = id
          ? `id=${encodeURIComponent(id)}`
          : imei
            ? `imei=${encodeURIComponent(imei)}`
            : `sku=${encodeURIComponent(sku!)}`;
        const response = await fetch(`/api/inventory/check-imei?${query}`);
        if (!response.ok) {
          throw new Error("Failed to fetch device");
        }
        const data = await response.json();
        if (data.exists && data.inventoryItem) {
          const item = data.inventoryItem;
          // Pre-fill the form with existing device data, using supplierName from API
          setForm({
            inventoryItemId: item.id || "",
            imei: item.imei || "",
            sku: item.sku || "",
            deviceTypeId: item.deviceTypeId || "",
            siteId: item.siteId || "",
            model: item.model || "",
            capacity: item.capacity || "",
            color: item.color || "",
            carrier: item.carrier || "",
            condition: item.condition || item.grade || "",
            grade: item.grade || "",
            comments: item.comments || "",
            supplier: data.supplierName || "",
            dateOfPurchase: item.dateOfPurchase ? new Date(item.dateOfPurchase).toISOString().split("T")[0] : "",
            costCurrency: item.costCurrency || "MXN",
            costUsd: item.costUsd?.toString() || "",
            usdToPesosRate: item.usdToPesosRate?.toString() || "",
            costPesos: item.costPesos ? formatMoneyWhole(Number(item.costPesos)) : "",
            price: item.price ? formatMoneyWhole(Number(item.price)) : "",
            price2: item.price2 ? formatMoneyWhole(Number(item.price2)) : "",
            price3: item.price3 ? formatMoneyWhole(Number(item.price3)) : "",
            status: item.status || "Available",
            batteryHealth: normalizeBatteryHealth(item.batteryHealth || "").value,
            cycleCount: item.cycleCount?.toString() || "",
            iosVersion: item.iosVersion || "",
            serialNumber: item.serialNumber || "",
            qrRaw: item.qrRaw || "",
          });
          setIsEditMode(true);
          setImeiDuplicate(false); // Not a duplicate, we're editing
          setDuplicateIdentifierLabel(item.imei ? "IMEI" : item.serialNumber ? "Serial Number" : "SKU");
          setGenerateSkuWhenNoSerial(!item.serialNumber && !!item.sku);
          setStatus(
            `Editing device: ${item.model}${item.imei ? ` (IMEI: ${item.imei})` : item.serialNumber ? ` (SN: ${item.serialNumber})` : item.sku ? ` (SKU: ${item.sku})` : ""}`
          );
        } else {
          setStatus(id ? `No device found with ID: ${id}` : imei ? `No device found with IMEI: ${imei}` : `No device found with SKU: ${sku}`);
        }
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : "Failed to load device.");
      } finally {
        setBusy(false);
      }
    })();
  }, [isPrefillMode, searchParams]);

  useEffect(() => {
    const duplicateCheck = getDuplicateCheckQuery(form.imei, form.serialNumber, form.sku, form.inventoryItemId);
    if (!duplicateCheck) {
      setImeiDuplicate(false);
      setDuplicateIdentifierLabel("IMEI");
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/inventory/check-imei?${duplicateCheck.query}`);
          if (!response.ok) {
            return;
          }
          const data = await response.json();
          if (!cancelled) {
            setImeiDuplicate(Boolean(data?.exists));
            setDuplicateIdentifierLabel(duplicateCheck.label);
          }
        } catch {
          if (!cancelled) {
            setImeiDuplicate(false);
            setDuplicateIdentifierLabel("IMEI");
          }
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [form.imei, form.serialNumber, form.sku, form.inventoryItemId]);

  useEffect(() => {
    if (!useUsdConversion) return; // manual mode: user types costPesos directly
    const cost = parseAmount(form.costUsd);
    const rate = parseAmount(form.usdToPesosRate || latestUsdToPesosRate);
    if (cost && rate) {
      const calculated = calculateCostPesos(form.costUsd, form.usdToPesosRate || latestUsdToPesosRate);
      if (calculated !== form.costPesos) {
        updateForm("costPesos", calculated);
      }
    } else if (form.costPesos) {
      updateForm("costPesos", "");
    }
  }, [form.costUsd, form.usdToPesosRate, latestUsdToPesosRate, useUsdConversion]);

  useEffect(() => {
    if (latestRuleForSelection) {
      const price = formatMoneyWhole(Number(latestRuleForSelection.price || 0));
      const price2 = formatMoneyWhole(Number(latestRuleForSelection.price2 || 0));
      const price3 = formatMoneyWhole(Number(latestRuleForSelection.price3 || 0));
      if (form.price !== price) {
        updateForm("price", price);
      }
      if (form.price2 !== price2) {
        updateForm("price2", price2);
      }
      if (form.price3 !== price3) {
        updateForm("price3", price3);
      }
    }
  }, [latestRuleForSelection]);

  const batteryHealthValidation = normalizeBatteryHealth(form.batteryHealth);
  const isSaveDisabled =
    busy ||
    !form.supplier.trim() ||
    !form.siteId ||
    (useUsdConversion ? !form.costUsd.trim() : !form.costPesos.trim()) ||
    Boolean(batteryHealthValidation.error);

  return (
    <div className="app-shell">
      <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 text-sm text-[#5c4332]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <CurrentOrgBadge />
            {useUsdConversion && (
              <span>
                <span className="font-semibold">Last USD→MXN:</span> {latestUsdToPesosRate || "-"}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {useUsdConversion && (
              <>
                <input
                  value={rateTrackerDraft}
                  onChange={(event) => setRateTrackerDraft(event.target.value)}
                  className="w-28 rounded-full border border-[#d6c1ad] bg-[#fffaf3] px-3 py-2 text-sm text-[#3b2a1e] outline-none focus:border-[#1f1a16]"
                  placeholder="USD→MXN"
                />
                <button
                  className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-medium text-[#3b2a1e] transition hover:border-[#1f1a16] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleRateTrackerSave}
                  disabled={busy}
                  type="button"
                >
                  Save Rate
                </button>
              </>
            )}
          </div>
        </div>
      </nav>
      <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-6 px-4 py-6 md:gap-8 md:px-6 md:py-10">
          <header className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm uppercase tracking-[0.35em] text-[#7a5d47]">Wholesale iPhone POS</p>
                <h1 className="text-3xl font-semibold text-[#1f1a16] sm:text-4xl md:text-5xl">{isEditMode ? "Edit Device" : isTradeInPopup ? "Add Trade-in Device" : "Add Device"}</h1>
              </div>
              {isEditMode && (
                <button
                  type="button"
                  onClick={() => {
                    setForm({ ...emptyForm, siteId: activeLocations.find((location) => location.name === "Main")?.id ?? activeLocations[0]?.id ?? "" });
                    setScanData(null);
                    setImeiDuplicate(false);
                    setDuplicateIdentifierLabel("IMEI");
                    setGenerateSkuWhenNoSerial(false);
                    setIsEditMode(false);
                    setStatus("Switched to Add Device mode.");
                  }}
                  className="rounded-full border border-[#d6c1ad] px-5 py-2 text-sm font-medium text-[#3b2a1e] transition hover:border-[#1f1a16]"
                >
                  + New Device
                </button>
              )}
            </div>
            <p className="text-sm text-[#6a4d3a]">
              {isTradeInPopup
                ? `Save the trade-in device for sale ${tradeInSaleId || ""}. Cost, supplier, and comments are prefilled from checkout.`
                : "Scan QR lines, capture costs and suppliers, and store inventory in the database with label printing ready."}
            </p>
          </header>

          <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-[#eddac7] bg-white p-4 shadow-[0_25px_60px_rgba(90,62,45,0.12)] md:p-6">
              <h2 className="text-2xl font-semibold">Inventory Details</h2>
              <p className="mt-1 text-sm text-[#6a4d3a]">
                Confirm the scan, then capture costs, supplier, and status.
              </p>

              <div className="inventory-form mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {/* Device Type FIRST */}
                <label className="grid gap-2 text-sm">
                  Device Type
                  <select
                    value={form.deviceTypeId}
                    onChange={(event) => {
                      const newTypeId = event.target.value;
                      // Keep selected model/capacity/color when switching device type.
                      // Users often pick the type after scanning or partial form entry.
                      setForm((prev) => ({
                        ...prev,
                        deviceTypeId: newTypeId,
                      }));
                    }}
                    className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                  >
                    <option value="">Select</option>
                    {deviceTypeOptions.map((dt) => (
                      <option key={dt.id} value={dt.id}>{dt.name}</option>
                    ))}
                  </select>
                </label>
                {/* IMEI / QR Scan SECOND */}
                <label className="grid gap-2 text-sm">
                  IMEI / QR Scan
                  <input
                    value={form.imei}
                    onChange={(event) => {
                      void handleImeiInputChange(event.target.value);
                    }}
                    onPaste={(event) => {
                      const pastedValue = event.clipboardData.getData("text");
                      if (!pastedValue) return;
                      event.preventDefault();
                      void handleImeiInputChange(pastedValue);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleImeiInputChange(event.currentTarget.value);
                      }
                    }}
                    className={`rounded-xl border bg-[#fffaf3] px-3 py-2 outline-none ${
                      imeiDuplicate
                        ? "border-[#c24d34] focus:border-[#c24d34]"
                        : "border-[#e6d6c6] focus:border-[#1f1a16]"
                    }`}
                    placeholder="Paste or scan IMEI / QR..."
                  />
                  {imeiDuplicate && (
                    <span className="text-xs text-[#c24d34]">
                      {duplicateIdentifierLabel} already exists in inventory, if you save changes, device will be UPDATED.
                    </span>
                  )}
                  {isEditMode && (
                    <span className="text-xs text-[#5e9f5e]">
                      ✓ Editing existing device
                    </span>
                  )}
                  {scanData?.raw ? (
                    <span className="text-xs text-[#5e9f5e]">✓ QR parsed</span>
                  ) : (
                    <span className="text-xs text-[#6a4d3a]">Manual identifier mode</span>
                  )}
                </label>
                <label className="grid gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span>Serial Number</span>
                    <label className="inline-flex items-center gap-2 text-xs text-[#6a4d3a]">
                      <input
                        type="checkbox"
                        checked={generateSkuWhenNoSerial}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setGenerateSkuWhenNoSerial(checked);
                          if (checked && !normalizeSerialNumberValue(form.serialNumber) && !normalizeSkuValue(form.sku)) {
                            updateForm("sku", generateGenericSku());
                          }
                          if (!checked) {
                            updateForm("sku", "");
                          }
                        }}
                      />
                      Generate generic SKU
                    </label>
                  </div>
                  <input
                    value={form.serialNumber}
                    onChange={(event) => updateForm("serialNumber", event.target.value)}
                    className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                  />
                </label>
                {(generateSkuWhenNoSerial || form.sku) && (
                  <label className="grid gap-2 text-sm">
                    SKU
                    <input
                      value={form.sku}
                      onChange={(event) => updateForm("sku", normalizeSkuValue(event.target.value))}
                      placeholder="Generated SKU"
                      className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                    />
                  </label>
                )}
                <label className="grid gap-2 text-sm">
                  Model
                  <select
                    value={form.model}
                    onChange={(event) => handleModelChange(event.target.value)}
                    className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                  >
                    <option value="">Select</option>
                    {form.model && !modelOptions.includes(form.model) && (
                      <option value={form.model}>{form.model}</option>
                    )}
                    {modelOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  Color
                  <select
                    value={form.color}
                    onChange={(event) => updateForm("color", event.target.value)}
                    className="max-w-[160px] rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                    disabled={!form.model}
                  >
                    <option value="">Select</option>
                    {form.color && !colorOptions.includes(form.color) && (
                      <option value={form.color}>{form.color}</option>
                    )}
                    {colorOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  Capacity
                  <select
                    value={form.capacity}
                    onChange={(event) => updateForm("capacity", event.target.value)}
                    className="max-w-[120px] rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                    disabled={!form.model}
                  >
                    <option value="">Select</option>
                    {form.capacity && !capacityOptions.includes(form.capacity) && (
                      <option value={form.capacity}>{form.capacity}</option>
                    )}
                    {capacityOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  Battery Health
                  <input
                    value={form.batteryHealth}
                    onChange={(event) => updateForm("batteryHealth", event.target.value)}
                    onBlur={() => {
                      const normalized = normalizeBatteryHealth(form.batteryHealth);
                      if (!normalized.error && normalized.value !== form.batteryHealth) {
                        updateForm("batteryHealth", normalized.value);
                      }
                    }}
                    placeholder="e.g. 85%"
                    className="max-w-[100px] rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                  />
                  {batteryHealthValidation.error && (
                    <span className="text-xs text-[#c24d34]">{batteryHealthValidation.error}</span>
                  )}
                </label>
                <label className="grid gap-2 text-sm">
                  Cycle Count
                  <input
                    value={form.cycleCount}
                    onChange={(event) => updateForm("cycleCount", event.target.value)}
                    placeholder="e.g. 234"
                    className="max-w-[100px] rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  iOS Version
                  <input
                    value={form.iosVersion}
                    onChange={(event) => updateForm("iosVersion", event.target.value)}
                    placeholder="e.g. 17.2"
                    className="max-w-[100px] rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  Date of Purchase
                  <input
                    type="date"
                    value={form.dateOfPurchase}
                    onChange={(event) => updateForm("dateOfPurchase", event.target.value)}
                    className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  Site
                  <select
                    value={form.siteId}
                    onChange={(event) => updateForm("siteId", event.target.value)}
                    className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                  >
                    {activeLocations.map((location) => (
                      <option key={location.id} value={location.id}>{location.name}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  Carrier
                  <select
                    value={form.carrier}
                    onChange={(event) => updateForm("carrier", event.target.value)}
                    className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                  >
                    <option value="">Select</option>
                    {form.carrier && !carrierOptions.includes(form.carrier) && (
                      <option value={form.carrier}>{form.carrier}</option>
                    )}
                    {carrierOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  Condition
                  <select
                    value={form.condition}
                    onChange={(event) => updateForm("condition", event.target.value)}
                    className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                  >
                    <option value="">Select</option>
                    {conditionOptions.map((option, index) => (
                      <option key={`${option}-${index}`}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  Grade
                  <select
                    value={form.grade}
                    onChange={(event) => updateForm("grade", event.target.value)}
                    className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                  >
                    <option value="">Select</option>
                    {gradeOptions.map((option, index) => (
                      <option key={`${option}-${index}`}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  Supplier
                  <select
                    ref={supplierSelectRef}
                    value={form.supplier}
                    onChange={(event) => updateForm("supplier", event.target.value)}
                    className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                  >
                    <option value="">Select</option>
                     {form.supplier && !suppliers.includes(form.supplier) && (
                       <option value={form.supplier}>{form.supplier}</option>
                     )}
                    {suppliers.map((supplier, index) => (
                      <option key={`${supplier}-${index}`}>{supplier}</option>
                    ))}
                  </select>
                </label>
                {useUsdConversion && (
                  <label className="grid gap-2 text-sm">
                    Cost USD
                    <input
                      ref={costInputRef}
                      value={form.costUsd}
                      onChange={(event) => updateForm("costUsd", event.target.value)}
                      onBlur={() => formatMoneyField("costUsd")}
                      className="max-w-[80px] rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                    />
                  </label>
                )}
                {useUsdConversion && (
                  <label className="grid gap-2 text-sm">
                    USD to Pesos rate
                    <input
                      value={form.usdToPesosRate}
                      onChange={(event) => updateForm("usdToPesosRate", event.target.value)}
                      onBlur={formatRateField}
                      maxLength={5}
                      className="max-w-[80px] rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                      placeholder={latestUsdToPesosRate || "e.g. 17.10"}
                    />
                  </label>
                )}
                <label className="grid gap-2 text-sm">
                  Cost
                  <input
                    value={form.costPesos}
                    readOnly={useUsdConversion}
                    onChange={useUsdConversion ? undefined : (e) => updateForm("costPesos", e.target.value)}
                    onBlur={useUsdConversion ? undefined : () => formatMoneyField("costPesos")}
                    className={`max-w-[80px] rounded-xl border border-[#e6d6c6] px-3 py-2 outline-none focus:border-[#1f1a16] ${useUsdConversion ? "bg-[#fffaf3]" : "bg-white"}`}
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  Currency
                  <select
                    value={form.costCurrency}
                    onChange={(event) => updateForm("costCurrency", event.target.value.toUpperCase())}
                    className="max-w-[120px] rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="CAD">CAD</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  Price
                  <input
                    value={form.price}
                    onChange={(event) => updateForm("price", event.target.value)}
                    onBlur={() => formatMoneyField("price")}
                    className="max-w-[80px] rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                  />
                  {lowMarginWarning && (
                    <span className="text-xs text-[#c24d34]">{lowMarginWarning}</span>
                  )}
                </label>
                <label className="grid gap-2 text-sm">
                  Price 2
                  <input
                    value={form.price2}
                    onChange={(event) => updateForm("price2", event.target.value)}
                    onBlur={() => formatMoneyField("price2")}
                    className="max-w-[80px] rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  Price 3
                  <input
                    value={form.price3}
                    onChange={(event) => updateForm("price3", event.target.value)}
                    onBlur={() => formatMoneyField("price3")}
                    className="max-w-[80px] rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  Status
                  <select
                    value={form.status}
                    onChange={(event) => updateForm("status", event.target.value)}
                    className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                  >
                    {!statusOptions.includes(form.status) && form.status && (
                      <option>{form.status}</option>
                    )}
                    {statusOptions.map((option, index) => (
                      <option key={`${option}-${index}`}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm sm:col-span-2">
                  Comments
                  <textarea
                    value={form.comments}
                    onChange={(event) => updateForm("comments", event.target.value)}
                    rows={3}
                    className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
                  />
                </label>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className="rounded-full bg-[#1f1a16] px-5 py-2 text-sm font-semibold text-white transition enabled:hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleSave}
                  disabled={isSaveDisabled}
                  type="button"
                >
                  {isEditMode ? "Update Device" : isTradeInPopup ? "Save Trade-in to Inventory" : "Save to Inventory"}
                </button>
              </div>
            </div>
          </div>

            <div className="flex flex-col gap-6">
              <div className="rounded-3xl border border-[#eddac7] bg-[rgba(255,250,243,0.95)] p-4 shadow-[0_25px_60px_rgba(90,62,45,0.1)] md:p-6">
                <h2 className="text-2xl font-semibold">Label Preview</h2>
                <p className="mt-1 text-sm text-[#6a4d3a]">
                  Preview uses the saved Label Designer template. Edit layout only in Label Designer.
                </p>
                <div className="label-preview-print mt-4 flex min-h-[260px] flex-col items-center justify-center">
                  <div
                    className="overflow-hidden"
                    style={{
                      width: Math.round(labelPreviewMeta.width * screenPreviewScale),
                      height: Math.round(labelPreviewMeta.height * screenPreviewScale),
                    }}
                  >
                    <div
                      style={{
                        width: labelPreviewMeta.width,
                        height: labelPreviewMeta.height,
                        transform: `scale(${screenPreviewScale})`,
                        transformOrigin: "top left",
                      }}
                    >
                      <LabelPreview
                        {...labelData}
                        onRendered={handleLabelRendered}
                      />
                    </div>
                  </div>
                  <button
                    className="mt-4 rounded-full border border-[#d6c1ad] px-5 py-2 text-sm font-medium text-[#3b2a1e] transition hover:bg-[#f5e4d5]"
                    onClick={() => {
                      const printSrc = renderedLabelForPrint.dataUrl;
                      if (printSrc) {
                        const wIn = renderedLabelForPrint.width / 96;
                        const hIn = renderedLabelForPrint.height / 96;
                        const printWindow = window.open("", "_blank");
                        if (printWindow) {
                          printWindow.document.write(
                            `<!DOCTYPE html><html><head><title>Print Label</title><style>` +
                            `* { margin: 0; padding: 0; box-sizing: border-box; }` +
                            `html, body { width: ${wIn}in; height: ${hIn}in; overflow: hidden; background: #fff; }` +
                            `@page { size: ${wIn}in ${hIn}in; margin: 0; }` +
                            `img { display: block; width: ${wIn}in; height: ${hIn}in; }` +
                            `</style></head><body><img src="${printSrc}"></body></html>`
                          );
                          printWindow.document.close();
                          printWindow.focus();
                          setTimeout(() => printWindow.print(), 300);
                        }
                      }
                    }}
                    title="Print the label (select your printer in the dialog)"
                    type="button"
                  >
                    🖨️ Print Label
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-[#eddac7] bg-white p-4 shadow-[0_25px_60px_rgba(90,62,45,0.1)] md:p-6">
                <h2 className="text-2xl font-semibold">Supplier Admin</h2>
                <p className="mt-1 text-sm text-[#6a4d3a]">
                  Add or remove suppliers in the dropdown list.
                </p>
                <div className="mt-4 flex gap-2">
                  <input
                    value={supplierDraft}
                    onChange={(event) => setSupplierDraft(event.target.value)}
                    className="flex-1 rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 text-sm outline-none focus:border-[#1f1a16]"
                    placeholder="New supplier name"
                  />
                  <button
                    className="rounded-full bg-[#ff6b4a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#e2573a]"
                    onClick={handleSupplierAdd}
                    disabled={busy}
                    type="button"
                  >
                    Add
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {suppliers.map((supplier, index) => (
                    <div
                      key={`${supplier}-${index}`}
                      className="flex items-center gap-2 rounded-full border border-[#e6d6c6] bg-[#fffaf3] px-3 py-1 text-sm"
                    >
                      {supplier}
                      <button
                        type="button"
                        onClick={() => handleSupplierRemove(supplier)}
                        className="text-xs font-semibold text-[#c24d34]"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {suppliers.length === 0 && (
                    <span className="text-sm text-[#6a4d3a]">No suppliers loaded yet.</span>
                  )}
                </div>
              </div>

              {status && (
                <div className="rounded-2xl border border-[#e6d6c6] bg-[#fff6ea] px-4 py-3 text-sm text-[#5c4332]">
                  {status}
                </div>
              )}
            </div>
          </section>
        </main>
      </div>

      {/* No global print-only label preview, only print from dedicated container */}
    </div>
  );
}

export default function AddDevicePage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="p-6 text-sm">Loading...</div>}>
        <AddDevicePageContent />
      </Suspense>
    </ErrorBoundary>
  );
}

