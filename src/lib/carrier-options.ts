const MAX_CARRIER_OPTIONS = 20;

export const defaultCarrierOptions = ["Unlocked", "AT&T", "Verizon", "T-Mobile", "Sprint"];

const normalizeCarrierComparable = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

export const normalizeCarrierOptions = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [...defaultCarrierOptions];
  }

  const normalized = Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
    )
  ).slice(0, MAX_CARRIER_OPTIONS);

  return normalized.length > 0 ? normalized : [...defaultCarrierOptions];
};

export const getDefaultCarrierOption = (options: readonly string[]): string => {
  if (options.length === 0) return "";

  const unlockedOption = options.find((option) => /unlocked/i.test(option));
  return unlockedOption ?? options[0];
};

export const resolveCarrierOption = (value: string, options: readonly string[]): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return getDefaultCarrierOption(options);
  }

  if (/unlocked/i.test(trimmed)) {
    const unlockedOption = options.find((option) => /unlocked/i.test(option));
    return unlockedOption ?? "Unlocked";
  }

  const comparable = normalizeCarrierComparable(trimmed);
  const directMatch = options.find((option) => normalizeCarrierComparable(option) === comparable);
  if (directMatch) {
    return directMatch;
  }

  return trimmed;
};

export async function fetchCarrierOptions(): Promise<string[]> {
  const response = await fetch("/api/org/carriers", { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Failed to load carriers.");
  }

  return normalizeCarrierOptions(payload?.options);
}

export async function saveCarrierOptions(options: string[]): Promise<string[]> {
  const response = await fetch("/api/org/carriers", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ options }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Failed to save carriers.");
  }

  return normalizeCarrierOptions(payload?.options);
}
