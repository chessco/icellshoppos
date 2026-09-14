import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { TitleBar } from "@renderer/components/TitleBar";
import { LabelEditor } from "@renderer/components/LabelEditor";
import { DesktopDashboard } from "@renderer/components/DesktopDashboard";
import { DesktopInventoryList } from "@renderer/components/DesktopInventoryList";
import { DesktopCheckout } from "@renderer/components/DesktopCheckout";
import { DesktopSalesHistory } from "@renderer/components/DesktopSalesHistory";
import { DesktopCredit } from "@renderer/components/DesktopCredit";
import { DesktopPublicInventory } from "@renderer/components/DesktopPublicInventory";
import { DesktopProfile } from "@renderer/components/DesktopProfile";
import { DesktopDataAdmin } from "@renderer/components/DesktopDataAdmin";
import QRCode from "qrcode";

type LoginForm = {
  baseUrl: string;
  email: string;
  password: string;
};

type IntakeForm = {
  deviceTypeId: string;
  imei: string;
  serialNumber: string;
  model: string;
  capacity: string;
  color: string;
  batteryHealth: string;
  cycleCount: string;
  iosVersion: string;
  dateOfPurchase: string;
  siteId: string;
  locationSiteId: string;
  carrier: string;
  condition: string;
  grade: string;
  supplier: string;
  cost: string;
  currency: string;
  price: string;
  price2: string;
  price3: string;
  status: string;
  comments: string;
};

type IntakeFieldKey = keyof IntakeForm;
type DesktopView = "dashboard" | "inventory" | "intake" | "edit-device" | "checkout" | "sales-history" | "credit" | "public-inventory" | "data-admin" | "profile" | "labels" | "placeholder";
type DesktopNavItem = {
  id: string;
  label: string;
  view: DesktopView;
};

const DEFAULT_BASE_URL = "https://www.probuyer.org";
const DEFAULT_STATUS_OPTIONS = ["Available", "Sold", "Reserved", "Damaged"];
const DEFAULT_CURRENCY_OPTIONS = ["MXN", "USD"];
const DESKTOP_NAV_ITEMS: DesktopNavItem[] = [
  { id: "dashboard", label: "Dashboard", view: "dashboard" },
  { id: "inventory", label: "Inventory", view: "inventory" },
  { id: "add-device", label: "Add Device", view: "intake" },
  { id: "label-designer", label: "Label Designer", view: "labels" },
  { id: "checkout", label: "Checkout", view: "checkout" },
  { id: "sales-history", label: "Sales History", view: "sales-history" },
  { id: "credit", label: "Credit", view: "credit" },
  { id: "register-audit", label: "Register Audit", view: "placeholder" },
  { id: "repairs", label: "Repairs", view: "placeholder" },
  { id: "inventory-requests", label: "Inventory Requests", view: "placeholder" },
  { id: "purchase-orders", label: "Purchase Orders", view: "placeholder" },
  { id: "data-admin", label: "Data Admin", view: "data-admin" },
  { id: "profile", label: "Profile", view: "profile" },
  { id: "public-inventory", label: "Public Inventory", view: "public-inventory" },
];

const DEVICE_PREFILL_FIELDS: IntakeFieldKey[] = [
  "deviceTypeId",
  "imei",
  "serialNumber",
  "model",
  "capacity",
  "color",
  "batteryHealth",
  "cycleCount",
  "iosVersion",
  "carrier",
  "price",
  "price2",
  "price3",
];

const normalizeCapacityValue = (value: string) => {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return "";

  const compact = trimmed.replace(/\s+/g, "");
  const parsed = compact.match(/^(\d+(?:\.\d+)?)(GB|TB)$/);
  if (parsed) {
    return `${parsed[1]}${parsed[2]}`;
  }

  const digitsAndUnit = trimmed.match(/(\d+(?:\.\d+)?)\s*(GB|TB)/);
  if (digitsAndUnit) {
    return `${digitsAndUnit[1]}${digitsAndUnit[2]}`;
  }

  const numericOnly = compact.match(/^(\d+(?:\.\d+)?)$/);
  if (numericOnly) {
    return `${numericOnly[1]}GB`;
  }

  return compact;
};

const normalizeModelValue = (value: string) => value.trim().toLowerCase();

const normalizeModelKey = (value: string) =>
  normalizeModelValue(value).replace(/[^a-z0-9]/g, "");

const getMoneyDigits = (value: string) => String(value ?? "").replace(/\D/g, "");

const formatMoneyDisplay = (value: string) => {
  const digits = getMoneyDigits(value);
  if (!digits) return "";
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return "";
  return `$${parsed.toLocaleString("en-US")}`;
};

const normalizeMoneyForSubmit = (value: string) => {
  const digits = getMoneyDigits(value);
  if (!digits) return "0";
  return String(Number(digits));
};

const isZeroMoney = (value: string) => {
  const digits = getMoneyDigits(value);
  if (!digits) return true;
  return Number(digits) === 0;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const replaceLabelPlaceholders = (input: string, values: Record<string, string>) =>
  input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");

const todayIsoDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function App() {
  if (!window.desktop) {
    return (
      <div className="app-shell">
        <main className="workspace" style={{ gridTemplateColumns: "1fr" }}>
          <section className="card">
            <h1>Desktop bridge not available</h1>
            <p>
              The preload bridge failed to load. Restart the desktop app after rebuilding.
            </p>
          </section>
        </main>
      </div>
    );
  }

  const [form, setForm] = useState<LoginForm>({
    baseUrl: DEFAULT_BASE_URL,
    email: "",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready.");
  const [session, setSession] = useState<DesktopSessionResponse | null>(null);
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationCooldownSeconds, setVerificationCooldownSeconds] = useState(0);
  const [intake, setIntake] = useState<IntakeForm>({
    deviceTypeId: "",
    imei: "",
    serialNumber: "",
    model: "",
    capacity: "",
    color: "",
    batteryHealth: "",
    cycleCount: "",
    iosVersion: "",
    dateOfPurchase: todayIsoDate(),
    siteId: "",
    locationSiteId: "",
    carrier: "",
    condition: "",
    grade: "",
    supplier: "",
    cost: "",
    currency: "MXN",
    price: "",
    price2: "",
    price3: "",
    status: "Available",
    comments: "",
  });
  const [dropdowns, setDropdowns] = useState<DesktopInventoryOptions>({
    deviceTypes: [],
    sites: [],
    suppliers: [],
    carriers: [],
    conditions: [],
    grades: [],
    statuses: DEFAULT_STATUS_OPTIONS,
    currencies: DEFAULT_CURRENCY_OPTIONS,
    modelCatalog: {},
    pricingRules: [],
  });
  const [duplicateInfo, setDuplicateInfo] = useState<string>("");
  const [activePage, setActivePage] = useState<DesktopView>("inventory");
  const [activeNavId, setActiveNavId] = useState<string>("inventory");
  const [placeholderTitle, setPlaceholderTitle] = useState<string>("Dashboard");
  const [editingDevice, setEditingDevice] = useState<DesktopInventoryListItem | null>(null);
  const [usbStatus, setUsbStatus] = useState<AppleAdapterStatus | null>(null);
  const lastAutofillKeyRef = useRef<string>("");
  const [autoFilledFields, setAutoFilledFields] = useState<Partial<Record<IntakeFieldKey, "usb" | "derived">>>({});

  const activeOrganizationName = useMemo(() => {
    const activeOrgId = session?.session?.activeOrganizationId;
    if (!activeOrgId) return "No organization";
    const org = session?.organizations?.find((entry) => entry.id === activeOrgId);
    return org?.name ?? "Organization";
  }, [session]);

  const activeNavLabel = useMemo(() => {
    return DESKTOP_NAV_ITEMS.find((item) => item.id === activeNavId)?.label ?? "Inventory";
  }, [activeNavId]);

  const activePageTitle = useMemo(() => {
    if (activePage === "edit-device") return "Edit Device";
    return activeNavLabel;
  }, [activeNavLabel, activePage]);

  const selectedModelEntry = useMemo(() => {
    if (!intake.model) return null;
    return dropdowns.modelCatalog[intake.model] ?? null;
  }, [dropdowns.modelCatalog, intake.model]);

  const modelOptions = useMemo(() => {
    const allModels = Object.entries(dropdowns.modelCatalog);
    if (!intake.deviceTypeId) {
      return allModels.map(([model]) => model);
    }

    return allModels
      .filter(([, entry]) => !entry.deviceTypeId || entry.deviceTypeId === intake.deviceTypeId)
      .map(([model]) => model);
  }, [dropdowns.modelCatalog, intake.deviceTypeId]);

  const hasPrefilledFields = useMemo(
    () => Object.keys(autoFilledFields).length > 0,
    [autoFilledFields]
  );

  const isAddDevicePage = activePage === "intake";
  const isEditDevicePage = activePage === "edit-device";

  const isDeviceDisconnected = useMemo(() => {
    if (!usbStatus) return false;
    if (usbStatus.connectionState === "disconnected") return true;
    return usbStatus.devices.length === 0;
  }, [usbStatus]);

  const requiredIntakeChecks = useMemo(() => {
    const siteId = intake.siteId || intake.locationSiteId;
    return [
      { label: "Device type", value: intake.deviceTypeId },
      { label: "IMEI", value: intake.imei },
      { label: "Serial number", value: intake.serialNumber },
      { label: "Model", value: intake.model },
      { label: "Color", value: intake.color },
      { label: "Capacity", value: intake.capacity },
      { label: "Battery health", value: intake.batteryHealth },
      { label: "Cycle count", value: intake.cycleCount },
      { label: "iOS version", value: intake.iosVersion },
      { label: "Date of purchase", value: intake.dateOfPurchase },
      { label: "Site", value: siteId },
      { label: "Carrier", value: intake.carrier },
      { label: "Location", value: intake.locationSiteId },
      { label: "Condition", value: intake.condition },
      { label: "Grade", value: intake.grade },
      { label: "Supplier", value: intake.supplier },
      { label: "Cost", value: intake.cost },
      { label: "Currency", value: intake.currency },
      { label: "Price", value: intake.price },
      { label: "Price 2", value: intake.price2 },
      { label: "Price 3", value: intake.price3 },
      { label: "Status", value: intake.status },
    ];
  }, [intake]);

  const firstMissingRequiredField = useMemo(
    () => requiredIntakeChecks.find((entry) => !entry.value.trim())?.label ?? "",
    [requiredIntakeChecks]
  );

  const requiredFieldSet = useMemo(
    () => new Set(requiredIntakeChecks.map((entry) => entry.label.toLowerCase())),
    [requiredIntakeChecks]
  );

  const fieldLabelMap: Record<IntakeFieldKey, string> = {
    deviceTypeId: "Device type",
    imei: "IMEI",
    serialNumber: "Serial number",
    model: "Model",
    capacity: "Capacity",
    color: "Color",
    batteryHealth: "Battery health",
    cycleCount: "Cycle count",
    iosVersion: "iOS version",
    dateOfPurchase: "Date of purchase",
    siteId: "Site",
    locationSiteId: "Location",
    carrier: "Carrier",
    condition: "Condition",
    grade: "Grade",
    supplier: "Supplier",
    cost: "Cost",
    currency: "Currency",
    price: "Price",
    price2: "Price 2",
    price3: "Price 3",
    status: "Status",
    comments: "Comments",
  };

  const isFieldPending = (field: IntakeFieldKey) => {
    const label = fieldLabelMap[field].toLowerCase();
    if (!requiredFieldSet.has(label)) return false;
    return !String(intake[field] ?? "").trim();
  };

  const fieldClassName = (field: IntakeFieldKey) => {
    const classes = ["intake-field"];
    if (isFieldPending(field)) classes.push("pending-field");
    if (autoFilledFields[field]) classes.push("autofilled-field");
    return classes.join(" ");
  };

  const markFieldAsManual = (field: IntakeFieldKey) => {
    setAutoFilledFields((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const findPhoneDeviceTypeId = (deviceTypes: DesktopNamedOption[]) => {
    const direct = deviceTypes.find((type) => type.name.trim().toLowerCase() === "phone");
    if (direct) return direct.id;
    const fallback = deviceTypes.find((type) => type.name.trim().toLowerCase().includes("phone"));
    return fallback?.id ?? "";
  };

  const clearPrefilledData = () => {
    const fieldsToClear = Object.keys(autoFilledFields) as IntakeFieldKey[];
    if (fieldsToClear.length === 0) {
      setStatus("No prefilled fields to clear.");
      return;
    }

    setIntake((prev) => {
      const next = { ...prev };
      for (const field of fieldsToClear) {
        if (field === "dateOfPurchase") {
          next[field] = todayIsoDate();
        } else {
          next[field] = "";
        }
      }
      return next;
    });

    setAutoFilledFields({});
    setStatus("Cleared prefilled data from disconnected device.");
  };

  const handleRefreshFromConnectedDevice = async () => {
    clearPrefilledData();
    try {
      const next = await window.desktop.usb.status();
      setUsbStatus(next);
      const firstDevice = next.devices[0];
      if (!firstDevice) {
        setStatus("No connected device found to refresh data.");
        return;
      }
      applyDeviceToIntake(firstDevice, "manual");
      setStatus(`Refreshed from connected device ${firstDevice.udid.slice(0, 12)}...`);
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Failed to refresh from connected device.");
    }
  };

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const nextSession = await window.desktop.auth.me({ baseUrl: form.baseUrl.trim() });
        if (cancelled) return;
        setSession(nextSession);
        if (nextSession.session?.email) {
          setForm((prev) => ({ ...prev, email: nextSession.session?.email ?? prev.email }));
        }
        setStatus("Session restored.");
      } catch {
        if (!cancelled) setStatus("Sign in from the profile section to sync intake.");
      }
    };

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, [form.baseUrl]);

  const applyDeviceToIntake = (device: AppleUsbDevice, mode: "auto" | "manual" = "auto") => {
    if (!isAddDevicePage) return;

    const hasSpecificModel = Boolean(
      device.modelName &&
      device.modelName.trim().length > 0 &&
      device.modelName !== "Apple iPhone" &&
      device.modelName !== "Apple Device"
    );

    const normalizedDeviceName = `${device.modelName ?? ""} ${device.productType ?? ""}`.toLowerCase();
    const looksLikeIphone = normalizedDeviceName.includes("iphone");
    const phoneDeviceTypeId = looksLikeIphone ? findPhoneDeviceTypeId(dropdowns.deviceTypes) : "";

    if (device.carrier?.trim()) {
      const usbCarrier = device.carrier.trim();
      setDropdowns((prev) => {
        const exists = prev.carriers.some((carrier) => carrier.toLowerCase() === usbCarrier.toLowerCase());
        if (exists) return prev;
        return { ...prev, carriers: [...prev.carriers, usbCarrier] };
      });
    }

    setIntake((prev) => ({
      ...prev,
      deviceTypeId: prev.deviceTypeId || phoneDeviceTypeId || prev.deviceTypeId,
      imei: device.imei || prev.imei,
      serialNumber: device.serialNumber || prev.serialNumber,
      model: hasSpecificModel ? (device.modelName as string) : prev.model,
      capacity: device.totalCapacity || prev.capacity,
      color: device.color || prev.color,
      batteryHealth: device.batteryHealth || prev.batteryHealth,
      cycleCount: device.cycleCount || prev.cycleCount,
      iosVersion: device.iosVersion || prev.iosVersion,
      carrier: device.carrier || prev.carrier,
    }));

    setAutoFilledFields((prev) => ({
      ...prev,
      ...(phoneDeviceTypeId ? { deviceTypeId: "derived" as const } : {}),
      ...(device.imei ? { imei: "usb" as const } : {}),
      ...(device.serialNumber ? { serialNumber: "usb" as const } : {}),
      ...(hasSpecificModel ? { model: "usb" as const } : {}),
      ...(device.totalCapacity ? { capacity: "usb" as const } : {}),
      ...(device.color ? { color: "usb" as const } : {}),
      ...(device.batteryHealth ? { batteryHealth: "usb" as const } : {}),
      ...(device.cycleCount ? { cycleCount: "usb" as const } : {}),
      ...(device.iosVersion ? { iosVersion: "usb" as const } : {}),
      ...(device.carrier ? { carrier: "usb" as const } : {}),
    }));

    const verb = mode === "auto" ? "Auto-filled" : "Autofilled";
    if (device.source === "id-only") {
      setStatus(`${verb} limited fields from ${device.udid.slice(0, 12)}...`);
    } else {
      setStatus(`${verb} from connected device ${device.udid.slice(0, 12)}...`);
    }
  };

  useEffect(() => {
    if (!session || !isAddDevicePage) {
      setUsbStatus(null);
      lastAutofillKeyRef.current = "";
      return;
    }

    let cancelled = false;
    const pullStatus = async () => {
      try {
        const next = await window.desktop.usb.status();
        if (!cancelled) {
          setUsbStatus(next);
          const firstDevice = next.devices[0];
          if (firstDevice) {
            const autofillKey = [
              firstDevice.udid,
              firstDevice.imei ?? "",
              firstDevice.serialNumber ?? "",
              firstDevice.iosVersion ?? "",
              firstDevice.batteryHealth ?? "",
              firstDevice.carrier ?? "",
              firstDevice.color ?? "",
            ].join("|");
            if (autofillKey !== lastAutofillKeyRef.current) {
              applyDeviceToIntake(firstDevice, "auto");
              lastAutofillKeyRef.current = autofillKey;
            }
          }
        }
      } catch {
        if (!cancelled) {
          setUsbStatus({
            provider: "apple-mobiledevice",
            pipelineVersion: "v1",
            available: false,
            connectionState: "stale_or_error",
            message: "Failed to read USB adapter status.",
            lastCheckedAt: new Date().toISOString(),
            pythonProbePresent: false,
            toolchainPresent: false,
            appleMdsInstalled: false,
            devices: [],
            diagnostics: [],
          });
        }
      }
    };

    void pullStatus();
    const interval = window.setInterval(() => {
      void pullStatus();
    }, 3500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isAddDevicePage, session]);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    const pullOptions = async () => {
      try {
        const options = await window.desktop.inventory.options({ baseUrl: form.baseUrl.trim() });
        if (cancelled) return;

        const nextOptions: DesktopInventoryOptions = {
          ...options,
          statuses: options.statuses?.length ? options.statuses : DEFAULT_STATUS_OPTIONS,
          currencies: options.currencies?.length ? options.currencies : DEFAULT_CURRENCY_OPTIONS,
        };
        setDropdowns((prev) => {
          const mergedCarriers = Array.from(new Set([...nextOptions.carriers, ...prev.carriers]));
          return {
            ...nextOptions,
            carriers: mergedCarriers,
          };
        });

        setIntake((prev) => {
          const mainSite = nextOptions.sites.find((site) => site.name.toLowerCase() === "main") ?? nextOptions.sites[0];
          const defaultSiteId = prev.siteId || mainSite?.id || "";
          const defaultLocationId = prev.locationSiteId || mainSite?.id || "";
          const mergedCarriers = Array.from(new Set([...(nextOptions.carriers ?? []), prev.carrier].filter(Boolean)));

          const resolvedCarrier = prev.carrier
            ? prev.carrier
            : mergedCarriers[0] || "";

          return {
            ...prev,
            siteId: defaultSiteId,
            locationSiteId: defaultLocationId,
            carrier: resolvedCarrier,
            status: prev.status || nextOptions.statuses[0] || "Available",
            currency: prev.currency || nextOptions.currencies[0] || "MXN",
          };
        });
      } catch {
        if (!cancelled) {
          setStatus("Signed in, but failed to load dropdown options from org settings.");
        }
      }
    };

    void pullOptions();
    return () => {
      cancelled = true;
    };
  }, [form.baseUrl, session]);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    const pullPricingRules = async () => {
      try {
        const payload = await window.desktop.inventory.pricingRules({ baseUrl: form.baseUrl.trim() });
        if (cancelled) return;
        setDropdowns((prev) => ({
          ...prev,
          pricingRules: payload.pricingRules,
        }));
      } catch {
        // Keep previous pricing rules; combined options endpoint may still have data.
      }
    };

    void pullPricingRules();
    return () => {
      cancelled = true;
    };
  }, [form.baseUrl, session]);

  useEffect(() => {
    if (!isAddDevicePage) return;
    if (!intake.model) return;
    const entry = dropdowns.modelCatalog[intake.model];
    if (!entry) return;

    setIntake((prev) => {
      const next = { ...prev };
      let changed = false;

      const normalizedCurrentCapacity = normalizeCapacityValue(next.capacity);
      const matchedCapacity = entry.capacities.find(
        (capacityOption) => normalizeCapacityValue(capacityOption) === normalizedCurrentCapacity
      );

      if (matchedCapacity && next.capacity !== matchedCapacity) {
        next.capacity = matchedCapacity;
        changed = true;
      }

      if (!next.capacity && entry.capacities.length > 0) {
        next.capacity = entry.capacities[0];
        changed = true;
      }

      if (!next.color && entry.colors.length > 0) {
        next.color = entry.colors[0];
        changed = true;
      }

      if (!changed) return prev;
      return next;
    });

    setAutoFilledFields((prev) => ({
      ...prev,
      ...(intake.capacity ? {} : { capacity: "derived" as const }),
      ...(intake.color ? {} : { color: "derived" as const }),
    }));
  }, [dropdowns.modelCatalog, intake.capacity, intake.color, intake.model, isAddDevicePage]);

  useEffect(() => {
    if (!isAddDevicePage) return;
    if (!dropdowns.carriers.length || intake.carrier) return;
    setIntake((prev) => ({ ...prev, carrier: dropdowns.carriers[0] }));
    setAutoFilledFields((prev) => ({ ...prev, carrier: "derived" }));
  }, [dropdowns.carriers, intake.carrier, isAddDevicePage]);

  useEffect(() => {
    if (!isAddDevicePage) return;
    if (!dropdowns.deviceTypes.length || intake.deviceTypeId || !intake.model) return;
    const normalizedModel = intake.model.trim().toLowerCase();
    if (!normalizedModel.includes("iphone")) return;
    const phoneTypeId = findPhoneDeviceTypeId(dropdowns.deviceTypes);
    if (!phoneTypeId) return;
    setIntake((prev) => ({ ...prev, deviceTypeId: phoneTypeId }));
    setAutoFilledFields((prev) => ({ ...prev, deviceTypeId: "derived" }));
  }, [dropdowns.deviceTypes, intake.deviceTypeId, intake.model, isAddDevicePage]);

  useEffect(() => {
    if (!isAddDevicePage) return;
    if (!intake.model || dropdowns.pricingRules.length === 0) return;

    const normalizedModel = normalizeModelValue(intake.model);
    const normalizedModelKey = normalizeModelKey(intake.model);
    const normalizedCapacity = normalizeCapacityValue(intake.capacity);

    const scoredRules = dropdowns.pricingRules
      .map((entry) => {
        const ruleModel = normalizeModelValue(entry.model);
        const ruleModelKey = normalizeModelKey(entry.model);
        const ruleCapacity = normalizeCapacityValue(entry.capacity);

        let score = 0;
        if (ruleModel === normalizedModel) score += 4;
        else if (ruleModelKey === normalizedModelKey) score += 3;
        else if (normalizedModel.includes(ruleModel) || ruleModel.includes(normalizedModel)) score += 2;

        if (normalizedCapacity && ruleCapacity === normalizedCapacity) score += 3;

        return { entry, score, ruleCapacity };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);

    const rule = scoredRules[0]?.entry;
    if (!rule) return;

    setIntake((prev) => {
      const next = { ...prev };
      let changed = false;

      const canOverwrite = (field: "price" | "price2" | "price3") => {
        const currentValue = String(prev[field] ?? "").trim();
        if (!currentValue || isZeroMoney(currentValue)) return true;
        return Boolean(autoFilledFields[field]);
      };

      if (!next.capacity && rule.capacity) {
        next.capacity = rule.capacity;
        changed = true;
      }

      const formattedRulePrice = formatMoneyDisplay(rule.price);
      if (formattedRulePrice && canOverwrite("price") && next.price !== formattedRulePrice) {
        next.price = formattedRulePrice;
        changed = true;
      }

      const nextPrice2 = formatMoneyDisplay(rule.price2 || rule.price);
      const nextPrice3 = formatMoneyDisplay(rule.price3 || rule.price);

      if (nextPrice2 && canOverwrite("price2") && next.price2 !== nextPrice2) {
        next.price2 = nextPrice2;
        changed = true;
      }

      if (nextPrice3 && canOverwrite("price3") && next.price3 !== nextPrice3) {
        next.price3 = nextPrice3;
        changed = true;
      }

      if (!changed) return prev;
      return next;
    });

    setAutoFilledFields((prev) => ({
      ...prev,
      ...(rule.capacity ? { capacity: "derived" as const } : {}),
      ...(rule.price ? { price: "derived" as const } : {}),
      ...((rule.price2 || rule.price) ? { price2: "derived" as const } : {}),
      ...((rule.price3 || rule.price) ? { price3: "derived" as const } : {}),
    }));
  }, [autoFilledFields, dropdowns.pricingRules, intake.capacity, intake.model, intake.price, intake.price2, intake.price3, isAddDevicePage]);

  useEffect(() => {
    if (!isAddDevicePage) return;
    if (!session || !isDeviceDisconnected) return;
    setAutoFilledFields((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next: Partial<Record<IntakeFieldKey, "usb" | "derived">> = { ...prev };
      for (const field of DEVICE_PREFILL_FIELDS) {
        if (next[field] === "usb") {
          next[field] = "derived";
        }
      }
      return next;
    });
  }, [isAddDevicePage, isDeviceDisconnected, session]);

  const handleLogin = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setBusy(true);
    setStatus(requiresVerification ? "Verifying 2FA code..." : "Signing in...");
    try {
      const response = await window.desktop.auth.login({
        baseUrl: form.baseUrl.trim(),
        email: form.email.trim(),
        password: form.password,
        verificationCode: requiresVerification ? verificationCode : undefined,
      });

      if ((response as { requiresVerification?: boolean })?.requiresVerification) {
        setRequiresVerification(true);
        setVerificationCode("");
        const cooldown = (response as { cooldownSeconds?: number })?.cooldownSeconds;
        if (typeof cooldown === "number") {
          setVerificationCooldownSeconds(cooldown);
        }
        setStatus(
          (response as { message?: string })?.message ||
            "2FA code sent to your email. Enter the 6-digit code to continue."
        );
        return;
      }

      setRequiresVerification(false);
      setVerificationCode("");
      setSession(response as DesktopSessionResponse);
      setStatus("Signed in. Desktop session is ready.");
      await window.desktop.notify("iReader by Pro Buyer", "Signed in successfully.");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Login failed.";
      setStatus(message);
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await window.desktop.auth.logout();
      setSession(null);
      setStatus("Signed out locally.");
    } finally {
      setBusy(false);
    }
  };

  const handleCheckDuplicate = async () => {
    const normalizedImei = intake.imei.trim();
    const normalizedSerialNumber = intake.serialNumber.trim();

    const duplicateChecks: Array<{ field: "imei" | "serialNumber"; value: string }> = [];
    if (normalizedImei) {
      duplicateChecks.push({ field: "imei", value: normalizedImei });
    }
    if (normalizedSerialNumber) {
      duplicateChecks.push({ field: "serialNumber", value: normalizedSerialNumber });
    }

    if (duplicateChecks.length === 0) {
      setDuplicateInfo("Enter IMEI and/or Serial number to check duplicates.");
      setStatus("Nothing to check yet.");
      return;
    }

    setBusy(true);
    setStatus("Checking inventory duplicates...");
    setDuplicateInfo("");

    try {
      const duplicateFields: string[] = [];
      for (const check of duplicateChecks) {
        const result = await window.desktop.inventory.check({
          baseUrl: form.baseUrl.trim(),
          imei: check.field === "imei" ? check.value : "",
          serialNumber: check.field === "serialNumber" ? check.value : "",
          sku: "",
          excludeId: editingDevice?.id,
        });

        if (result?.exists) {
          duplicateFields.push(check.field === "imei" ? `IMEI (${check.value})` : `Serial number (${check.value})`);
        }
      }

      if (duplicateFields.length > 0) {
        const details = duplicateFields.join(" and ");
        setDuplicateInfo(`Duplicate found: ${details} already exists.`);
        setStatus("Duplicate found. Use unique IMEI and Serial number before saving.");
        return;
      }

      setDuplicateInfo("No duplicate found. Ready to add.");
      setStatus("No duplicate found.");
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Duplicate check failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleAddToInventory = async () => {
    const siteId = intake.siteId || intake.locationSiteId;
    if (firstMissingRequiredField) {
      setStatus(`${firstMissingRequiredField} is required before adding.`);
      return;
    }

    setBusy(true);
    setStatus("Checking duplicates before adding...");
    try {
      const normalizedImei = intake.imei.trim();
      const normalizedSerialNumber = intake.serialNumber.trim();
      const duplicateChecks: Array<{ field: "imei" | "serialNumber"; value: string }> = [];
      if (normalizedImei) {
        duplicateChecks.push({ field: "imei", value: normalizedImei });
      }
      if (normalizedSerialNumber) {
        duplicateChecks.push({ field: "serialNumber", value: normalizedSerialNumber });
      }

      const duplicateFields: string[] = [];
      for (const check of duplicateChecks) {
        const result = await window.desktop.inventory.check({
          baseUrl: form.baseUrl.trim(),
          imei: check.field === "imei" ? check.value : "",
          serialNumber: check.field === "serialNumber" ? check.value : "",
          sku: "",
          excludeId: editingDevice?.id,
        });

        if (result?.exists) {
          duplicateFields.push(check.field === "imei" ? `IMEI (${check.value})` : `Serial number (${check.value})`);
        }
      }

      if (duplicateFields.length > 0) {
        const details = duplicateFields.join(" and ");
        setDuplicateInfo(`Cannot save. Duplicate detected: ${details} already exists.`);
        setStatus("Duplicate blocked. IMEI and Serial number must both be unique.");
        return;
      }

      setStatus(activePage === "edit-device" ? "Saving device changes..." : "Adding device to inventory...");

      const selectedSite = dropdowns.sites.find((site) => site.id === siteId);
      const payload = {
        inventoryItemId: editingDevice?.id,
        deviceTypeId: intake.deviceTypeId.trim() || undefined,
        imei: intake.imei.trim(),
        serialNumber: intake.serialNumber.trim(),
        sku: "",
        model: intake.model.trim(),
        capacity: intake.capacity.trim(),
        color: intake.color.trim(),
        batteryHealth: intake.batteryHealth.trim(),
        cycleCount: intake.cycleCount.trim(),
        iosVersion: intake.iosVersion.trim(),
        dateOfPurchase: intake.dateOfPurchase || todayIsoDate(),
        siteId,
        site: selectedSite?.name || "Main",
        carrier: intake.carrier.trim(),
        condition: intake.condition.trim() || "Used",
        grade: intake.grade.trim(),
        supplier: intake.supplier.trim(),
        costPesos: normalizeMoneyForSubmit(intake.cost),
        costCurrency: intake.currency.trim() || "MXN",
        price: normalizeMoneyForSubmit(intake.price),
        price2: normalizeMoneyForSubmit(intake.price2),
        price3: normalizeMoneyForSubmit(intake.price3),
        status: intake.status.trim() || "Available",
        comments: intake.comments.trim(),
        qrRaw: "",
      };

      const result = await window.desktop.inventory.add({
        baseUrl: form.baseUrl.trim(),
        data: payload,
      });

      setStatus(result?.isUpdate ? "Existing item updated successfully." : "Device added successfully.");
      await window.desktop.notify(
        "iReader by Pro Buyer",
        result?.isUpdate ? "Inventory item updated." : "Inventory item added."
      );
      if (result?.isUpdate) {
        setEditingDevice(null);
        setActiveNavId("inventory");
        setActivePage("inventory");
      }
      setDuplicateInfo("");
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Failed to add device.");
    } finally {
      setBusy(false);
    }
  };

  const handlePrintLabel = async () => {
    if (!session) {
      setStatus("Sign in before printing labels.");
      return;
    }

    setBusy(true);
    setStatus("Preparing label for print...");

    try {
      const templatePayload = await window.desktop.labelTemplate.get({ baseUrl: form.baseUrl.trim() });
      const rawTemplate = templatePayload?.template as {
        canvas?: { width?: number; height?: number; objects?: Array<Record<string, unknown>> };
        settings?: Record<string, unknown>;
      } | null;

      if (!rawTemplate || typeof rawTemplate !== "object") {
        setStatus("No saved label template found. Configure it in Label Editor first.");
        return;
      }

      const wrappedTemplate =
        rawTemplate && typeof rawTemplate === "object" && "canvas" in rawTemplate
          ? rawTemplate
          : { canvas: rawTemplate as { width?: number; height?: number; objects?: Array<Record<string, unknown>> } };

      const canvas = wrappedTemplate.canvas;
      const objects = Array.isArray(canvas?.objects) ? canvas.objects : [];
      if (objects.length === 0) {
        setStatus("Saved label template has no elements to print.");
        return;
      }

      const canvasWidth = Number(canvas?.width) > 0 ? Number(canvas?.width) : 192;
      const canvasHeight = Number(canvas?.height) > 0 ? Number(canvas?.height) : 96;

      const modelColorCapacity = [intake.model.trim(), intake.color.trim(), intake.capacity.trim()]
        .filter(Boolean)
        .join(" ");

      const date = new Date();
      const dateOnly = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const dateTime = `${dateOnly} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

      const values: Record<string, string> = {
        imei: intake.imei.trim(),
        sku: "",
        device_model: intake.model.trim(),
        model_color_capacity: modelColorCapacity,
        capacity: intake.capacity.trim(),
        color: intake.color.trim(),
        carrier: intake.carrier.trim(),
        battery_health: intake.batteryHealth.trim(),
        cycle_count: intake.cycleCount.trim(),
        ios_version: intake.iosVersion.trim(),
        grade: intake.grade.trim(),
        condition: intake.condition.trim(),
        comments: intake.comments.trim(),
        price: intake.price.trim(),
        price2: intake.price2.trim(),
        price3: intake.price3.trim(),
        serial_number: intake.serialNumber.trim(),
        registered_date: intake.dateOfPurchase || dateOnly,
        printed_date: dateOnly,
        printed_datetime: dateTime,
        url: "",
      };

      let logoDataUrl = "";
      if (objects.some((obj) => Boolean(obj.isLogo))) {
        const logoPayload = await window.desktop.org.logoDataUrl({ baseUrl: form.baseUrl.trim() }).catch(() => ({ logoDataUrl: "" }));
        logoDataUrl = String(logoPayload.logoDataUrl ?? "");
      }

      const renderedPieces = await Promise.all(
        objects.map(async (obj) => {
          const left = Number(obj.left ?? 0);
          const top = Number(obj.top ?? 0);
          const width = Math.max(1, Number(obj.width ?? 80));
          const height = Math.max(1, Number(obj.height ?? 24));

          if (obj.isLogo) {
            if (logoDataUrl) {
              return `<img src="${logoDataUrl}" alt="Logo" style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;object-fit:contain;"/>`;
            }
            return `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;border:1px dashed #64748b;display:flex;align-items:center;justify-content:center;font-size:10px;color:#64748b;">LOGO</div>`;
          }

          if (obj.isBarcode) {
            const codeType = String(obj.codeType ?? "code128") === "qrcode" ? "qrcode" : "code128";
            if (codeType === "qrcode") {
              const selectedFields = Array.isArray(obj.qrSelectedFields)
                ? obj.qrSelectedFields.map((entry) => String(entry).trim()).filter(Boolean)
                : [];
              const selectedParts = selectedFields
                .map((entry) => replaceLabelPlaceholders(entry, values).trim())
                .filter(Boolean);
              const customText = replaceLabelPlaceholders(String(obj.qrCustomText ?? ""), values).trim();
              const qrValue = [...selectedParts, customText].filter(Boolean).join(",") || replaceLabelPlaceholders(String(obj.dataPlaceholder ?? "{{imei}}"), values);

              const qrSize = Math.max(48, Math.min(720, Math.round(Math.max(width, height))));
              const qrDataUrl = await QRCode.toDataURL(qrValue || "QR", {
                margin: 0,
                width: qrSize,
                errorCorrectionLevel: "M",
                color: {
                  dark: "#111827",
                  light: "#ffffff",
                },
              }).catch(() => "");

              if (qrDataUrl) {
                return `<img src="${qrDataUrl}" alt="QR" style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;object-fit:contain;"/>`;
              }

              return `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:10px;overflow:hidden;">QR</div>`;
            }

            const barcodeValue = replaceLabelPlaceholders(String(obj.dataPlaceholder ?? "{{imei}}"), values).trim() || values.imei || values.serial_number || "NO-ID";
            return `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;padding:2px;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;"><div style="font-size:10px;letter-spacing:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;">|||| ||| |||| || | ||| ||||</div><div style="font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;width:100%;">${escapeHtml(barcodeValue)}</div></div>`;
          }

          const placeholder = String(obj.textPlaceholder ?? obj.text ?? "");
          const text = replaceLabelPlaceholders(placeholder, values).trim() || placeholder;
          const fontSize = Math.max(8, Number(obj.fontSize ?? 14));
          const fontWeight = String(obj.fontWeight ?? "normal").toLowerCase() === "bold" ? "700" : "400";
          return `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;font-size:${fontSize}px;font-weight:${fontWeight};line-height:1.2;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(text)}</div>`;
        })
      );
      const renderedHtml = renderedPieces.join("");

      const printWindow = window.open("", "_blank", "width=900,height=700");
      if (!printWindow) {
        setStatus("Popup blocked while trying to print label.");
        return;
      }

      printWindow.document.write(`<!doctype html><html><head><title>Print Label</title><style>body{font-family:Segoe UI,Arial,sans-serif;margin:0;padding:24px;background:#fff;color:#111}.sheet{display:flex;justify-content:center}.label{position:relative;width:${canvasWidth}px;height:${canvasHeight}px;border:1px solid #111;background:#fff}@media print{body{padding:0}.label{border:none}}</style></head><body><div class="sheet"><div class="label">${renderedHtml}</div></div><script>window.onload=()=>window.print();</script></body></html>`);
      printWindow.document.close();

      setStatus("Print dialog opened using current label template.");
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Failed to print label.");
    } finally {
      setBusy(false);
    }
  };

  const handleNavigate = (item: DesktopNavItem) => {
    setActiveNavId(item.id);
    setEditingDevice(null);
    if (item.view === "placeholder") {
      setPlaceholderTitle(item.label);
      setActivePage("placeholder");
      setStatus(`${item.label} page is a placeholder for now.`);
      return;
    }

    setActivePage(item.view);
    if (item.view === "dashboard") {
      setStatus("Dashboard page ready.");
      return;
    }
    if (item.view === "inventory") {
      setStatus("Inventory list ready.");
      return;
    }
    if (item.view === "intake") {
      setStatus("Add Device page ready.");
      return;
    }
    if (item.view === "checkout") {
      setStatus("Checkout page ready.");
      return;
    }
    if (item.view === "sales-history") {
      setStatus("Sales History page ready.");
      return;
    }
    if (item.view === "credit") {
      setStatus("Credit page ready.");
      return;
    }
    if (item.view === "public-inventory") {
      setStatus("Public Inventory page ready.");
      return;
    }
    if (item.view === "data-admin") {
      setStatus("Data Admin page ready.");
      return;
    }
    if (item.view === "profile") {
      setStatus("Profile page ready.");
      return;
    }
    setStatus("Label Designer page ready.");
  };

  const handleEditDevice = (row: DesktopInventoryListItem) => {
    setEditingDevice(row);
    setActiveNavId("inventory");
    setActivePage("edit-device");

    setIntake({
      deviceTypeId: "",
      imei: row.imei ?? "",
      serialNumber: row.serialNumber ?? "",
      model: row.model ?? "",
      capacity: row.capacity ?? "",
      color: row.color ?? "",
      batteryHealth: "",
      cycleCount: "",
      iosVersion: "",
      dateOfPurchase: todayIsoDate(),
      carrier: row.carrier ?? "",
      condition: row.condition ?? "",
      grade: row.grade ?? "",
      supplier: row.supplier?.name ?? "",
      siteId: row.site?.id ?? "",
      locationSiteId: row.site?.id ?? "",
      cost: formatMoneyDisplay(String(row.costPesos ?? "")),
      currency: row.costCurrency || "MXN",
      price: formatMoneyDisplay(String(row.price ?? "")),
      price2: formatMoneyDisplay(String(row.price2 ?? "")),
      price3: formatMoneyDisplay(String(row.price3 ?? "")),
      status: row.status ?? "Available",
      comments: "",
    });

    setAutoFilledFields({});
    setDuplicateInfo("");
    setStatus(`Editing device ${row.model}${row.imei ? ` • ${row.imei}` : ""}`);
  };

  return (
    <div className="app-shell">
      <TitleBar />
      <main className="workspace">
        <section className="card desktop-top-nav">
          <div className="desktop-top-nav__header">
            <div>
              <h2>{activePageTitle}</h2>
              <p className="hint">State: {usbStatus?.connectionState ?? "disconnected"}</p>
            </div>
            <div className="desktop-top-nav__session">
              {session ? (
                <>
                  <div className="profile-chip">
                    <span className="profile-icon" aria-hidden="true">◎</span>
                    <span>{activeOrganizationName}</span>
                  </div>
                  <button type="button" disabled={busy} onClick={() => void handleLogout()}>Logout</button>
                </>
              ) : requiresVerification ? (
                <form className="desktop-top-nav__auth" onSubmit={handleLogin}>
                  <input
                    value={verificationCode}
                    onChange={(event) =>
                      setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="6-digit code"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    style={{ width: "110px", letterSpacing: "2px", fontWeight: "bold" }}
                  />
                  <button type="submit" disabled={busy || verificationCode.length !== 6}>
                    {busy ? "Verifying..." : "Verify"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setRequiresVerification(false);
                      setVerificationCode("");
                      setStatus("Ready.");
                    }}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <form className="desktop-top-nav__auth" onSubmit={handleLogin}>
                  <input
                    value={form.email}
                    onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="Email"
                    autoComplete="username"
                  />
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder="Password"
                    autoComplete="current-password"
                  />
                  <button type="submit" disabled={busy}>{busy ? "Working..." : "Sign In"}</button>
                </form>
              )}
            </div>
          </div>
          <div className="desktop-top-nav__buttons">
            {DESKTOP_NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={activeNavId === item.id ? "desktop-top-nav__button active" : "desktop-top-nav__button"}
                onClick={() => handleNavigate(item)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          {activePage === "dashboard" ? (
            <div className="intake-panel">
              <DesktopDashboard baseUrl={form.baseUrl.trim()} signedIn={Boolean(session)} />
            </div>
          ) : activePage === "inventory" ? (
            <div className="intake-panel">
              <DesktopInventoryList
                baseUrl={form.baseUrl.trim()}
                signedIn={Boolean(session)}
                onGoToAddDevice={() => handleNavigate({ id: "add-device", label: "Add Device", view: "intake" })}
                onEditDevice={handleEditDevice}
              />
            </div>
          ) : activePage === "checkout" ? (
            <div className="intake-panel">
              <DesktopCheckout baseUrl={form.baseUrl.trim()} signedIn={Boolean(session)} />
            </div>
          ) : activePage === "sales-history" ? (
            <div className="intake-panel">
              <DesktopSalesHistory baseUrl={form.baseUrl.trim()} signedIn={Boolean(session)} />
            </div>
          ) : activePage === "credit" ? (
            <div className="intake-panel">
              <DesktopCredit baseUrl={form.baseUrl.trim()} signedIn={Boolean(session)} />
            </div>
          ) : activePage === "public-inventory" ? (
            <div className="intake-panel">
              <DesktopPublicInventory baseUrl={form.baseUrl.trim()} signedIn={Boolean(session)} />
            </div>
          ) : activePage === "data-admin" ? (
            <div className="intake-panel">
              <DesktopDataAdmin baseUrl={form.baseUrl.trim()} signedIn={Boolean(session)} />
            </div>
          ) : activePage === "profile" ? (
            <div className="intake-panel">
              <DesktopProfile baseUrl={form.baseUrl.trim()} signedIn={Boolean(session)} />
            </div>
          ) : activePage === "intake" || activePage === "edit-device" ? (
          <div className="intake-panel">
            <h2>{activePage === "edit-device" ? "Edit Device" : "Add Device"}</h2>
            <div className="grid intake-grid">
              <label className={fieldClassName("deviceTypeId")}>
                Device Type
                <select
                  value={intake.deviceTypeId}
                  onChange={(event) => {
                    markFieldAsManual("deviceTypeId");
                    const deviceTypeId = event.target.value;
                    setIntake((prev) => {
                      if (activePage === "edit-device") {
                        return {
                          ...prev,
                          deviceTypeId,
                        };
                      }

                      return {
                        ...prev,
                        deviceTypeId,
                        model: "",
                        capacity: "",
                        color: "",
                      };
                    });
                  }}
                >
                  <option value="">Select device type</option>
                  {dropdowns.deviceTypes.map((deviceType) => (
                    <option key={deviceType.id} value={deviceType.id}>{deviceType.name}</option>
                  ))}
                </select>
                {autoFilledFields.deviceTypeId ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("imei")}>
                IMEI
                <input value={intake.imei} onChange={(event) => {
                  markFieldAsManual("imei");
                  setIntake((prev) => ({ ...prev, imei: event.target.value }));
                }} />
                {autoFilledFields.imei ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("serialNumber")}>
                Serial Number
                <input value={intake.serialNumber} onChange={(event) => {
                  markFieldAsManual("serialNumber");
                  setIntake((prev) => ({ ...prev, serialNumber: event.target.value }));
                }} />
                {autoFilledFields.serialNumber ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("model")}>
                Model*
                <select
                  value={intake.model}
                  onChange={(event) => {
                    markFieldAsManual("model");
                    const nextModel = event.target.value;
                    const entry = dropdowns.modelCatalog[nextModel];
                    setIntake((prev) => ({
                      ...prev,
                      model: nextModel,
                      deviceTypeId: prev.deviceTypeId || entry?.deviceTypeId || prev.deviceTypeId,
                      capacity: entry?.capacities.includes(prev.capacity) ? prev.capacity : "",
                      color: entry?.colors.includes(prev.color) ? prev.color : "",
                    }));
                  }}
                >
                  <option value="">Select model</option>
                  {modelOptions.map((modelName) => (
                    <option key={modelName} value={modelName}>{modelName}</option>
                  ))}
                </select>
                {autoFilledFields.model ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("capacity")}>
                Capacity
                <select
                  value={intake.capacity}
                  onChange={(event) => {
                    markFieldAsManual("capacity");
                    setIntake((prev) => ({ ...prev, capacity: event.target.value }));
                  }}
                >
                  <option value="">Select capacity</option>
                  {(selectedModelEntry?.capacities ?? []).map((capacity) => (
                    <option key={capacity} value={capacity}>{capacity}</option>
                  ))}
                </select>
                {autoFilledFields.capacity ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("color")}>
                Color
                <select
                  value={intake.color}
                  onChange={(event) => {
                    markFieldAsManual("color");
                    setIntake((prev) => ({ ...prev, color: event.target.value }));
                  }}
                >
                  <option value="">Select color</option>
                  {(selectedModelEntry?.colors ?? []).map((color) => (
                    <option key={color} value={color}>{color}</option>
                  ))}
                </select>
                {autoFilledFields.color ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("batteryHealth")}>
                Battery Health
                <input value={intake.batteryHealth} onChange={(event) => {
                  markFieldAsManual("batteryHealth");
                  setIntake((prev) => ({ ...prev, batteryHealth: event.target.value }));
                }} placeholder="e.g. 87%" />
                {autoFilledFields.batteryHealth ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("cycleCount")}>
                Cycle Count
                <input value={intake.cycleCount} onChange={(event) => {
                  markFieldAsManual("cycleCount");
                  setIntake((prev) => ({ ...prev, cycleCount: event.target.value }));
                }} />
                {autoFilledFields.cycleCount ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("iosVersion")}>
                iOS Version
                <input value={intake.iosVersion} onChange={(event) => {
                  markFieldAsManual("iosVersion");
                  setIntake((prev) => ({ ...prev, iosVersion: event.target.value }));
                }} />
                {autoFilledFields.iosVersion ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("dateOfPurchase")}>
                Date Of Purchase
                <input
                  type="date"
                  value={intake.dateOfPurchase}
                  onChange={(event) => {
                    markFieldAsManual("dateOfPurchase");
                    setIntake((prev) => ({ ...prev, dateOfPurchase: event.target.value }));
                  }}
                />
                {autoFilledFields.dateOfPurchase ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("siteId")}>
                Site
                <select value={intake.siteId} onChange={(event) => {
                  markFieldAsManual("siteId");
                  setIntake((prev) => ({ ...prev, siteId: event.target.value }));
                }}>
                  <option value="">Select site</option>
                  {dropdowns.sites.map((site) => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
                {autoFilledFields.siteId ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("locationSiteId")}>
                Location
                <select value={intake.locationSiteId} onChange={(event) => {
                  markFieldAsManual("locationSiteId");
                  setIntake((prev) => ({ ...prev, locationSiteId: event.target.value }));
                }}>
                  <option value="">Select location</option>
                  {dropdowns.sites.map((site) => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
                {autoFilledFields.locationSiteId ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("carrier")}>
                Carrier
                <select value={intake.carrier} onChange={(event) => {
                  markFieldAsManual("carrier");
                  setIntake((prev) => ({ ...prev, carrier: event.target.value }));
                }}>
                  <option value="">Select carrier</option>
                  {dropdowns.carriers.map((carrier) => (
                    <option key={carrier} value={carrier}>{carrier}</option>
                  ))}
                </select>
                {autoFilledFields.carrier ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("condition")}>
                Condition
                <select value={intake.condition} onChange={(event) => {
                  markFieldAsManual("condition");
                  setIntake((prev) => ({ ...prev, condition: event.target.value }));
                }}>
                  <option value="">Select condition</option>
                  {dropdowns.conditions.map((condition) => (
                    <option key={condition} value={condition}>{condition}</option>
                  ))}
                </select>
                {autoFilledFields.condition ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("grade")}>
                Grade
                <select value={intake.grade} onChange={(event) => {
                  markFieldAsManual("grade");
                  setIntake((prev) => ({ ...prev, grade: event.target.value }));
                }}>
                  <option value="">Select grade</option>
                  {dropdowns.grades.map((grade) => (
                    <option key={grade} value={grade}>{grade}</option>
                  ))}
                </select>
                {autoFilledFields.grade ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("supplier")}>
                Supplier
                <select value={intake.supplier} onChange={(event) => {
                  markFieldAsManual("supplier");
                  setIntake((prev) => ({ ...prev, supplier: event.target.value }));
                }}>
                  <option value="">Select supplier</option>
                  {dropdowns.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.name}>{supplier.name}</option>
                  ))}
                </select>
                {autoFilledFields.supplier ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("cost")}>
                Cost
                <input value={intake.cost} onChange={(event) => {
                  markFieldAsManual("cost");
                  setIntake((prev) => ({ ...prev, cost: formatMoneyDisplay(event.target.value) }));
                }} />
                {autoFilledFields.cost ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("currency")}>
                Currency
                <select value={intake.currency} onChange={(event) => {
                  markFieldAsManual("currency");
                  setIntake((prev) => ({ ...prev, currency: event.target.value }));
                }}>
                  {dropdowns.currencies.map((currency) => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </select>
                {autoFilledFields.currency ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("price")}>
                Price
                <input value={intake.price} onChange={(event) => {
                  markFieldAsManual("price");
                  setIntake((prev) => ({ ...prev, price: formatMoneyDisplay(event.target.value) }));
                }} />
                {autoFilledFields.price ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("price2")}>
                Price 2
                <input value={intake.price2} onChange={(event) => {
                  markFieldAsManual("price2");
                  setIntake((prev) => ({ ...prev, price2: formatMoneyDisplay(event.target.value) }));
                }} />
                {autoFilledFields.price2 ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("price3")}>
                Price 3
                <input value={intake.price3} onChange={(event) => {
                  markFieldAsManual("price3");
                  setIntake((prev) => ({ ...prev, price3: formatMoneyDisplay(event.target.value) }));
                }} />
                {autoFilledFields.price3 ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={fieldClassName("status")}>
                Status
                <select value={intake.status} onChange={(event) => {
                  markFieldAsManual("status");
                  setIntake((prev) => ({ ...prev, status: event.target.value }));
                }}>
                  {dropdowns.statuses.map((statusOption) => (
                    <option key={statusOption} value={statusOption}>{statusOption}</option>
                  ))}
                </select>
                {autoFilledFields.status ? <span className="field-hint">auto-filled</span> : null}
              </label>
              <label className={`comments-field ${fieldClassName("comments")}`}>
                Comments
                <textarea value={intake.comments} onChange={(event) => {
                  markFieldAsManual("comments");
                  setIntake((prev) => ({ ...prev, comments: event.target.value }));
                }} rows={3} />
                {autoFilledFields.comments ? <span className="field-hint">auto-filled</span> : null}
              </label>
            </div>

            {isAddDevicePage && hasPrefilledFields && isDeviceDisconnected ? (
              <div className="button-row button-row-utility">
                <button type="button" disabled={busy} onClick={clearPrefilledData}>Clear Prefilled Data</button>
                <button type="button" disabled={busy} onClick={() => void handleRefreshFromConnectedDevice()}>
                  Refresh Data From Connected Device
                </button>
              </div>
            ) : null}

            <div className="button-row">
              <button type="button" disabled={busy || !session} onClick={() => void handleCheckDuplicate()}>
                Check Duplicate
              </button>
              <button type="button" disabled={busy || !session} onClick={() => void handlePrintLabel()}>
                Print Label
              </button>
              <button
                type="button"
                disabled={busy || !session || Boolean(firstMissingRequiredField)}
                onClick={() => void handleAddToInventory()}
              >
                {activePage === "edit-device" ? "Save Device" : "One-Click Add"}
              </button>
              {activePage === "edit-device" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditingDevice(null);
                    handleNavigate({ id: "inventory", label: "Inventory", view: "inventory" });
                  }}
                >
                  Back To Inventory
                </button>
              ) : null}
            </div>
            {!session ? <p className="hint">Sign in from the profile section to check duplicates and add inventory.</p> : null}
            {session && firstMissingRequiredField ? <p className="hint">Complete required field: {firstMissingRequiredField}</p> : null}
            {duplicateInfo ? <p className="hint">{duplicateInfo}</p> : null}
          </div>
          ) : (
            activePage === "labels" ? (
              <div className="intake-panel">
                <LabelEditor baseUrl={form.baseUrl.trim()} session={session} />
              </div>
            ) : (
              <div className="intake-panel placeholder-panel">
                <h2>{placeholderTitle}</h2>
                <p>This page button is now in place and styled for desktop navigation.</p>
                <p className="hint">Functionality will be connected in the next implementation pass.</p>
              </div>
            )
          )}
        </section>

        <footer className="status">{status}</footer>
      </main>
    </div>
  );
}
