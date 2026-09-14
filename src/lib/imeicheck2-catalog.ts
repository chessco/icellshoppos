export type ImeiCheck2CatalogItem = {
  service_id: number;
  service_name: string;
};

export type ImeiCheck2PricingRow = {
  service_id: number;
  price: number | null;
  currency: string | null;
  active: boolean;
};

export const IMEICHECK2_SERVICE_CATALOG: ImeiCheck2CatalogItem[] = [
  { service_id: 1, service_name: "Find My iPhone [ FMI ] (ON/OFF)" },
  { service_id: 2, service_name: "Warranty + Activation - Apple [IMEI/SN]" },
  { service_id: 3, service_name: "Apple FULL INFO [No Carrier]" },
  { service_id: 4, service_name: "iCloud Clean/Lost Check" },
  { service_id: 5, service_name: "Blacklist Status (GSMA)" },
  { service_id: 6, service_name: "Blacklist Pro Check (GSMA) -with history" },
  { service_id: 8, service_name: "Samsung Info (S1) (IMEI)" },
  { service_id: 9, service_name: "SOLD BY + GSX" },
  { service_id: 10, service_name: "IMEI to Model [all brands][IMEI/SN]" },
  { service_id: 11, service_name: "IMEI to Brand/Model/Name" },
  { service_id: 12, service_name: "GSX Next Tether + iOS (GSX Carrier)" },
  { service_id: 13, service_name: "Model + Color + Storage + FMI" },
  { service_id: 14, service_name: "IMEI to SN (Full Convertor)" },
  { service_id: 15, service_name: "T-mobile (ESN) PRO Check" },
  { service_id: 16, service_name: "Verizon (ESN) Clean/Lost Status" },
  { service_id: 17, service_name: "Huawei IMEI Info" },
  { service_id: 18, service_name: "iMac FMI Status On/Off" },
  { service_id: 19, service_name: "Apple FULL INFO [+Carrier] B" },
  { service_id: 20, service_name: "Apple SimLock Check" },
  { service_id: 21, service_name: "SAMSUNG INFO & KNOX GUARD (S2)" },
  { service_id: 22, service_name: "Apple BASIC INFO (PRO) - new" },
  { service_id: 23, service_name: "Apple Carrier Check (S2)" },
  { service_id: 25, service_name: "XIAOMI MI LOCK & INFO" },
  { service_id: 27, service_name: "ONEPLUS IMEI INFO" },
  { service_id: 33, service_name: "Replacement Status (Active Device)" },
  { service_id: 34, service_name: "Replaced Status (Original Device)" },
  { service_id: 36, service_name: "Samsung Info (S1) + Blacklist" },
  { service_id: 37, service_name: "Samsung Info & KNOX GUARD (S1)" },
  { service_id: 39, service_name: "APPLE FULL INFO [+Carrier] A" },
  { service_id: 41, service_name: "MDM Status ON/OFF + Fmi + ModelDesc" },
  { service_id: 46, service_name: "MDM Status ON/OFF + GSX Policy + FMI" },
  { service_id: 47, service_name: "Apple FULL + MDM + GSMA PRO" },
  { service_id: 50, service_name: "Apple SERIAL Info(model,size,color)" },
  { service_id: 51, service_name: "Warranty + Activation - Apple [SN]" },
  { service_id: 52, service_name: "Apple Model Description (Model, Color, Size)" },
  { service_id: 55, service_name: "Blacklist Status - cheap" },
  { service_id: 57, service_name: "Google Pixel Info" },
  { service_id: 58, service_name: "Honor Info" },
  { service_id: 61, service_name: "Apple Demo Unit Device Info" },
  { service_id: 62, service_name: "EID INFO (IMEI TO EID)" },
  { service_id: 63, service_name: "Motorola Info" },
  { service_id: 64, service_name: "Model Description + MPN+ FMI" },
  { service_id: 67, service_name: "Apple Warranty Pro +Activation [IMEI/SN]" },
  { service_id: 69, service_name: "Apple Info Custom + Carrier V2 (IMEI/SN)" },
  { service_id: 71, service_name: "Apple IMEI Pair Lookup (IMEI1+IMEI2)" },
  { service_id: 72, service_name: "Google Pixel Info + Warranty (S2)" },
];

export function normalizePricingRows(raw: unknown): ImeiCheck2PricingRow[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((value) => {
      const row = value as Record<string, unknown>;
      const serviceId = Number(row.service_id ?? row.id ?? 0);
      const priceValue = Number(row.price);
      const currency = String(row.currency ?? "").trim() || null;
      const activeRaw = row.active;
      const active = typeof activeRaw === "boolean" ? activeRaw : true;

      return {
        service_id: serviceId,
        price: Number.isFinite(priceValue) ? priceValue : null,
        currency,
        active,
      } satisfies ImeiCheck2PricingRow;
    })
    .filter((row) => row.service_id > 0);
}

export function mergeCatalogWithPricing(pricingRows: ImeiCheck2PricingRow[]) {
  const byServiceId = new Map<number, ImeiCheck2PricingRow>();
  for (const row of pricingRows) {
    byServiceId.set(row.service_id, row);
  }

  return IMEICHECK2_SERVICE_CATALOG.map((service) => {
    const priceRow = byServiceId.get(service.service_id);
    return {
      service_id: service.service_id,
      service_name: service.service_name,
      price: priceRow?.price ?? null,
      currency: priceRow?.currency ?? null,
      active: priceRow?.active ?? false,
    };
  });
}
