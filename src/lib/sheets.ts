export type PriceTier = "Price" | "Price 2" | "Price 3";

export type SupplierRecord = {
  name: string;
  status: "Active" | "Inactive";
};

export type WholesaleCustomerRecord = {
  name: string;
  email: string;
  whatsappPhone: string;
  customerType: "retail" | "wholesale";
  defaultPriceTier: PriceTier;
  status: "Active" | "Inactive";
  createdAt: string;
};

export type ModelCapacityPriceRecord = {
  model: string;
  capacity: string;
  price: string;
  price2: string;
  price3: string;
  createdAt?: string;
};

export type DeletedDeviceRecord = {
  imei: string;
  model: string;
  capacity: string;
  color: string;
  carrier: string;
  condition: string;
  supplier: string;
  dateOfPurchase: string;
  cost: string;
  costCurrency: string;
  price: string;
  price2: string;
  price3: string;
  status: string;
  batteryHealth: string;
  cycleCount: string;
  iosVersion: string;
  serialNumber: string;
  comments: string;
  qrRaw: string;
  deletedReason: string;
  deletedAt: string;
};

export type InventoryInput = {
  imei: string;
  sku?: string;
  deviceType?: string;
  deviceTypeId?: string;
  site: string;
  siteId?: string;
  model: string;
  capacity: string;
  color: string;
  carrier: string;
  condition: string;
  grade?: string;
  supplier: string;
  dateOfPurchase: string;
  cost: string;
  costCurrency: string;
  costUsd?: string;
  usdToPesosRate?: string;
  costPesos?: string;
  price: string;
  price2: string;
  price3: string;
  status: string;
  batteryHealth: string;
  cycleCount: string;
  iosVersion: string;
  serialNumber: string;
  comments: string;
  qrRaw: string;
};

export type InventoryRow = InventoryInput & {
  id?: string;
  createdAt: string;
  rowNumber?: number;
};

export type SaleLineInput = {
  imei: string;
  model: string;
  capacity: string;
  color: string;
  costPesos: string;
  salePrice: string;
  marginPesos: string;
};

export type SaleRow = {
  saleId: string;
  soldAt: string;
  imei: string;
  model: string;
  capacity: string;
  color: string;
  costPesos: string;
  salePrice: string;
  marginPesos: string;
  customer: string;
  customerWhatsapp: string;
  paymentMethod: string;
  notes: string;
  soldBy: string;
  status: string;
};

type RequestContext = {
  token?: string | null;
  spreadsheetId?: string | null;
  sheetName?: string | null;
};

const defaultJsonHeaders = {
  "Content-Type": "application/json",
};

const isBrowser = typeof window !== "undefined";

const getStorage = <T>(key: string, fallback: T): T => {
  if (!isBrowser) return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const setStorage = <T>(key: string, value: T) => {
  if (!isBrowser) return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const toText = (value: unknown) => {
  if (value === null || value === undefined) return "";
  return String(value);
};

const mapInventoryItemToRow = (item: {
  id?: string;
  imei?: string | null;
  sku?: string | null;
  siteId?: string;
  model?: string;
  capacity?: string;
  color?: string;
  carrier?: string;
  condition?: string;
  grade?: string | null;
  status?: string;
  costPesos?: unknown;
  costCurrency?: string | null;
  price?: unknown;
  price2?: unknown;
  price3?: unknown;
  batteryHealth?: string | null;
  cycleCount?: number | null;
  iosVersion?: string | null;
  serialNumber?: string | null;
  comments?: string | null;
  qrRaw?: string | null;
  dateOfPurchase?: string | Date | null;
  createdAt?: string | Date;
  supplier?: { name?: string | null } | null;
  site?: { id?: string; name?: string | null } | null;
  deviceType?: { id?: string; name?: string | null } | null;
  deviceTypeId?: string | null;
}) => {
  const row: InventoryRow = {
    id: toText(item.id),
    imei: toText(item.imei),
    sku: toText(item.sku),
    deviceType: toText(item.deviceType?.name),
    deviceTypeId: toText(item.deviceTypeId || item.deviceType?.id),
    site: toText(item.site?.name || "Main"),
    siteId: toText(item.site?.id || item.siteId),
    model: toText(item.model),
    capacity: toText(item.capacity),
    color: toText(item.color),
    carrier: toText(item.carrier),
    condition: toText(item.condition),
    grade: toText(item.grade),
    supplier: toText(item.supplier?.name),
    dateOfPurchase: item.dateOfPurchase ? new Date(item.dateOfPurchase).toISOString() : "",
    cost: toText(item.costPesos),
    costCurrency: toText(item.costCurrency || "MXN"),
    costUsd: "",
    usdToPesosRate: "",
    costPesos: toText(item.costPesos),
    price: toText(item.price),
    price2: toText(item.price2),
    price3: toText(item.price3),
    status: toText(item.status || "Available"),
    batteryHealth: toText(item.batteryHealth),
    cycleCount: toText(item.cycleCount),
    iosVersion: toText(item.iosVersion),
    serialNumber: toText(item.serialNumber),
    comments: toText(item.comments),
    qrRaw: toText(item.qrRaw),
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : "",
  };
  return row;
};

const parseNumber = (value: string) => {
  const normalized = value?.toString().trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage = body && typeof body.error === "string" ? body.error : `Request failed (${response.status})`;
    throw new Error(errorMessage);
  }
  return body as T;
};

const deletedDevicesStorageKey = "icellshop_deleted_devices";
const receiptLogoStorageKey = "icellshop_receipt_logo";
const statusOptionsStorageKey = "icellshop_status_options";
const gradeOptionsStorageKey = "icellshop_grade_options";
const conditionOptionsStorageKey = "icellshop_condition_options";
const pricingHistoryStorageKey = "icellshop_pricing_history";

export const defaultStatusOptions = [
  "Available",
  "Sold",
  "Reserved",
  "Returned to Supplier",
  "Defective",
  "Lost",
] as const;

export const defaultGradeOptions = ["A", "AB", "A+", "B", "B-"] as const;
export const defaultConditionOptions = ["New", "Used", "Refurbished", "For parts"] as const;

export async function fetchInventoryRows(
  args: RequestContext & { status?: string }
): Promise<InventoryRow[]> {
  const status = args.status && args.status !== "All" ? `?status=${encodeURIComponent(args.status)}` : "";
  const payload = await requestJson<{ inventoryItems: Array<Record<string, unknown>> }>(`/api/inventory${status}`);
  return (payload.inventoryItems || []).map((item) => mapInventoryItemToRow(item));
}

export async function fetchInventoryRowByImei(
  args: RequestContext & { imei: string }
): Promise<InventoryRow | null> {
  const payload = await requestJson<{ exists: boolean; inventoryItem: Record<string, unknown> | null }>(
    `/api/inventory/check-imei?imei=${encodeURIComponent(args.imei)}`
  );
  if (!payload.exists || !payload.inventoryItem) return null;
  return mapInventoryItemToRow(payload.inventoryItem);
}

export async function inventoryImeiExists(
  args: RequestContext & { imei: string }
): Promise<boolean> {
  const payload = await requestJson<{ exists: boolean }>(
    `/api/inventory/check-imei?imei=${encodeURIComponent(args.imei)}`
  );
  return Boolean(payload.exists);
}

export async function appendInventoryRow(
  args: RequestContext & { data: InventoryInput }
): Promise<{ isUpdate: boolean }> {
  const payload = {
    ...args.data,
    source: "inventory-import",
  };
  const response = await requestJson<{ success: boolean; isUpdate?: boolean }>("/api/inventory", {
    method: "POST",
    headers: defaultJsonHeaders,
    body: JSON.stringify(payload),
  });
  return { isUpdate: Boolean(response.isUpdate) };
}

export async function updateInventoryRowByImei(
  args: RequestContext & { lookupImei: string; data: InventoryInput }
): Promise<void> {
  const payload = {
    ...args.data,
    imei: args.lookupImei || args.data.imei,
  };
  await requestJson<{ success: boolean }>("/api/inventory", {
    method: "POST",
    headers: defaultJsonHeaders,
    body: JSON.stringify(payload),
  });
}

export async function deleteInventoryDeviceByImei(
  args: RequestContext & {
    inventorySheetName?: string;
    dataSheetName?: string;
    imei: string;
    reason: string;
  }
): Promise<void> {
  const row = await fetchInventoryRowByImei({ imei: args.imei });
  await requestJson<{ success: boolean }>("/api/inventory", {
    method: "DELETE",
    headers: defaultJsonHeaders,
    body: JSON.stringify({ imei: args.imei, reason: args.reason }),
  });

  if (row) {
    const history = getStorage<DeletedDeviceRecord[]>(deletedDevicesStorageKey, []);
    const deletedRecord: DeletedDeviceRecord = {
      ...row,
      deletedReason: args.reason,
      deletedAt: new Date().toISOString(),
    };
    setStorage(deletedDevicesStorageKey, [deletedRecord, ...history]);
  }
}

export async function completeInventorySale(
  _args: RequestContext & { inventorySheetName?: string; imeis: string[]; saleId?: string }
): Promise<void> {
  return;
}

export async function appendSaleRows(
  args: RequestContext & {
    saleId: string;
    customer: string;
    customerWhatsapp?: string;
    paymentMethod: string;
    notes: string;
    soldBy: string;
    lines: SaleLineInput[];
  }
): Promise<void> {
  await requestJson<{ sale: { id: string } }>("/api/sales", {
    method: "POST",
    headers: defaultJsonHeaders,
    body: JSON.stringify({
      saleId: args.saleId,
      customerName: args.customer,
      customerWhatsapp: args.customerWhatsapp || "",
      paymentMethod: args.paymentMethod,
      notes: args.notes,
      soldBy: args.soldBy,
      items: args.lines.map((line) => ({
        imei: line.imei,
        salePrice: parseNumber(line.salePrice),
      })),
    }),
  });
}

export async function fetchSalesRows(
  _args: RequestContext
): Promise<SaleRow[]> {
  const payload = await requestJson<{
    sales: Array<{
      saleId: string;
      soldAt: string;
      customer: string;
      customerWhatsapp?: string;
      paymentMethod: string;
      notes: string;
      soldBy: string;
      lines: Array<{
        imei: string;
        model: string;
        capacity: string;
        color: string;
        costPesos: string;
        salePrice: string;
        marginPesos: number;
        status: string;
      }>;
    }>;
  }>("/api/sales");

  return (payload.sales || []).flatMap((sale) =>
    (sale.lines || []).map((line) => ({
      saleId: toText(sale.saleId),
      soldAt: toText(sale.soldAt),
      imei: toText(line.imei),
      model: toText(line.model),
      capacity: toText(line.capacity),
      color: toText(line.color),
      costPesos: toText(line.costPesos),
      salePrice: toText(line.salePrice),
      marginPesos: toText(line.marginPesos),
      customer: toText(sale.customer),
      customerWhatsapp: toText(sale.customerWhatsapp),
      paymentMethod: toText(sale.paymentMethod),
      notes: toText(sale.notes),
      soldBy: toText(sale.soldBy),
      status: toText(line.status),
    }))
  );
}

export async function fetchSupplierRecords(_args: RequestContext): Promise<SupplierRecord[]> {
  const payload = await requestJson<{ suppliers: Array<{ name: string; status: string }> }>("/api/suppliers");
  return (payload.suppliers || []).map((supplier) => ({
    name: supplier.name,
    status: supplier.status === "Inactive" ? "Inactive" : "Active",
  }));
}

export async function saveSupplierRecords(
  _args: RequestContext & { suppliers: SupplierRecord[] }
): Promise<void> {
  const seen = new Set<string>();
  for (const supplier of _args.suppliers) {
    const name = supplier.name.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    await requestJson<{ success: boolean }>("/api/suppliers", {
      method: "POST",
      headers: defaultJsonHeaders,
      body: JSON.stringify({ name, status: supplier.status }),
    });
  }
}

export async function fetchWholesaleCustomerRecords(
  _args: RequestContext
): Promise<WholesaleCustomerRecord[]> {
  const payload = await requestJson<{
    customers: Array<{
      name?: string;
      email?: string | null;
      whatsapp?: string | null;
      customerType?: string | null;
      defaultPriceTier?: string | null;
      status?: string | null;
      createdAt?: string;
    }>;
  }>("/api/customers");

  return (payload.customers || []).map((customer) => ({
    name: toText(customer.name),
    email: toText(customer.email),
    whatsappPhone: toText(customer.whatsapp),
    customerType: customer.customerType === "wholesale" ? "wholesale" : "retail",
    defaultPriceTier:
      customer.defaultPriceTier === "Price 2"
        ? "Price 2"
        : customer.defaultPriceTier === "Price 3"
          ? "Price 3"
          : "Price",
    status: customer.status === "Inactive" ? "Inactive" : "Active",
    createdAt: customer.createdAt ? new Date(customer.createdAt).toISOString() : "",
  }));
}

export async function saveWholesaleCustomerRecords(
  args: RequestContext & { customers: WholesaleCustomerRecord[] }
): Promise<void> {
  const existing = await requestJson<{
    customers: Array<{
      id: string;
      name: string;
    }>;
  }>("/api/customers");

  const byName = new Map(
    (existing.customers || []).map((customer) => [customer.name.toLowerCase(), customer.id] as const)
  );

  for (const customer of args.customers) {
    const name = customer.name.trim();
    if (!name) continue;

    const existingId = byName.get(name.toLowerCase());
    if (existingId) {
      await requestJson<{ customer: { id: string } }>("/api/customers", {
        method: "PUT",
        headers: defaultJsonHeaders,
        body: JSON.stringify({
          id: existingId,
          name,
          email: customer.email,
          whatsapp: customer.whatsappPhone,
          customerType: customer.customerType,
          defaultPriceTier: customer.defaultPriceTier,
          status: customer.status,
        }),
      });
    } else {
      await requestJson<{ customer: { id: string } }>("/api/customers", {
        method: "POST",
        headers: defaultJsonHeaders,
        body: JSON.stringify({
          name,
          email: customer.email,
          whatsapp: customer.whatsappPhone,
          customerType: customer.customerType,
          defaultPriceTier: customer.defaultPriceTier,
          status: customer.status,
        }),
      });
    }
  }
}

export async function fetchLatestUsdToPesosRate(_args: RequestContext): Promise<string> {
  const payload = await requestJson<{ latestRate: string | null }>("/api/exchange-rates");
  return payload.latestRate ?? "";
}

export async function fetchUsdToPesosRateHistory(
  _args: RequestContext
): Promise<Array<{ rate: string; createdAt: string }>> {
  const payload = await requestJson<{
    history: Array<{ usdToMxn: string; createdAt: string }>;
  }>("/api/exchange-rates");

  return (payload.history || [])
    .map((entry) => ({ rate: toText(entry.usdToMxn), createdAt: toText(entry.createdAt) }))
    .reverse();
}

export async function appendUsdToPesosRateHistory(
  args: RequestContext & { rate: string }
): Promise<void> {
  await requestJson<{ success: boolean }>("/api/exchange-rates", {
    method: "POST",
    headers: defaultJsonHeaders,
    body: JSON.stringify({ usdToMxn: args.rate }),
  });
}

export async function fetchStatusOptions(_args: RequestContext): Promise<string[]> {
  const stored = getStorage<string[]>(statusOptionsStorageKey, []);
  if (stored.length > 0) return stored;
  return [...defaultStatusOptions];
}

export async function saveStatusOptions(
  args: RequestContext & { statuses?: string[]; options?: string[] }
): Promise<void> {
  const source = args.statuses ?? args.options ?? [];
  const normalized = Array.from(new Set(source.map((status) => status.trim()).filter(Boolean)));
  setStorage(statusOptionsStorageKey, normalized.length > 0 ? normalized : [...defaultStatusOptions]);
}

export async function fetchGradeOptions(_args: RequestContext): Promise<string[]> {
  if (!isBrowser) return [...defaultGradeOptions];

  const raw = window.localStorage.getItem(gradeOptionsStorageKey);
  if (raw === null) {
    return [...defaultGradeOptions];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0)
        .slice(0, 10);
    }
  } catch {
  }

  return [];
}

export async function saveGradeOptions(
  args: RequestContext & { grades?: string[]; options?: string[] }
): Promise<void> {
  const source = args.grades ?? args.options ?? [];
  const normalized = Array.from(new Set(source.map((grade) => grade.trim()).filter(Boolean))).slice(0, 10);
  setStorage(gradeOptionsStorageKey, normalized);
}

export async function fetchConditionOptions(_args: RequestContext): Promise<string[]> {
  if (!isBrowser) return [...defaultConditionOptions];

  const raw = window.localStorage.getItem(conditionOptionsStorageKey);
  if (raw === null) {
    return [...defaultConditionOptions];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0)
        .slice(0, 10);
    }
  } catch {
  }

  return [];
}

export async function saveConditionOptions(
  args: RequestContext & { conditions?: string[]; options?: string[] }
): Promise<void> {
  const source = args.conditions ?? args.options ?? [];
  const normalized = Array.from(new Set(source.map((condition) => condition.trim()).filter(Boolean))).slice(0, 10);
  setStorage(conditionOptionsStorageKey, normalized);
}

export async function fetchModelCapacityPriceRecords(
  _args: RequestContext
): Promise<ModelCapacityPriceRecord[]> {
  const payload = await requestJson<{
    rules: Array<{ model: string; capacity: string; price: string; price2: string; price3: string }>;
  }>("/api/pricing-rules");

  return (payload.rules || []).map((rule) => ({
    model: toText(rule.model),
    capacity: toText(rule.capacity),
    price: toText(rule.price),
    price2: toText(rule.price2),
    price3: toText(rule.price3),
  }));
}

export async function saveModelCapacityPriceRecords(
  args: RequestContext & { records: ModelCapacityPriceRecord[] }
): Promise<void> {
  for (const record of args.records) {
    if (!record.model.trim() || !record.capacity.trim()) continue;
    await requestJson<{ rule: { id: string } }>("/api/pricing-rules", {
      method: "POST",
      headers: defaultJsonHeaders,
      body: JSON.stringify(record),
    });
  }
}

export async function fetchModelCapacityPriceHistory(
  _args: RequestContext
): Promise<Array<ModelCapacityPriceRecord & { createdAt: string }>> {
  return getStorage<Array<ModelCapacityPriceRecord & { createdAt: string }>>(pricingHistoryStorageKey, []);
}

export async function appendModelCapacityPriceHistory(
  args: RequestContext & { record: ModelCapacityPriceRecord }
): Promise<void> {
  const history = getStorage<Array<ModelCapacityPriceRecord & { createdAt: string }>>(pricingHistoryStorageKey, []);
  setStorage(pricingHistoryStorageKey, [
    {
      ...args.record,
      createdAt: new Date().toISOString(),
    },
    ...history,
  ]);
}

export async function fetchDeletedDevicesHistory(
  _args: RequestContext
): Promise<DeletedDeviceRecord[]> {
  return getStorage<DeletedDeviceRecord[]>(deletedDevicesStorageKey, []);
}

export async function fetchReceiptLogoDataUrl(_args: RequestContext): Promise<string> {
  return getStorage<string>(receiptLogoStorageKey, "");
}

export async function saveReceiptLogoDataUrl(
  args: RequestContext & { dataUrl: string }
): Promise<void> {
  setStorage(receiptLogoStorageKey, args.dataUrl || "");
}
