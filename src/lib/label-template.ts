export type LabelFieldDefinition = {
  label: string;
  placeholder: string;
  example: string;
};

export const AVAILABLE_LABEL_FIELDS: LabelFieldDefinition[] = [
  { label: "IMEI", placeholder: "{{imei}}", example: "359991234567890" },
  { label: "SKU", placeholder: "{{sku}}", example: "IP16-128-BLK-UNL" },
  { label: "Model", placeholder: "{{device_model}}", example: "iPhone 17 Pro Max" },
  {
    label: "Model + Color + Capacity",
    placeholder: "{{model_color_capacity}}",
    example: "iPhone 17 Pro Max Cosmic Orange 256GB",
  },
  { label: "Capacity", placeholder: "{{capacity}}", example: "256GB" },
  { label: "Color", placeholder: "{{color}}", example: "Cosmic Orange" },
  { label: "Carrier", placeholder: "{{carrier}}", example: "Unlocked" },
  { label: "Battery Health", placeholder: "{{battery_health}}", example: "100%" },
  { label: "Cycle Count", placeholder: "{{cycle_count}}", example: "142" },
  { label: "iOS Version", placeholder: "{{ios_version}}", example: "18.3" },
  { label: "Grade", placeholder: "{{grade}}", example: "A" },
  { label: "Condition", placeholder: "{{condition}}", example: "Excellent" },
  { label: "Comments", placeholder: "{{comments}}", example: "Minor scratches on frame" },
  { label: "Price", placeholder: "{{price}}", example: "$1,499" },
  { label: "Price 2", placeholder: "{{price2}}", example: "$1,449" },
  { label: "Price 3", placeholder: "{{price3}}", example: "$1,399" },
  { label: "Serial Number", placeholder: "{{serial_number}}", example: "DX3Q91ABCD12" },
  { label: "Registered Date", placeholder: "{{registered_date}}", example: "2026-03-13" },
  { label: "Print Date", placeholder: "{{printed_date}}", example: "2026-03-13" },
  { label: "Print Date + Time", placeholder: "{{printed_datetime}}", example: "2026-03-13 14:30" },
];

export const QR_FIELD_OPTIONS = AVAILABLE_LABEL_FIELDS.filter(
  (field) => !["{{printed_date}}", "{{printed_datetime}}"].includes(field.placeholder)
);

export const FIELD_EXAMPLE_BY_PLACEHOLDER = AVAILABLE_LABEL_FIELDS.reduce<Record<string, string>>(
  (acc, field) => {
    acc[field.placeholder] = field.example;
    return acc;
  },
  {}
);

export type LabelTemplateData = {
  imei?: string;
  sku?: string;
  model?: string;
  color?: string;
  capacity?: string;
  carrier?: string;
  batteryHealth?: string;
  cycleCount?: string;
  iosVersion?: string;
  grade?: string;
  condition?: string;
  comments?: string;
  price?: string;
  price2?: string;
  price3?: string;
  serialNumber?: string;
  registeredAt?: string;
  qrRaw?: string;
};

const formatDate = (value?: string, includeTime?: boolean) => {
  const source = value ? new Date(value) : new Date();
  if (Number.isNaN(source.getTime())) {
    return includeTime ? "2026-03-13 14:30" : "2026-03-13";
  }

  const yyyy = source.getFullYear();
  const mm = String(source.getMonth() + 1).padStart(2, "0");
  const dd = String(source.getDate()).padStart(2, "0");

  if (!includeTime) {
    return `${yyyy}-${mm}-${dd}`;
  }

  const hh = String(source.getHours()).padStart(2, "0");
  const min = String(source.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
};

const toTitleCase = (str: string) =>
  str.replace(/\b\w/g, (c) => c.toUpperCase());

const normalizeCapacity = (str: string) =>
  str.replace(/gb/gi, "GB");

const normalizeStr = (str: string) =>
  str.replace(/[\r\n]+/g, " ").replace(/  +/g, " ").trim();

export const buildLabelDataMap = (data: LabelTemplateData) => {
  const model = normalizeStr(data.model ?? "");
  const color = toTitleCase(normalizeStr(data.color ?? ""));
  const capacity = normalizeCapacity(normalizeStr(data.capacity ?? ""));
  const serialNumber = (data.serialNumber ?? "").toUpperCase();
  const normalizedSku = normalizeStr(data.sku ?? "").toUpperCase();
  const normalizedImei = normalizeStr(data.imei ?? "");
  const identifier = normalizedImei || serialNumber || normalizedSku;

  return {
    imei: identifier,
    sku: normalizedSku,
    device_model: model,
    model_color_capacity: [model, color, capacity].filter(Boolean).join(" "),
    capacity,
    color,
    carrier: normalizeStr(data.carrier ?? ""),
    battery_health: normalizeStr(data.batteryHealth ?? ""),
    cycle_count: normalizeStr(data.cycleCount ?? ""),
    ios_version: normalizeStr(data.iosVersion ?? ""),
    grade: data.grade ?? "",
    condition: data.condition ?? "",
    comments: data.comments ?? "",
    price: data.price ?? "",
    price2: data.price2 ?? "",
    price3: data.price3 ?? "",
    serial_number: serialNumber,
    registered_date: formatDate(data.registeredAt, false),
    printed_date: formatDate(undefined, false),
    printed_datetime: formatDate(undefined, true),
    url: data.qrRaw ?? "",
  };
};

export const replaceLabelPlaceholders = (input: string, data: LabelTemplateData) => {
  const map = buildLabelDataMap(data);
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => map[key as keyof typeof map] ?? "");
};

export const buildQrPayload = (
  data: LabelTemplateData,
  selectedFields?: string[],
  customText?: string
) => {
  const lines = (selectedFields ?? [])
    .map((placeholder) => replaceLabelPlaceholders(placeholder, data))
    .map((value) => value.trim())
    .filter(Boolean);

  const resolvedCustomText = (customText ?? "").trim()
    ? replaceLabelPlaceholders(customText ?? "", data).trim()
    : "";

  if (resolvedCustomText) {
    lines.push(resolvedCustomText);
  }

  if (lines.length > 0) {
    return lines.join(",");
  }

  return [
    replaceLabelPlaceholders("{{imei}}", data),
    replaceLabelPlaceholders("{{model_color_capacity}}", data),
  ]
    .filter(Boolean)
    .join(",");
};
