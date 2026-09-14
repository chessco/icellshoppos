// TypeScript: Extend window and global types for debug logging
declare global {
  interface Window {
    __qrDebug?: any[];
    __qrDebugWarned?: boolean;
  }
  // For Node.js global
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Global {
      __qrDebug?: any[];
      __qrDebugWarned?: boolean;
    }
  }
}
export type QrScanData = {
  imei: string;
  model: string;
  color: string;
  capacity: string;
  batteryHealth: string;
  cycleCount: string;
  iosVersion: string;
  serialNumber: string;
  date: string;
  raw: string;
};

const colorCandidates = [
  "Cosmic Orange",
  "Pink",
  "Deep Purple",
  "Desert Titanium",
  "Natural Titanium",
  "Blue Titanium",
  "White Titanium",
  "Black Titanium",
  "Pacific Blue",
  "Sierra Blue",
  "Graphite",
  "Midnight",
  "Starlight",
  "Space Black",
  "Space Gray",
  "Silver",
  "Gold",
  "Purple",
  "Blue",
  "Green",
  "Yellow",
  "White",
  "Black",
  "Red",
];

const sortedColors = [...colorCandidates].sort(
  (a, b) => b.length - a.length
);

const normalizeSpaces = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const splitQrParts = (raw: string) => {
  const delimiters = [",", ";", "\t"];
  for (const delimiter of delimiters) {
    const parts = raw.split(delimiter).map((part) => part.trim());
    if (parts.length >= 6) {
      return parts;
    }
  }
  return raw.split(",").map((part) => part.trim());
};

const extractImei = (candidate: string, raw: string) => {
  const trimmed = candidate.trim();
  const match = trimmed.match(/^(\d+)/);  if (!match) return trimmed;
  
  const leadingDigits = match[1];
  if (leadingDigits.length >= 15) {
    return leadingDigits.slice(0, 15);
  }
  
  const allDigits = trimmed.replace(/\D/g, "");
  if (allDigits.length >= 15) {
    return allDigits.slice(0, 15);
  }
  
  return trimmed;
};

const parsePercent = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const match = trimmed.match(/(?:\d+\.\d+|\d+|\.\d+)/);
  if (!match) return trimmed;

  let numeric = Number(match[0]);
  if (!Number.isFinite(numeric)) return trimmed;

  if (numeric > 0 && numeric < 1) {
    numeric *= 100;
  }

  const normalized = Number.isInteger(numeric)
    ? String(numeric)
    : String(Number(numeric.toFixed(2)));

  return `${normalized}%`;
};

const parseCapacity = (value: string) => {
  const match = value.match(/(\d+)\s*GB/i);
  if (!match) return "";
  return `${match[1]}GB`;
};

const parseModelColorCapacity = (value: string) => {
  const capacity = parseCapacity(value);
  let working = value;
  if (capacity) {
    working = normalizeSpaces(
      working.replace(new RegExp(capacity, "i"), "")
    );
  }

  let color = "";
  let model = normalizeSpaces(working);

  for (const candidate of sortedColors) {
    const lower = model.toLowerCase();
    const candidateLower = candidate.toLowerCase();
    if (lower.endsWith(candidateLower)) {
      color = candidate;
      model = normalizeSpaces(
        model.slice(0, model.length - candidate.length)
      );
      break;
    }
  }

  // DEBUG LOG (limit to 10 logs)
  if (typeof window !== 'undefined') {
    // @ts-ignore
    window.__qrDebug = window.__qrDebug || [];
    // @ts-ignore
    if (window.__qrDebug.length < 10) {
      window.__qrDebug.push({ fn: 'parseModelColorCapacity', input: value, model, color, capacity });
    } else if (!window.__qrDebugWarned) {
      window.__qrDebugWarned = true;
      // @ts-ignore
      console.warn('parseModelColorCapacity: log limit reached, further logs suppressed');
    }
  } else if (typeof global !== 'undefined') {
    const g: any = global;
    g.__qrDebug = g.__qrDebug || [];
    if (g.__qrDebug.length < 10) {
      g.__qrDebug.push({ fn: 'parseModelColorCapacity', input: value, model, color, capacity });
    } else if (!g.__qrDebugWarned) {
      g.__qrDebugWarned = true;
      console.warn('parseModelColorCapacity: log limit reached, further logs suppressed');
    }
  }

  return { model, color, capacity };
};

export const parseQrLine = (line: string): QrScanData | null => {
  const raw = line.trim();
  if (!raw) return null;
  const parts = splitQrParts(raw);
  if (parts.length < 6) return null;

  const imeiRaw = parts[0] ?? "";
  const modelColorCapacity = parts[1] ?? "";
  const batteryHealthRaw = parts[2] ?? "";
  const cycleCountRaw = parts[3] ?? "";
  const iosVersionRaw = parts[4] ?? "";
  const serialNumberRaw = parts[5] ?? "";

  const { model, color, capacity } = parseModelColorCapacity(
    modelColorCapacity
  );

  // DEBUG LOG (limit to 10 logs)
  if (typeof window !== 'undefined') {
    // @ts-ignore
    window.__qrDebug = window.__qrDebug || [];
    // @ts-ignore
    if (window.__qrDebug.length < 10) {
      window.__qrDebug.push({ fn: 'parseQrLine', raw, parts, imeiRaw, modelColorCapacity, batteryHealthRaw, cycleCountRaw, iosVersionRaw, serialNumberRaw, model, color, capacity });
      // Also print to console for immediate feedback
      // @ts-ignore
      console.log('parseQrLine:', { raw, parts, imeiRaw, modelColorCapacity, batteryHealthRaw, cycleCountRaw, iosVersionRaw, serialNumberRaw, model, color, capacity });
    } else if (!window.__qrDebugWarned) {
      window.__qrDebugWarned = true;
      // @ts-ignore
      console.warn('parseQrLine: log limit reached, further logs suppressed');
    }
  } else if (typeof global !== 'undefined') {
    const g: any = global;
    g.__qrDebug = g.__qrDebug || [];
    if (g.__qrDebug.length < 10) {
      g.__qrDebug.push({ fn: 'parseQrLine', raw, parts, imeiRaw, modelColorCapacity, batteryHealthRaw, cycleCountRaw, iosVersionRaw, serialNumberRaw, model, color, capacity });
      console.log('parseQrLine:', { raw, parts, imeiRaw, modelColorCapacity, batteryHealthRaw, cycleCountRaw, iosVersionRaw, serialNumberRaw, model, color, capacity });
    } else if (!g.__qrDebugWarned) {
      g.__qrDebugWarned = true;
      console.warn('parseQrLine: log limit reached, further logs suppressed');
    }
  }

  return {
    imei: extractImei(imeiRaw, raw),
    model,
    color,
    capacity,
    batteryHealth: parsePercent(batteryHealthRaw),
    cycleCount: cycleCountRaw.trim(),
    iosVersion: iosVersionRaw.trim(),
    serialNumber: serialNumberRaw.trim(),
    date: "",
    raw,
  };
};
