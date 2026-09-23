import type { IInventoryListItem } from "@ireader/contracts";

export interface AppleColorSwatch {
  name: string;
  hex: string;
  count: number;
}

export type AppleSeriesCategory =
  | "bestsellers"
  | "series_17_16"
  | "series_15"
  | "series_14"
  | "series_13_12"
  | "series_se_older"
  | "all_iphone"
  | "other";

export interface AppleModelGroup {
  modelKey: string;
  modelName: string;
  deviceType: "iphone" | "ipad" | "mac" | "watch" | "other";
  series: AppleSeriesCategory;
  minPrice: number;
  maxPrice: number;
  totalAvailable: number;
  isBestseller: boolean;
  bestsellerBadgeText?: string;
  colors: AppleColorSwatch[];
  capacities: string[];
  items: IInventoryListItem[];
}

/**
 * Mapeo de colores comerciales de Apple a códigos hexadecimales oficiales
 */
export const APPLE_COLOR_MAP: Record<string, string> = {
  // Titanio iPhone 15/16/17
  "cosmic orange": "#ff7733",
  "deep blue": "#1a3b5c",
  "ultramarine": "#384cb3",
  "titanio natural": "#9e988d",
  "natural titanium": "#9e988d",
  "natural": "#9e988d",
  "titanio negro": "#2b2a29",
  "black titanium": "#2b2a29",
  "titanio blanco": "#e3e4e6",
  "white titanium": "#e3e4e6",
  "titanio azul": "#2f3f50",
  "blue titanium": "#2f3f50",
  "desierto": "#c4ab8c",
  "desert titanium": "#c4ab8c",

  // Colores estándar
  "negro": "#1f2022",
  "black": "#1f2022",
  "jet black": "#0a0a0a",
  "space black": "#1f2022",
  "blanco": "#f5f5f7",
  "white": "#f5f5f7",
  "silver": "#e3e4e6",
  "plata": "#e3e4e6",
  "gris espacial": "#4b4d52",
  "space gray": "#4b4d52",
  "space grey": "#4b4d52",
  "azul": "#3b536b",
  "blue": "#3b536b",
  "sierra blue": "#69899e",
  "pacific blue": "#2d4b5a",
  "midnight": "#181f2a",
  "medianoche": "#181f2a",
  "oro": "#f4e8ce",
  "gold": "#f4e8ce",
  "rojo": "#ba0c2e",
  "red": "#ba0c2e",
  "(product)red": "#ba0c2e",
  "morado": "#5e4d66",
  "purple": "#5e4d66",
  "deep purple": "#3b2b40",
  "verde": "#43594b",
  "green": "#43594b",
  "new green": "#3c754d",
  "alpine green": "#3e4f43",
  "new alpine green": "#3e4f43",
  "rosa": "#fad4da",
  "pink": "#fad4da",
  "amarillo": "#f9e784",
  "yellow": "#f9e784",
  "starlight": "#f0ece1",
  "blanco estelar": "#f0ece1",
};

export function resolveAppleColorHex(colorName: string | null | undefined): string {
  if (!colorName) return "#64748b";
  const normalized = colorName.toLowerCase().trim();
  for (const [key, hex] of Object.entries(APPLE_COLOR_MAP)) {
    if (normalized.includes(key)) {
      return hex;
    }
  }
  return "#64748b";
}

/**
 * Catálogo canónico de modelos oficiales de Apple (ordenados de más específicos a más generales)
 */
const CANONICAL_APPLE_MODELS = [
  // iPhone 17
  "iPhone 17 Pro Max", "iPhone 17 Pro", "iPhone 17 Plus", "iPhone 17",
  // iPhone 16
  "iPhone 16 Pro Max", "iPhone 16 Pro", "iPhone 16 Plus", "iPhone 16e", "iPhone 16",
  // iPhone 15
  "iPhone 15 Pro Max", "iPhone 15 Pro", "iPhone 15 Plus", "iPhone 15",
  // iPhone 14
  "iPhone 14 Pro Max", "iPhone 14 Pro", "iPhone 14 Plus", "iPhone 14",
  // iPhone 13
  "iPhone 13 Pro Max", "iPhone 13 Pro", "iPhone 13 mini", "iPhone 13",
  // iPhone 12
  "iPhone 12 Pro Max", "iPhone 12 Pro", "iPhone 12 mini", "iPhone 12",
  // iPhone 11
  "iPhone 11 Pro Max", "iPhone 11 Pro", "iPhone 11",
  // iPhone X / XS / XR
  "iPhone XS Max", "iPhone XS", "iPhone XR", "iPhone X",
  // iPhone SE
  "iPhone SE 3", "iPhone SE 2", "iPhone SE (3rd gen)", "iPhone SE (2nd gen)", "iPhone SE",
  // iPhone 8 / 7 / 6
  "iPhone 8 Plus", "iPhone 8", "iPhone 7 Plus", "iPhone 7", "iPhone 6s Plus", "iPhone 6s", "iPhone 6 Plus", "iPhone 6",
  // iPad
  "iPad Pro 12.9", "iPad Pro 11", "iPad Pro", "iPad Air 5", "iPad Air 4", "iPad Air", "iPad mini 6", "iPad mini 5", "iPad mini",
  "iPad 11", "iPad 10", "iPad 9", "iPad 8", "iPad 7", "iPad",
  // Mac
  "MacBook Pro 16", "MacBook Pro 14", "MacBook Pro 13", "MacBook Pro", "MacBook Air 15", "MacBook Air 13", "MacBook Air",
  "iMac 24", "iMac", "Mac mini", "Mac Studio",
  // Apple Watch
  "Apple Watch Ultra 2", "Apple Watch Ultra", "Apple Watch Series 11", "Apple Watch Series 10", "Apple Watch Series 9", "Apple Watch Series 8", "Apple Watch Series 7",
  "Apple Watch SE", "Apple Watch",
];

/**
 * Normaliza nombres especiales de modelos como "iPhone 15+ (Plus)" -> "iPhone 15 Plus"
 */
function normalizeModelSpecialCases(raw: string): string {
  let s = raw;
  if (/iphone\s*15\s*\+\s*\(plus\)/i.test(s) || /iphone\s*15\s*\+/i.test(s)) {
    s = s.replace(/iphone\s*15\s*(\+\s*\(plus\)|\+)/i, "iPhone 15 Plus");
  }
  if (/iphone\s*se\s*\(3rd\s*gen\)/i.test(s)) {
    s = s.replace(/iphone\s*se\s*\(3rd\s*gen\)/i, "iPhone SE 3");
  }
  if (/iphone\s*se\s*\(2nd\s*gen\)/i.test(s)) {
    s = s.replace(/iphone\s*se\s*\(2nd\s*gen\)/i, "iPhone SE 2");
  }
  return s;
}

/**
 * Extrae de forma inteligente el modelo base comercial puro a partir de strings concatenados
 * Ej: "iPhone 14 128GB Midnight Telcel" -> "iPhone 14"
 */
export function extractAppleBaseModel(rawModel: string): string {
  const normalized = normalizeModelSpecialCases(rawModel.trim());
  const lower = normalized.toLowerCase();

  // 1. Buscar coincidencia exacta con modelos canónicos
  for (const model of CANONICAL_APPLE_MODELS) {
    if (lower.includes(model.toLowerCase())) {
      // Normalizar nombres equivalentes
      if (model.toLowerCase().includes("iphone se (3rd gen)")) return "iPhone SE 3";
      if (model.toLowerCase().includes("iphone se (2nd gen)")) return "iPhone SE 2";
      return model;
    }
  }

  // 2. Limpieza heurística de capacidades y sufijos comunes si no coincidió
  let cleaned = normalized
    .replace(/\b\d+\s*(gb|tb)\b/gi, "")
    .replace(/\b(unlocked|telcel|at&t|movistar|verizon|t-mobile)\b/gi, "")
    .replace(/\b(grado\s*[abc]|grade\s*[abc]|used|usado|nuevo|new|open\s*box)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || normalized;
}

/**
 * Extrae la capacidad si está presente en el string del modelo
 */
export function extractCapacityFromModel(rawModel: string): string | null {
  const match = rawModel.match(/\b(\d+)\s*(GB|TB)\b/i);
  if (match) {
    return `${match[1]}${match[2].toUpperCase()}`;
  }
  return null;
}

/**
 * Determina a qué serie de iPhone o familia pertenece un modelo (máximo 3-4 modelos por serie)
 */
export function detectAppleSeries(modelName: string): AppleSeriesCategory {
  const m = modelName.toLowerCase();
  if (m.includes("iphone 17") || m.includes("iphone 16")) return "series_17_16";
  if (m.includes("iphone 15")) return "series_15";
  if (m.includes("iphone 14")) return "series_14";
  if (m.includes("iphone 13") || m.includes("iphone 12")) return "series_13_12";
  if (
    m.includes("iphone 11") ||
    m.includes("iphone se") ||
    m.includes("iphone x") ||
    m.includes("iphone 8") ||
    m.includes("iphone 7") ||
    m.includes("iphone 6")
  ) {
    return "series_se_older";
  }
  if (m.includes("iphone")) return "all_iphone";
  return "other";
}

/**
 * Modelos top flagship estrictos para el catálogo inicial de Alta Rotación
 */
const BESTSELLER_MODELS = new Set([
  "iPhone 16 Pro Max",
  "iPhone 16 Pro",
  "iPhone 16",
  "iPhone 15 Pro Max",
  "iPhone 15 Pro",
  "iPhone 15",
]);

/**
 * Calcula un puntaje de popularidad comercial estricto para los Top Bestsellers (solo 4-6 modelos tops)
 */
function getBestsellerScore(modelName: string): { score: number; isBestseller: boolean; badge?: string } {
  const isBestseller = BESTSELLER_MODELS.has(modelName);
  const m = modelName.toLowerCase();

  let badge: string | undefined;
  if (m.includes("16 pro")) badge = "NUEVO TOP";
  else if (m.includes("16")) badge = "NUEVO";
  else if (m.includes("15 pro")) badge = "⭐ MÁS VENDIDO";
  else if (m.includes("15")) badge = "⭐ MÁS VENDIDO";

  let score = 100;
  if (m.includes("iphone 17")) score = 950;
  else if (m.includes("iphone 16 pro")) score = 940;
  else if (m.includes("iphone 16")) score = 930;
  else if (m.includes("iphone 15 pro max")) score = 920;
  else if (m.includes("iphone 15 pro")) score = 910;
  else if (m.includes("iphone 15")) score = 900;
  else if (m.includes("iphone 14 pro")) score = 850;
  else if (m.includes("iphone 14")) score = 820;
  else if (m.includes("iphone 13")) score = 750;
  else if (m.includes("iphone 12")) score = 650;
  else if (m.includes("iphone se")) score = 600;
  else if (m.includes("iphone 11")) score = 550;
  else if (m.includes("ipad")) score = 400;
  else if (m.includes("mac")) score = 300;
  else if (m.includes("watch")) score = 200;

  return { score, isBestseller, badge };
}

function detectDeviceType(modelName: string): "iphone" | "ipad" | "mac" | "watch" | "other" {
  const m = modelName.toLowerCase();
  if (m.includes("iphone")) return "iphone";
  if (m.includes("ipad")) return "ipad";
  if (m.includes("mac") || m.includes("imac") || m.includes("book")) return "mac";
  if (m.includes("watch")) return "watch";
  return "other";
}

/**
 * Agrupa una lista plana de inventario físico en grupos maestros por modelo al estilo Apple Store.
 * Consolida todas las unidades físicas (IMEIs) con nombres concatenados en sus modelos comerciales puros.
 */
export function groupInventoryByAppleModel(items: IInventoryListItem[]): AppleModelGroup[] {
  if (!items || !Array.isArray(items)) return [];
  const groupsMap = new Map<string, { baseModel: string; items: IInventoryListItem[] }>();

  for (const item of items) {
    if (!item) continue;
    const rawModel = item.model?.trim() || "Dispositivo";
    const baseModel = extractAppleBaseModel(rawModel);
    if (!baseModel) continue;
    const key = baseModel.toLowerCase().trim();
    if (!key) continue;

    // Normalizar item internamente si le faltaba capacidad en su propiedad directa
    if (!item.capacity) {
      const extractedCap = extractCapacityFromModel(rawModel);
      if (extractedCap) {
        (item as { capacity?: string }).capacity = extractedCap;
      }
    }

    const existing = groupsMap.get(key) || { baseModel, items: [] };
    existing.items.push(item);
    groupsMap.set(key, existing);
  }

  const result: AppleModelGroup[] = [];

  for (const [modelKey, { baseModel, items: groupItems }] of groupsMap.entries()) {
    if (!groupItems || groupItems.length === 0) continue;
    const first = groupItems[0];
    if (!first) continue;
    const modelName = baseModel;
    const { score, isBestseller, badge } = getBestsellerScore(modelName);

    // Calcular rango de precios
    let minPrice = Number(first.price) || 0;
    let maxPrice = Number(first.price) || 0;

    // Calcular colores únicos
    const colorCountMap = new Map<string, number>();
    const capacitySet = new Set<string>();

    for (const it of groupItems) {
      const priceNum = Number(it.price) || 0;
      if (priceNum < minPrice) minPrice = priceNum;
      if (priceNum > maxPrice) maxPrice = priceNum;

      const colName = (it.color || "Estándar").trim();
      colorCountMap.set(colName, (colorCountMap.get(colName) || 0) + 1);

      if (it.capacity) {
        capacitySet.add(it.capacity.trim());
      }
    }

    const colors: AppleColorSwatch[] = Array.from(colorCountMap.entries()).map(([name, count]) => ({
      name,
      hex: resolveAppleColorHex(name),
      count,
    }));

    const capacities = Array.from(capacitySet).sort((a, b) => {
      const numA = parseInt(a, 10) * (a.toLowerCase().includes("tb") ? 1024 : 1);
      const numB = parseInt(b, 10) * (b.toLowerCase().includes("tb") ? 1024 : 1);
      return numA - numB;
    });

    result.push({
      modelKey,
      modelName,
      deviceType: detectDeviceType(modelName),
      series: detectAppleSeries(modelName),
      minPrice,
      maxPrice,
      totalAvailable: groupItems.length,
      isBestseller,
      bestsellerBadgeText: badge,
      colors,
      capacities,
      items: groupItems,
    });
  }

  // Ordenar de mayor popularidad y menor generación
  return result.sort((a, b) => {
    const scoreA = getBestsellerScore(a.modelName).score;
    const scoreB = getBestsellerScore(b.modelName).score;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return b.totalAvailable - a.totalAvailable;
  });
}
