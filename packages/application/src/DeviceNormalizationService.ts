export class DeviceNormalizationService {
  normalizeCapacity(value: string): string {
    const trimmed = value.trim().toUpperCase();
    if (!trimmed) return "";
    const compact = trimmed.replace(/\s+/g, "");
    const parsed = compact.match(/^(\d+(?:\.\d+)?)(GB|TB)$/);
    if (parsed) return `${parsed[1]}${parsed[2]}`;
    const numericOnly = compact.match(/^(\d+(?:\.\d+)?)$/);
    if (numericOnly) return `${numericOnly[1]}GB`;
    return compact;
  }

  normalizeSerialNumber(serial: string): string {
    return serial.trim().toUpperCase();
  }

  normalizeImei(imei: string): string {
    return imei.replace(/\D/g, "").slice(0, 15);
  }

  resolveDeviceType(deviceName: string, availableTypes: Array<{ id: string; name: string }>): string {
    const lower = deviceName.toLowerCase();
    if (lower.includes("iphone") || lower.includes("phone")) {
      const match = availableTypes.find((t) => t.name.toLowerCase() === "phone") || availableTypes.find((t) => t.name.toLowerCase().includes("phone"));
      return match?.id ?? "";
    }
    if (lower.includes("ipad")) {
      const match = availableTypes.find((t) => t.name.toLowerCase() === "ipad") || availableTypes.find((t) => t.name.toLowerCase().includes("tablet"));
      return match?.id ?? "";
    }
    return "";
  }
}
