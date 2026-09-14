export type ModelCatalogEntry = {
  capacities: string[];
  colors: string[];
  deviceTypeId?: string;
};

export type ModelCatalog = Record<string, ModelCatalogEntry>;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const sanitizeModelCatalog = (value: unknown): ModelCatalog | null => {
  if (!value || typeof value !== "object") return null;

  const sanitizedEntries = Object.entries(value as Record<string, unknown>).reduce<ModelCatalog>(
    (accumulator, [modelName, entry]) => {
      if (!entry || typeof entry !== "object") return accumulator;

      const capacities = (entry as { capacities?: unknown }).capacities;
      const colors = (entry as { colors?: unknown }).colors;

      if (!isStringArray(capacities) || !isStringArray(colors)) {
        return accumulator;
      }

      const deviceTypeId = (entry as { deviceTypeId?: unknown }).deviceTypeId;
      accumulator[modelName] = {
        capacities: [...capacities],
        colors: [...colors],
        ...(typeof deviceTypeId === "string" && deviceTypeId ? { deviceTypeId } : {}),
      };

      return accumulator;
    },
    {}
  );

  if (Object.keys(sanitizedEntries).length === 0) return null;
  return sanitizedEntries;
};

export const normalizeModelCatalog = (value: unknown): ModelCatalog =>
  sanitizeModelCatalog(value) ?? { ...defaultModelCatalog };

export const defaultModelCatalog: ModelCatalog = {
  "iPhone 11": {
    capacities: ["64GB", "256GB", "512GB"],
    colors: ["Purple", "Yellow", "Green", "Black", "White", "Red"],
  },
  "iPhone 11 Pro": {
    capacities: ["64GB", "256GB", "512GB"],
    colors: ["Space Gray", "Silver", "Gold", "Midnight Green"],
  },
  "iPhone 11 Pro Max": {
    capacities: ["64GB", "256GB", "512GB"],
    colors: ["Space Gray", "Silver", "Gold", "Midnight Green"],
  },
  "iPhone 12": {
    capacities: ["64GB", "128GB", "256GB"],
    colors: ["Black", "White", "Blue", "Green", "Red", "Purple"],
  },
  "iPhone 12 mini": {
    capacities: ["64GB", "128GB", "256GB"],
    colors: ["Black", "White", "Blue", "Green", "Red", "Purple"],
  },
  "iPhone 12 Pro": {
    capacities: ["128GB", "256GB", "512GB"],
    colors: ["Graphite", "Silver", "Gold", "Pacific Blue"],
  },
  "iPhone 12 Pro Max": {
    capacities: ["128GB", "256GB", "512GB"],
    colors: ["Graphite", "Silver", "Gold", "Pacific Blue"],
  },
  "iPhone 13": {
    capacities: ["128GB", "256GB", "512GB"],
    colors: ["Midnight", "Starlight", "Blue", "Pink", "Red", "New Green"],
  },
  "iPhone 13 Pro": {
    capacities: ["128GB", "256GB", "512GB", "1TB"],
    colors: ["Graphite", "Gold", "Silver", "Sierra Blue", "New Alpine Green"],
  },
  "iPhone 13 Pro Max": {
    capacities: ["128GB", "256GB", "512GB", "1TB"],
    colors: ["Graphite", "Gold", "Silver", "Sierra Blue", "New Alpine Green"],
  },
  "iPhone 14": {
    capacities: ["128GB", "256GB", "512GB"],
    colors: ["Midnight", "Starlight", "Blue", "Purple", "Red", "Yellow"],
  },
  "iPhone 14 Plus": {
    capacities: ["128GB", "256GB", "512GB"],
    colors: ["Midnight", "Starlight", "Blue", "Purple", "Red", "Yellow"],
  },
  "iPhone 14 Pro": {
    capacities: ["128GB", "256GB", "512GB", "1TB"],
    colors: ["Space Black", "Silver", "Gold", "Deep Purple"],
  },
  "iPhone 14 Pro Max": {
    capacities: ["128GB", "256GB", "512GB", "1TB"],
    colors: ["Space Black", "Silver", "Gold", "Deep Purple"],
  },
  "iPhone 15": {
    capacities: ["128GB", "256GB", "512GB"],
    colors: ["Black", "Blue", "Green", "Yellow", "Pink"],
  },
  "iPhone 15 Plus": {
    capacities: ["128GB", "256GB", "512GB"],
    colors: ["Black", "Blue", "Green", "Yellow", "Pink"],
  },
  "iPhone 15 Pro": {
    capacities: ["128GB", "256GB", "512GB", "1TB"],
    colors: ["Black Titanium", "White Titanium", "Blue Titanium", "Natural Titanium"],
  },
  "iPhone 15 Pro Max": {
    capacities: ["256GB", "512GB", "1TB"],
    colors: ["Black Titanium", "White Titanium", "Blue Titanium", "Natural Titanium"],
  },
  "iPhone 16": {
    capacities: ["128GB", "256GB", "512GB"],
    colors: ["Black", "White", "Pink", "Teal", "Ultramarine"],
  },
  "iPhone 16 Plus": {
    capacities: ["128GB", "256GB", "512GB"],
    colors: ["Black", "White", "Pink", "Teal", "Ultramarine"],
  },
  "iPhone 16 Pro": {
    capacities: ["128GB", "256GB", "512GB", "1TB"],
    colors: ["Black Titanium", "White Titanium", "Natural Titanium", "Desert Titanium"],
  },
  "iPhone 16 Pro Max": {
    capacities: ["256GB", "512GB", "1TB"],
    colors: ["Black Titanium", "White Titanium", "Natural Titanium", "Desert Titanium"],
  },
  "iPhone 17": {
    capacities: ["256GB", "512GB", "1TB"],
    colors: ["Black", "White", "Lavender", "Mist Blue", "Sage"],
  },
  "iPhone 17 Air": {
    capacities: ["256GB", "512GB", "1TB"],
    colors: ["Space Black", "Cloud White", "Light Gold", "Sky Blue"],
  },
  "iPhone 17 Pro": {
    capacities: ["256GB", "512GB", "1TB", "2TB"],
    colors: ["Silver", "Deep Blue", "Cosmic Orange"],
  },
  "iPhone 17 Pro Max": {
    capacities: ["256GB", "512GB", "1TB", "2TB"],
    colors: ["Silver", "Deep Blue", "Cosmic Orange"],
  },
};

export const MODEL_CATALOG_STORAGE_KEY = "modelCatalogV1";
export const MODEL_CATALOG_UPDATED_EVENT = "model-catalog-updated";

export const loadModelCatalog = (): ModelCatalog => {
  if (typeof window === "undefined") return defaultModelCatalog;
  try {
    const raw = window.localStorage.getItem(MODEL_CATALOG_STORAGE_KEY);
    if (!raw) return defaultModelCatalog;
    const parsed = JSON.parse(raw);
    return normalizeModelCatalog(parsed);
  } catch {
    return defaultModelCatalog;
  }
};

export const saveModelCatalog = (catalog: ModelCatalog) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MODEL_CATALOG_STORAGE_KEY, JSON.stringify(catalog));
    window.dispatchEvent(new Event(MODEL_CATALOG_UPDATED_EVENT));
  } catch {
    return;
  }
};

export async function fetchModelCatalog(): Promise<ModelCatalog> {
  try {
    const response = await fetch("/api/org/model-catalog", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(typeof payload?.error === "string" ? payload.error : "Failed to load model catalog.");
    }

    const catalog = normalizeModelCatalog(payload?.catalog);
    saveModelCatalog(catalog);
    return catalog;
  } catch {
    return loadModelCatalog();
  }
}

export async function saveModelCatalogRemote(catalog: ModelCatalog): Promise<ModelCatalog> {
  const normalized = normalizeModelCatalog(catalog);

  const response = await fetch("/api/org/model-catalog", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ catalog: normalized }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Failed to save model catalog.");
  }

  const persisted = normalizeModelCatalog(payload?.catalog);
  saveModelCatalog(persisted);
  return persisted;
}
